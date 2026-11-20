import { createHash, randomBytes } from 'node:crypto';

/** Access tokens are short; the refresh token below renews them without another SMS code. */
export const ACCESS_TOKEN_SECONDS = 60 * 60;
export const REFRESH_TOKEN_DAYS = 60;
/** A just-used token presented again is most likely a lost response, not theft: refuse it but keep the family. */
export const REUSE_GRACE_SECONDS = 30;

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The token is already 256 random bits, so a plain hash is enough (no password-style stretching needed). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface StoredRefreshToken {
  expires_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
}

export type RefreshDecision = 'ok' | 'invalid' | 'reused' | 'reused_recently';

/** What to do with a token that was found in the table. */
export function decideRefresh(row: StoredRefreshToken, now: Date): RefreshDecision {
  if (row.revoked_at) return 'invalid';
  if (row.rotated_at) {
    return now.getTime() - row.rotated_at.getTime() <= REUSE_GRACE_SECONDS * 1000 ? 'reused_recently' : 'reused';
  }
  if (row.expires_at.getTime() <= now.getTime()) return 'invalid';
  return 'ok';
}
