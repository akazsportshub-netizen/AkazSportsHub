import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { apiError } from '../common/api-error';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DatabaseService, Queryable } from '../database/database.service';
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_DAYS,
  decideRefresh,
  generateRefreshToken,
  hashRefreshToken,
} from './refresh';

@Injectable()
export class RefreshService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
  ) {}

  signAccessToken(userId: string, roles: string[]): string {
    return sign({ sub: userId, roles }, this.config.jwtSecret, { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_SECONDS });
  }

  /** Starts a new family at sign-in, or continues one when rotating. Also clears this person's expired tokens. */
  async issue(q: Queryable, userId: string, familyId: string = randomUUID()): Promise<string> {
    const token = generateRefreshToken();
    await q.query(/* sql */ `DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < now() - interval '1 day'`, [userId]);
    await q.query(
      /* sql */ `
      INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
      VALUES ($1, $2, $3, now() + make_interval(days => $4::int))`,
      [userId, familyId, hashRefreshToken(token), REFRESH_TOKEN_DAYS],
    );
    return token;
  }

  /** Swaps a refresh token for a new access token and a new refresh token. */
  async refresh(token: string) {
    const invalid = () => new UnauthorizedException(apiError('INVALID_REFRESH_TOKEN', 'Please sign in again.'));

    const result = await this.db.tx(async (q) => {
      const [row] = await q.query<{
        id: string; user_id: string; family_id: string; expires_at: Date; rotated_at: Date | null; revoked_at: Date | null;
      }>(
        /* sql */ `
        SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at
          FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [hashRefreshToken(token)],
      );
      if (!row) return { ok: false as const };

      const decision = decideRefresh(row, new Date());
      if (decision === 'reused') {
        // An old token is back: assume it was copied, and end every session in this family.
        await q.query(/* sql */ `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [row.family_id]);
        return { ok: false as const };
      }
      if (decision !== 'ok') return { ok: false as const };

      const [user] = await q.query<{ id: string; roles: string[] }>(
        /* sql */ `
        SELECT u.id, coalesce(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
          FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
         WHERE u.id = $1 AND u.is_active
         GROUP BY u.id`,
        [row.user_id],
      );
      if (!user) {
        await q.query(/* sql */ `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [row.family_id]);
        return { ok: false as const };
      }

      await q.query(/* sql */ `UPDATE refresh_tokens SET rotated_at = now() WHERE id = $1`, [row.id]);
      const refreshToken = await this.issue(q, user.id, row.family_id);
      return { ok: true as const, user, refreshToken };
    });

    if (!result.ok) throw invalid();
    return {
      access_token: this.signAccessToken(result.user.id, result.user.roles),
      refresh_token: result.refreshToken,
      expires_in: ACCESS_TOKEN_SECONDS,
    };
  }

  /** Ends the session this token belongs to. Answers the same whether or not the token was known. */
  async revoke(token: string): Promise<{ ok: true }> {
    await this.db.query(
      /* sql */ `
      UPDATE refresh_tokens SET revoked_at = now()
       WHERE revoked_at IS NULL
         AND family_id IN (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
      [hashRefreshToken(token)],
    );
    return { ok: true };
  }
}
