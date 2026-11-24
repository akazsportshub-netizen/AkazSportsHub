import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { apiError, errorMessage } from '../common/api-error';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DatabaseService } from '../database/database.service';
import { EMAIL_SENDER, EmailSender } from '../notifications/email';
import { Locale, toLocale } from '../notifications/templates';
import { RateLimiter } from '../users/rate-limit';
import { emailHashKey, emailOtpMessage } from './email';
import { OTP_MAX_ATTEMPTS, OTP_MAX_REQUESTS, OTP_REQUEST_WINDOW_MINUTES, OTP_TTL_SECONDS, codeMatches, generateCode, hashCode } from './otp';
import { ACCESS_TOKEN_SECONDS } from './refresh';
import { RefreshService } from './refresh.service';

interface SignedInUser {
  id: string;
  full_name: string;
  country_code: string;
  locale: string;
  email: string | null;
  phone_e164: string | null;
  is_active?: boolean;
  roles: string[];
}

/** Sign-in with a code sent by email. Works like the phone codes, with the address as the account key. */
@Injectable()
export class EmailLoginService {
  private readonly logger = new Logger(EmailLoginService.name);
  private readonly byIp = new RateLimiter(20, 10 * 60_000);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    private readonly refreshTokens: RefreshService,
  ) {}

  /** The answer is the same whether or not the address has an account. */
  async requestCode(email: string, ip: string, locale?: Locale): Promise<{ sent: true; expires_in: number }> {
    if (!this.byIp.allow(ip)) throw this.tooMany();

    const [{ recent }] = await this.db.query<{ recent: number }>(
      /* sql */ `
      SELECT count(*)::int AS recent FROM email_login_codes
       WHERE email = $1 AND created_at > now() - make_interval(mins => $2::int)`,
      [email, OTP_REQUEST_WINDOW_MINUTES],
    );
    if (recent >= OTP_MAX_REQUESTS) throw this.tooMany();

    const [account] = await this.db.query<{ locale: string; is_active: boolean }>(
      /* sql */ `SELECT locale, is_active FROM users WHERE lower(email) = $1`,
      [email],
    );
    // A switched-off account gets no code, but the same answer.
    if (account && !account.is_active) return { sent: true, expires_in: OTP_TTL_SECONDS };

    const code = generateCode();
    await this.db.query(
      /* sql */ `
      INSERT INTO email_login_codes (email, code_hash, expires_at)
      VALUES ($1, $2, now() + make_interval(secs => $3::int))`,
      [email, hashCode(code, emailHashKey(email), this.config.jwtSecret), OTP_TTL_SECONDS],
    );
    const message = emailOtpMessage(code, account ? toLocale(account.locale) : (locale ?? 'en'));
    try {
      await this.sender.send(email, message.subject, message.text);
    } catch (error) {
      this.logger.error(`Could not send a sign-in email: ${errorMessage(error)}`);
      throw new BadGatewayException(apiError('SEND_FAILED', 'We could not send the code. Please try again.'));
    }
    return { sent: true, expires_in: OTP_TTL_SECONDS };
  }

  async verifyCode(email: string, code: string, fullName: string | undefined, country: string | undefined, ip: string, locale?: Locale) {
    if (!this.byIp.allow(`verify:${ip}`)) throw this.tooMany();

    return this.db
      .tx(async (q) => {
        const [row] = await q.query<{ id: string; code_hash: string }>(
          /* sql */ `
          SELECT id, code_hash FROM email_login_codes
           WHERE email = $1 AND consumed_at IS NULL AND expires_at > now() AND attempts < $2
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [email, OTP_MAX_ATTEMPTS],
        );
        if (!row) throw this.invalid();

        if (!codeMatches(code, emailHashKey(email), this.config.jwtSecret, row.code_hash)) {
          await q.query(/* sql */ `UPDATE email_login_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
          // The failed count must survive, so answer without rolling back.
          return { failed: true as const };
        }

        let [user] = await q.query<SignedInUser>(
          /* sql */ `
          SELECT u.id, u.full_name, u.country_code, u.locale, u.email, u.phone_e164, u.is_active,
                 coalesce(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
            FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
           WHERE lower(u.email) = $1
           GROUP BY u.id`,
          [email],
        );
        if (user && user.is_active === false) throw this.invalid();

        if (!user) {
          // Keep the code usable: the app asks for the missing details and sends the same code again.
          if (!fullName || fullName.trim().length < 2) {
            throw new UnprocessableEntityException(apiError('NAME_REQUIRED', 'Tell us your name to create your account.'));
          }
          if (!country) {
            throw new UnprocessableEntityException(apiError('COUNTRY_REQUIRED', 'Choose your country to create your account.'));
          }
          [user] = await q.query<SignedInUser>(
            /* sql */ `
            INSERT INTO users (full_name, email, country_code, locale)
            VALUES ($1, $2, $3, $4)
            RETURNING id, full_name, country_code, locale, email, phone_e164, ARRAY[]::text[] AS roles`,
            [fullName.trim(), email, country, locale ?? 'en'],
          );
          await q.query(/* sql */ `INSERT INTO user_roles (user_id, role) VALUES ($1, 'PLAYER')`, [user.id]);
          user.roles = ['PLAYER'];
        }

        await q.query(/* sql */ `UPDATE email_login_codes SET consumed_at = now() WHERE id = $1`, [row.id]);
        const accessToken = this.refreshTokens.signAccessToken(user.id, user.roles);
        const refreshToken = await this.refreshTokens.issue(q, user.id);
        const { id, full_name, country_code, locale: userLocale, roles, phone_e164 } = user;
        return {
          failed: false as const,
          body: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: ACCESS_TOKEN_SECONDS,
            user: { id, full_name, country_code, locale: userLocale, roles, phone_e164, email },
          },
        };
      })
      .then((result) => {
        if (result.failed) throw this.invalid();
        return result.body;
      });
  }

  private invalid() {
    return new UnauthorizedException(apiError('INVALID_CODE', 'That code is wrong or has expired.'));
  }

  private tooMany(): HttpException {
    return new HttpException(apiError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'), HttpStatus.TOO_MANY_REQUESTS);
  }
}
