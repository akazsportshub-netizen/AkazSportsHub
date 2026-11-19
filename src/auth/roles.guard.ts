import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, Role } from './auth.types';
import { ROLES_KEY } from './decorators';

/** Enforces @Roles(...). Runs after JwtAuthGuard, so `request.user` is already set. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user || !user.roles.some((role) => required.includes(role))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role does not allow this action' });
    }
    return true;
  }
}
