import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verify } from 'jsonwebtoken';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { AuthUser, authUserFromClaims } from './auth.types';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * Verifies the `Authorization: Bearer <jwt>` access token (HS256, signed with JWT_SECRET)
 * on every route that is not marked @Public(). Claims used: `sub` (user id) and `roles`.
 *
 * Issuing tokens (OTP login, refresh) is not part of the backend core yet; for local
 * work `npm run dev:token -- <user-id> <ROLE>` prints a token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; user?: AuthUser }>();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    const match = value ? /^Bearer\s+(.+)$/i.exec(value) : null;
    if (!match) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Access token required' });

    let claims: unknown;
    try {
      claims = verify(match[1], this.config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Access token is invalid or expired' });
    }

    // `verify` enforces `exp` only when the claim is present; a token that never expires is not acceptable.
    if (typeof claims !== 'object' || claims === null || typeof (claims as { exp?: unknown }).exp !== 'number') {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Access token must carry an expiry' });
    }

    const user = authUserFromClaims(claims);
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Access token has no valid subject' });

    request.user = user;
    return true;
  }
}
