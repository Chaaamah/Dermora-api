import { publicWebUrl } from '../common/i18n';
import { Body, Controller, Delete, Get, Global, Injectable, Logger, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, parse, z } from '../common/auth';

export interface NotifyInput { type: string; title: string; body: string; link?: string }

/**
 * Notifications push via Firebase Cloud Messaging (web et mobile).
 * Activé si FIREBASE_SERVICE_ACCOUNT contient le JSON du compte de service (brut ou en base64).
 */
@Injectable()
export class PushService {
  private log = new Logger('Push');
  private messaging: import('firebase-admin/messaging').Messaging | null = null;

  constructor(private prisma: PrismaService) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    if (!raw) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initializeApp, cert, getApps } = require('firebase-admin/app') as typeof import('firebase-admin/app');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getMessaging } = require('firebase-admin/messaging') as typeof import('firebase-admin/messaging');
      const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
      const app = getApps()[0] ?? initializeApp({ credential: cert(json) });
      this.messaging = getMessaging(app);
      this.log.log('Firebase Cloud Messaging activé');
    } catch (e) {
      this.log.error(`FIREBASE_SERVICE_ACCOUNT invalide : ${(e as Error).message}`);
    }
  }

  get configured() { return !!this.messaging; }

  async send(userId: string, n: NotifyInput) {
    if (!this.messaging) return;
    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    if (!tokens.length) return;
    const web = publicWebUrl();
    const res = await this.messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: n.title, body: n.body.slice(0, 180) },
      data: { link: n.link ?? '/app', type: n.type },
      webpush: { fcmOptions: { link: `${web}${n.link ?? '/app'}` }, notification: { icon: `${web}/icon.png` } },
      android: { priority: 'high', notification: { channelId: 'dermora' } },
    }).catch((e) => { this.log.warn(`Envoi push impossible : ${(e as Error).message}`); return null; });
    // Jetons expirés ou désinstallés : supprimés
    const dead = res?.responses.map((r, i) => (!r.success && /registration-token-not-registered|invalid-argument|invalid-registration-token/.test(r.error?.code ?? '') ? tokens[i].token : null)).filter(Boolean) as string[] | undefined;
    if (dead?.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
  }
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  async notify(userId: string, n: NotifyInput) {
    const created = await this.prisma.notification.create({ data: { userId, ...n, body: n.body.slice(0, 280) } }).catch(() => undefined);
    void this.push.send(userId, n).catch(() => undefined);
    return created;
  }
}

/** Envoi d'e-mails. Sans SMTP configuré, le message est seulement journalisé (mode développement). */
@Injectable()
export class MailerService {
  private log = new Logger('Mailer');
  private transport = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null;

  get configured() { return !!this.transport; }

  async send(to: string, subject: string, text: string, html?: string) {
    if (!this.transport) {
      this.log.log(`[dev] e-mail à ${to} — ${subject}\n${text}`);
      return;
    }
    await this.transport.sendMail({ from: process.env.MAIL_FROM ?? 'Dermora <no-reply@dermora.ma>', to, subject, text, html });
  }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService, private push: PushService) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId: u.id, readAt: null } }),
    ]);
    return { items, unread };
  }

  @Get('unread-count')
  async count(@CurrentUser() u: AuthUser) {
    return { unread: await this.prisma.notification.count({ where: { userId: u.id, readAt: null } }) };
  }

  @Patch(':id/read')
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  /** Enregistre le jeton push de l'appareil (Firebase Cloud Messaging) */
  @Post('push-tokens')
  async addToken(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ token: z.string().min(20).max(4096), platform: z.enum(['web', 'android', 'ios']) }), body);
    await this.prisma.pushToken.upsert({ where: { token: b.token }, create: { userId: u.id, ...b }, update: { userId: u.id, platform: b.platform } });
    return { ok: true, pushConfigured: this.push.configured };
  }

  @Delete('push-tokens/:token')
  async removeToken(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId: u.id } });
    return { ok: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [PushService, NotificationsService, MailerService], exports: [PushService, NotificationsService, MailerService] })
export class NotificationsModule {}
