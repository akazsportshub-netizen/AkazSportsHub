import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser, Role } from './auth.types';

export const IS_PUBLIC_KEY = 'akaz:isPublic';
export const ROLES_KEY = 'akaz:roles';

/** Marks a controller or route as reachable without an access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a controller or route to callers holding at least one of the roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated caller into a route handler. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
