import { publicWebUrl } from '../common/i18n';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, HttpException, HttpStatus, Injectable, Module, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { User } from '@prisma/client';
import { PrismaService } from '../common/common.module';
import { ACCESS_SECRET, AuthGuard, AuthUser, CurrentUser, REFRESH_SECRET, parse, z } from '../common/auth';
import { MailerService } from '../notifications/notifications.module';
import { MailLang, renderMail } from '../notifications/email-template';
import { Throttle } from '@nestjs/throttler';
import { LIMIT } from '../common/throttle';

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

const MAIL = {
  fr: {
    verify: { subject: 'Activez votre compte Dermora', preheader: 'Un clic pour commencer votre routine personnalisée.', title: 'Bienvenue sur Dermora', hello: 'Bonjour', body: ['Merci de nous avoir rejointes ! Votre espace est prêt : diagnostic de peau, routine adaptée à votre budget et produits disponibles au Maroc.', 'Pour activer votre compte, il suffit de confirmer votre adresse e-mail.'], button: 'Activer mon compte', note: 'Ce lien est valable 48 heures. Si vous n\'avez pas créé de compte Dermora, ignorez simplement ce message.' },
    reset: { subject: 'Votre code Dermora', preheader: 'Votre code de réinitialisation, valable 15 minutes.', title: 'Réinitialiser votre mot de passe', hello: 'Bonjour', body: ['Voici votre code de réinitialisation. Saisissez-le dans l\'application pour choisir un nouveau mot de passe.'], note: 'Ce code est valable 15 minutes. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.' },
  },
  en: {
    verify: { subject: 'Activate your Dermora account', preheader: 'One click to start your personalised routine.', title: 'Welcome to Dermora', hello: 'Hello', body: ['Thank you for joining us! Your space is ready: skin analysis, a routine that fits your budget and products available in Morocco.', 'To activate your account, simply confirm your email address.'], button: 'Activate my account', note: 'This link is valid for 48 hours. If you did not create a Dermora account, simply ignore this message.' },
    reset: { subject: 'Your Dermora code', preheader: 'Your reset code, valid for 15 minutes.', title: 'Reset your password', hello: 'Hello', body: ['Here is your reset code. Enter it in the app to choose a new password.'], note: 'This code is valid for 15 minutes. If you did not request it, ignore this message: your password stays unchanged.' },
  },
  ar: {
    verify: { subject: 'فعّلي حسابك في ديرمورا', preheader: 'نقرة واحدة لبدء روتينك المخصص.', title: 'مرحباً بك في ديرمورا', hello: 'مرحباً', body: ['شكراً لانضمامك إلينا! فضاؤك جاهز: تحليل البشرة، وروتين يناسب ميزانيتك، ومنتجات متوفرة في المغرب.', 'لتفعيل حسابك، يكفي تأكيد بريدك الإلكتروني.'], button: 'تفعيل حسابي', note: 'هذا الرابط صالح لمدة 48 ساعة. إذا لم تنشئي حساباً في ديرمورا، تجاهلي هذه الرسالة.' },
    reset: { subject: 'رمز ديرمورا الخاص بك', preheader: 'رمز إعادة التعيين، صالح لمدة 15 دقيقة.', title: 'إعادة تعيين كلمة المرور', hello: 'مرحباً', body: ['إليك رمز إعادة التعيين. أدخليه في التطبيق لاختيار كلمة مرور جديدة.'], note: 'هذا الرمز صالح لمدة 15 دقيقة. إذا لم تطلبيه، تجاهلي هذه الرسالة: كلمة المرور لم تتغير.' },
  },
};
const mailLang = (l?: string | null): MailLang => (l === 'en' ? 'en' : l === 'ar' ? 'ar' : 'fr');
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

  /** Compte créé non activé : un lien d'activation (48 h) est envoyé par e-mail. */
  async register(b: { email: string; password: string; firstName: string; role: 'CLIENT' | 'DERMATOLOGIST'; lang?: string }) {
    if (await this.prisma.user.findUnique({ where: { email: b.email } })) throw new ConflictException('Un compte existe déjà avec cet e-mail.');
    const token = randomBytes(32).toString('base64url');
    const user = await this.prisma.user.create({
      data: { email: b.email, passwordHash: await hashPassword(b.password), firstName: b.firstName, role: b.role, lang: b.lang ?? 'fr', verifyTokenHash: sha(token), verifyExpiresAt: new Date(Date.now() + 48 * 3600_000) },
    });
    return { needsVerification: true, email: user.email, ...(await this.sendVerification(user, token)) };
  }

  private async sendVerification(user: Pick<User, 'email' | 'firstName' | 'lang'>, token: string) {
    const link = `${publicWebUrl()}/verify?token=${token}`;
    const lang = mailLang(user.lang);
    const T = MAIL[lang].verify;
    const mail = renderMail({ lang, preheader: T.preheader, title: T.title, greeting: `${T.hello} ${user.firstName ?? ''},`.replace(' ,', ','), paragraphs: T.body, button: { label: T.button, url: link }, note: T.note });
    this.mailer.sendInBackground(user.email!, T.subject, mail.text, mail.html);
    // Développement sans SMTP : le lien est renvoyé pour pouvoir tester
    return !this.mailer.configured && process.env.NODE_ENV !== 'production' ? { devLink: link } : {};
  }

  /** Active le compte à partir du lien reçu par e-mail, puis connecte l'utilisatrice. */
  async verify(token: string) {
    const user = await this.prisma.user.findFirst({ where: { verifyTokenHash: sha(token) } });
    if (!user || !user.verifyExpiresAt || user.verifyExpiresAt < new Date()) throw new BadRequestException('Lien d\'activation expiré ou invalide. Demandez un nouveau lien.');
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), verifyTokenHash: null, verifyExpiresAt: null } });
    return { ...this.tokens(updated), user: { id: updated.id, role: updated.role }, verified: true };
  }

  /** Renvoie un lien d'activation. Réponse identique que le compte existe ou non. */
  async resendVerification(emailAddr: string) {
    const generic = { sent: true, message: 'Si un compte non activé existe pour cette adresse, un nouveau lien vient d\'être envoyé.' };
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    if (!user || !user.verifyTokenHash || user.emailVerifiedAt) return generic;
    if (user.verifyExpiresAt && user.verifyExpiresAt.getTime() - (48 * 3600_000 - 60_000) > Date.now()) {
      throw new HttpException('Un lien vient déjà d\'être envoyé. Patientez une minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const token = randomBytes(32).toString('base64url');
    await this.prisma.user.update({ where: { id: user.id }, data: { verifyTokenHash: sha(token), verifyExpiresAt: new Date(Date.now() + 48 * 3600_000) } });
    return { ...generic, ...(await this.sendVerification(user, token)) };
  }

  async login(emailAddr: string, pw: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    // Message identique que l'e-mail existe ou non (pas d'énumération de comptes)
    if (!user?.passwordHash || !(await verifyPassword(pw, user.passwordHash))) throw new UnauthorizedException('E-mail ou mot de passe incorrect.');
    if (user.verifyTokenHash && !user.emailVerifiedAt) {
      throw new ForbiddenException({ statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Compte non activé : cliquez sur le lien reçu par e-mail.' });
    }
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
    const lang = mailLang(user.lang);
    const T = MAIL[lang].reset;
    const mail = renderMail({ lang, preheader: T.preheader, title: T.title, greeting: `${T.hello} ${user.firstName ?? ''},`.replace(' ,', ','), paragraphs: T.body, code, note: T.note });
    this.mailer.sendInBackground(user.email, T.subject, mail.text, mail.html);
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
      data: { passwordHash: await hashPassword(newPassword), resetCodeHash: null, resetExpiresAt: null, resetAttempts: 0, ...(user.verifyTokenHash ? { emailVerifiedAt: new Date(), verifyTokenHash: null, verifyExpiresAt: null } : {}) },
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

  @Throttle(LIMIT.register)
  @Post('register')
  register(@Body() body: unknown) {
    const b = parse(z.object({
      email, password, passwordConfirm: z.string().optional(),
      firstName: z.string().trim().min(2).max(60), role: z.enum(['CLIENT', 'DERMATOLOGIST']).default('CLIENT'), lang: z.enum(['fr', 'ar', 'en']).optional(),
    }).refine((x) => x.passwordConfirm === undefined || x.passwordConfirm === x.password, { message: 'Les deux mots de passe ne correspondent pas.', path: ['passwordConfirm'] }), body);
    const { passwordConfirm: _c, ...data } = b;
    return this.auth.register(data);
  }

  @Throttle(LIMIT.code)
  @Post('verify')
  verify(@Body() body: unknown) {
    return this.auth.verify(parse(z.object({ token: z.string().min(20).max(200) }), body).token);
  }

  @Throttle(LIMIT.email)
  @Post('verify/resend')
  resend(@Body() body: unknown) {
    return this.auth.resendVerification(parse(z.object({ email }), body).email);
  }

  @Throttle(LIMIT.login)
  @Post('login')
  login(@Body() body: unknown) {
    const b = parse(z.object({ email, password: z.string().min(1) }), body);
    return this.auth.login(b.email, b.password);
  }

  @Throttle(LIMIT.email)
  @Post('password/forgot')
  forgot(@Body() body: unknown) {
    return this.auth.forgot(parse(z.object({ email }), body).email);
  }

  @Throttle(LIMIT.code)
  @Post('password/reset')
  reset(@Body() body: unknown) {
    const b = parse(z.object({ email, code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres'), password }), body);
    return this.auth.reset(b.email, b.code, b.password);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Throttle(LIMIT.login)
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
