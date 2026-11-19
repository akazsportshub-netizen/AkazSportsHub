/**
 * Prints an access token for local development and testing.
 *
 *   npm run dev:token -- <user-id> [ROLE ...]
 *   npm run dev:token -- 00000000-0000-4000-a000-000000000010 PLAYER
 *
 * Signed with JWT_SECRET from the environment (or ./.env), valid for 12 hours.
 * Real sign-in (OTP login, refresh tokens) is not part of the backend core yet.
 */
import { sign } from 'jsonwebtoken';

try {
  process.loadEnvFile();
} catch {
  /* no .env file — rely on the environment */
}

const [userId, ...roles] = process.argv.slice(2);
const secret = process.env.JWT_SECRET;

if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
  console.error('Usage: npm run dev:token -- <user-id (uuid)> [PLAYER|PARENT|VENUE_MANAGER|REFEREE|ADMIN ...]');
  process.exit(1);
}
if (!secret) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env first.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to mint a development token with NODE_ENV=production.');
  process.exit(1);
}

console.log(sign({ sub: userId.toLowerCase(), roles: roles.map((role) => role.toUpperCase()) }, secret, { algorithm: 'HS256', expiresIn: '12h' }));
