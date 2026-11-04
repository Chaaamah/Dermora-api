import { Controller, Get, Global, Injectable, Logger, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser } from '../common/auth';

export interface NotifyInput { type: string; title: string; body: string; link?: string }

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  notify(userId: string, n: NotifyInput) {
    return this.prisma.notification.create({ data: { userId, ...n, body: n.body.slice(0, 280) } }).catch(() => undefined);
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
  constructor(private prisma: PrismaService) {}

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

  @Post('read-all')
  async readAll(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService, MailerService], exports: [NotificationsService, MailerService] })
export class NotificationsModule {}
