import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { sign } from 'jsonwebtoken';
import { apiError } from '../common/api-error';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DatabaseService } from '../database/database.service';
import { Public } from './decorators';

class DevTokenDto {
  @IsUUID()
  user_id!: string;
}

interface DevUser {
  id: string;
  full_name: string;
  country_code: string;
  phone_e164?: string;
  roles: string[];
}

const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

/**
 * Local-development stand-in for sign-in, until OTP login exists: lists the users in the
 * database and signs an access token for any of them, with no password.
 *
 * Every route answers 404 unless DEV_LOGIN=true, which the config refuses in production.
 * It issues the same tokens as `npm run dev:token`, so the rest of the API cannot tell
 * them apart from real ones.
 */
@Public()
@Controller('dev/auth')
export class DevAuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
  ) {}

  @Get('users')
  listUsers(): Promise<DevUser[]> {
    this.assertEnabled();
    return this.db.query<DevUser>(
      /* sql */ `
      SELECT u.id, u.full_name, u.country_code, u.phone_e164,
             coalesce(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
        FROM users u
        LEFT JOIN user_roles r ON r.user_id = u.id
       WHERE u.is_active
       GROUP BY u.id
       ORDER BY u.full_name
       LIMIT 100`,
    );
  }

  @Post('token')
  @HttpCode(200)
  async issueToken(@Body() dto: DevTokenDto) {
    this.assertEnabled();
    const [user] = await this.db.query<DevUser>(
      /* sql */ `
      SELECT u.id, u.full_name, u.country_code,
             coalesce(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
        FROM users u
        LEFT JOIN user_roles r ON r.user_id = u.id
       WHERE u.id = $1 AND u.is_active
       GROUP BY u.id`,
      [dto.user_id],
    );
    if (!user) throw new NotFoundException(apiError('USER_NOT_FOUND', 'No active user with that id'));

    const accessToken = sign({ sub: user.id, roles: user.roles }, this.config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: TOKEN_LIFETIME_SECONDS,
    });
    return { access_token: accessToken, expires_in: TOKEN_LIFETIME_SECONDS, user };
  }

  private assertEnabled(): void {
    if (!this.config.devLogin || this.config.nodeEnv === 'production') {
      throw new NotFoundException(apiError('NOT_FOUND', 'Not found'));
    }
  }
}
