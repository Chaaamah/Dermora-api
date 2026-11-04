import { BadRequestException, Body, ConflictException, Controller, HttpException, HttpStatus, Injectable, Module, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { User } from '@prisma/client';
import { PrismaService } from '../common/common.module';
import { ACCESS_SECRET, AuthGuard, AuthUser, CurrentUser, REFRESH_SECRET, parse, z } from '../common/auth';
import { MailerService } from '../notifications/notifications.module';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltHex, keyHex] = stored.split('$');
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const email = z.string().trim().toLowerCase().email('Adresse e-mail invalide');
const password = z.string().min(8, '8 caractères minimum').max(128).regex(/[A-Za-z]/, 'Au moins une lettre').regex(/[0-9]/, 'Au moins un chiffre');

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private mailer: MailerService) {}

  tokens(user: Pick<User, 'id' | 'role' | 'email'>) {
    const payload = { sub: user.id, role: user.role, email: user.email };
    return {
      accessToken: this.jwt.sign(payload, { secret: ACCESS_SECRET(), expiresIn: '1h' }),
      refreshToken: this.jwt.sign({ sub: user.id }, { secret: REFRESH_SECRET(), expiresIn: '30d' }),
    };
  }

  async register(b: { email: string; password: string; firstName: string; role: 'CLIENT' | 'DERMATOLOGIST' }) {
    if (await this.prisma.user.findUnique({ where: { email: b.email } })) throw new ConflictException('Un compte existe déjà avec cet e-mail.');
    const user = await this.prisma.user.create({ data: { email: b.email, passwordHash: await hashPassword(b.password), firstName: b.firstName, role: b.role } });
    return { ...this.tokens(user), user: { id: user.id, role: user.role } };
  }

  async login(emailAddr: string, pw: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    // Message identique que l'e-mail existe ou non (pas d'énumération de comptes)
    if (!user?.passwordHash || !(await verifyPassword(pw, user.passwordHash))) throw new UnauthorizedException('E-mail ou mot de passe incorrect.');
    return { ...this.tokens(user), user: { id: user.id, role: user.role } };
  }

  /** Envoie un code à 6 chiffres valable 15 minutes. Réponse identique si le compte n'existe pas. */
  async forgot(emailAddr: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    const generic = { sent: true, message: 'Si un compte existe pour cette adresse, un code de réinitialisation vient d\'être envoyé.' };
    if (!user?.email) return generic;
    if (user.resetExpiresAt && user.resetExpiresAt.getTime() - 14 * 60_000 > Date.now()) {
      throw new HttpException('Un code vient déjà d\'être envoyé. Patientez une minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = String(randomInt(100000, 999999));
    await this.prisma.user.update({ where: { id: user.id }, data: { resetCodeHash: sha(user.id + code), resetExpiresAt: new Date(Date.now() + 15 * 60_000), resetAttempts: 0 } });
    await this.mailer.send(
      user.email,
      'Dermora — réinitialisation de votre mot de passe',
      `Bonjour ${user.firstName ?? ''},\n\nVotre code de réinitialisation Dermora : ${code}\nIl est valable 15 minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nCare Beyond Beauty — Dermora`,
      `<div style="font-family:Georgia,serif;color:#2a1820"><h2 style="color:#7a1f3d">Dermora</h2><p>Bonjour ${user.firstName ?? ''},</p><p>Votre code de réinitialisation :</p><p style="font-size:28px;letter-spacing:8px;color:#7a1f3d"><b>${code}</b></p><p>Il est valable 15 minutes.</p><p style="color:#8e7880;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p></div>`,
    );
    const dev = !this.mailer.configured && process.env.NODE_ENV !== 'production';
    return { ...generic, ...(dev ? { devCode: code } : {}) };
  }

  async reset(emailAddr: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    if (!user || !user.resetCodeHash || !user.resetExpiresAt || user.resetExpiresAt < new Date() || user.resetAttempts >= 5) {
      throw new BadRequestException('Code expiré ou invalide. Demandez un nouveau code.');
    }
    if (user.resetCodeHash !== sha(user.id + code)) {
      await this.prisma.user.update({ where: { id: user.id }, data: { resetAttempts: { increment: 1 } } });
      throw new BadRequestException('Code incorrect.');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), resetCodeHash: null, resetExpiresAt: null, resetAttempts: 0 },
    });
    return { ...this.tokens(updated), reset: true };
  }

  async refresh(refreshToken: string) {
    try {
      const p = this.jwt.verify(refreshToken, { secret: REFRESH_SECRET() });
      return this.tokens(await this.prisma.user.findUniqueOrThrow({ where: { id: p.sub } }));
    } catch {
      throw new UnauthorizedException('Session expirée');
    }
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw new BadRequestException('Mot de passe actuel incorrect.');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
    return { changed: true };
  }
}

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() body: unknown) {
    const b = parse(z.object({ email, password, firstName: z.string().trim().min(2).max(60), role: z.enum(['CLIENT', 'DERMATOLOGIST']).default('CLIENT') }), body);
    return this.auth.register(b);
  }

  @Post('login')
  login(@Body() body: unknown) {
    const b = parse(z.object({ email, password: z.string().min(1) }), body);
    return this.auth.login(b.email, b.password);
  }

  @Post('password/forgot')
  forgot(@Body() body: unknown) {
    return this.auth.forgot(parse(z.object({ email }), body).email);
  }

  @Post('password/reset')
  reset(@Body() body: unknown) {
    const b = parse(z.object({ email, code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres'), password }), body);
    return this.auth.reset(b.email, b.code, b.password);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post('password/change')
  change(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ current: z.string().min(1), password }), body);
    return this.auth.changePassword(u.id, b.current, b.password);
  }

  @Post('refresh')
  refresh(@Body() body: unknown) {
    return this.auth.refresh(parse(z.object({ refreshToken: z.string() }), body).refreshToken);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
