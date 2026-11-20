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
import { MESSENGER, Messenger } from '../notifications/messenger';
import { RateLimiter } from '../users/rate-limit';
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS,
  OTP_REQUEST_WINDOW_MINUTES,
  OTP_TTL_SECONDS,
  codeMatches,
  countryForPhone,
  generateCode,
  hashCode,
  otpMessage,
} from './otp';
import { Locale, toLocale } from '../notifications/templates';
import { ACCESS_TOKEN_SECONDS } from './refresh';
import { RefreshService } from './refresh.service';

interface SignedInUser {
  id: string;
  full_name: string;
  country_code: string;
  locale: string;
  roles: string[];
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  /** Per caller address, on top of the per-number limit in the database. */
  private readonly byIp = new RateLimiter(20, 10 * 60_000);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    @Inject(MESSENGER) private readonly messenger: Messenger,
    private readonly refreshTokens: RefreshService,
  ) {}

  /**
   * Sends a code. The answer is the same whether or not the number has an account, so this
   * cannot be used to find out who is registered.
   */
  async requestCode(phone: string, ip: string, locale?: Locale): Promise<{ sent: true; expires_in: number }> {
    if (!this.byIp.allow(ip)) throw this.tooMany();

    const [{ recent }] = await this.db.query<{ recent: number }>(
      /* sql */ `
      SELECT count(*)::int AS recent
        FROM otp_codes
       WHERE phone_e164 = $1 AND created_at > now() - make_interval(mins => $2::int)`,
      [phone, OTP_REQUEST_WINDOW_MINUTES],
    );
    if (recent >= OTP_MAX_REQUESTS) throw this.tooMany();

    // A number that belongs to a switched-off account gets no code, but the same answer.
    const [blocked] = await this.db.query<{ id: string }>(
      /* sql */ `SELECT id FROM users WHERE phone_e164 = $1 AND NOT is_active`,
      [phone],
    );
    if (blocked) return { sent: true, expires_in: OTP_TTL_SECONDS };

    // An existing account's own language wins; otherwise the app's language.
    const [known] = await this.db.query<{ locale: string }>(/* sql */ `SELECT locale FROM users WHERE phone_e164 = $1`, [phone]);
    const code = generateCode();
    await this.db.query(
      /* sql */ `
      INSERT INTO otp_codes (phone_e164, code_hash, expires_at)
      VALUES ($1, $2, now() + make_interval(secs => $3::int))`,
      [phone, hashCode(code, phone, this.config.jwtSecret), OTP_TTL_SECONDS],
    );
    try {
      await this.messenger.send(phone, otpMessage(code, known ? toLocale(known.locale) : (locale ?? 'en')), 'SMS');
    } catch (error) {
      this.logger.error(`Could not send a sign-in code: ${errorMessage(error)}`);
      throw new BadGatewayException(apiError('SEND_FAILED', 'We could not send the code. Please try again.'));
    }
    return { sent: true, expires_in: OTP_TTL_SECONDS };
  }

  /** Checks the newest unused code for the number, then signs the person in, creating their account on first use. */
  async verifyCode(phone: string, code: string, fullName: string | undefined, ip: string, locale?: Locale) {
    if (!this.byIp.allow(`verify:${ip}`)) throw this.tooMany();

    return this.db.tx(async (q) => {
      const [row] = await q.query<{ id: string; code_hash: string; attempts: number }>(
        /* sql */ `
        SELECT id, code_hash, attempts
          FROM otp_codes
         WHERE phone_e164 = $1 AND consumed_at IS NULL AND expires_at > now() AND attempts < $2
         ORDER BY created_at DESC
         LIMIT 1
           FOR UPDATE`,
        [phone, OTP_MAX_ATTEMPTS],
      );
      const invalid = () => new UnauthorizedException(apiError('INVALID_CODE', 'That code is wrong or has expired.'));
      if (!row) throw invalid();

      if (!codeMatches(code, phone, this.config.jwtSecret, row.code_hash)) {
        await q.query(/* sql */ `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
        // The failed count must survive, so answer without rolling back.
        return { failed: true as const };
      }

      let [user] = await q.query<SignedInUser>(
        /* sql */ `
        SELECT u.id, u.full_name, u.country_code, u.locale, u.is_active,
               coalesce(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
          FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
         WHERE u.phone_e164 = $1
         GROUP BY u.id`,
        [phone],
      );
      if (user && (user as SignedInUser & { is_active: boolean }).is_active === false) throw invalid();

      if (!user) {
        const country = countryForPhone(phone);
        if (!country) {
          throw new UnprocessableEntityException(apiError('UNSUPPORTED_COUNTRY', 'AKAZ is not available for this phone number yet.'));
        }
        if (!fullName || fullName.trim().length < 2) {
          // Keep the code usable: the app asks for a name and sends the same code again.
          throw new UnprocessableEntityException(apiError('NAME_REQUIRED', 'Tell us your name to create your account.'));
        }
        [user] = await q.query<SignedInUser>(
          /* sql */ `
          INSERT INTO users (full_name, phone_e164, country_code, locale)
          VALUES ($1, $2, $3, $4)
          RETURNING id, full_name, country_code, locale, ARRAY[]::text[] AS roles`,
          [fullName.trim(), phone, country, locale ?? 'en'],
        );
        await q.query(/* sql */ `INSERT INTO user_roles (user_id, role) VALUES ($1, 'PLAYER')`, [user.id]);
        user.roles = ['PLAYER'];
      }

      await q.query(/* sql */ `UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [row.id]);
      const accessToken = this.refreshTokens.signAccessToken(user.id, user.roles);
      const refreshToken = await this.refreshTokens.issue(q, user.id);
      const { id, full_name, country_code, locale: userLocale, roles } = user;
      return { failed: false as const, body: { access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_TOKEN_SECONDS, user: { id, full_name, country_code, locale: userLocale, roles, phone_e164: phone } } };
    }).then((result) => {
      if (result.failed) throw new UnauthorizedException(apiError('INVALID_CODE', 'That code is wrong or has expired.'));
      return result.body;
    });
  }

  private tooMany(): HttpException {
    return new HttpException(apiError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'), HttpStatus.TOO_MANY_REQUESTS);
  }
}
