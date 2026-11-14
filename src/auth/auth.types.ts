export const ROLES = ['PLAYER', 'PARENT', 'VENUE_MANAGER', 'REFEREE', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** The authenticated caller, taken from the verified access token. */
export interface AuthUser {
  id: string;
  roles: Role[];
}

export function hasRole(user: AuthUser, ...roles: Role[]): boolean {
  return user.roles.some((role) => roles.includes(role));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Turns a verified JWT payload into an AuthUser, or null if the claims are unusable. */
export function authUserFromClaims(claims: unknown): AuthUser | null {
  if (typeof claims !== 'object' || claims === null) return null;
  const { sub, roles } = claims as { sub?: unknown; roles?: unknown };
  if (!isUuid(sub)) return null;
  const known = Array.isArray(roles)
    ? roles.filter((role): role is Role => (ROLES as readonly unknown[]).includes(role))
    : [];
  return { id: sub.toLowerCase(), roles: known };
}
