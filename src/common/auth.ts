import {
  BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata,
  UnauthorizedException, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { z, ZodTypeAny } from 'zod';

export interface AuthUser { id: string; role: Role; email: string }

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const OPTIONAL_AUTH = 'optionalAuth';
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest().user);

const MIN_JWT_SECRET_BYTES = 32;

export function validateJwtSecrets(env: NodeJS.ProcessEnv = process.env) {
  const access = env.JWT_ACCESS_SECRET;
  const refresh = env.JWT_REFRESH_SECRET;
  if (!access || Buffer.byteLength(access, 'utf8') < MIN_JWT_SECRET_BYTES) {
    throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 bytes of random data.');
  }
  if (!refresh || Buffer.byteLength(refresh, 'utf8') < MIN_JWT_SECRET_BYTES) {
    throw new Error('JWT_REFRESH_SECRET must be configured with at least 32 bytes of random data.');
  }
  if (access === refresh) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
  }
  return { access, refresh };
}

export const ACCESS_SECRET = () => validateJwtSecrets().access;
export const REFRESH_SECRET = () => validateJwtSecrets().refresh;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, [ctx.getHandler(), ctx.getClass()]);
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      if (optional) return true;
      throw new UnauthorizedException('Connexion requise');
    }
    try {
      const payload = this.jwt.verify(token, { secret: ACCESS_SECRET(), algorithms: ['HS256'] });
      req.user = { id: payload.sub, role: payload.role, email: payload.email } as AuthUser;
    } catch {
      if (optional) return true;
      throw new UnauthorizedException('Session expirée');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException('Accès réservé');
    return true;
  }
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new BadRequestException({ message: 'Données invalides', issues: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  }
  return r.data;
}
export { z };

export function ageFrom(birthDate?: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

export const today = () => new Date().toISOString().slice(0, 10);
