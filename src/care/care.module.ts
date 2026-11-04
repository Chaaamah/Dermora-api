import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Module, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, OptionalAuth, parse, z } from '../common/auth';
import { NotificationsService } from '../notifications/notifications.module';
import { MessagingService } from '../messaging/messaging.service';

const msgSchema = z.object({ content: z.string().max(2000).optional(), kind: z.enum(['text', 'scan']).optional(), refId: z.string().optional() });

/** Côté patiente : choisir un dermatologue, partager son dossier, échanger des messages. */
@ApiTags('Suivi dermatologue (patiente)')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class CareController {
  constructor(private prisma: PrismaService, private notif: NotificationsService, private messaging: MessagingService) {}

  @OptionalAuth()
  @Get('dermatologists')
  list() {
    return this.prisma.dermatologist.findMany({
      where: { verified: true },
      select: { id: true, fullName: true, title: true, city: true, bio: true, languages: true, priceMad: true },
      orderBy: { fullName: 'asc' },
    });
  }

  @Get('care-team')
  async mine(@CurrentUser() u: AuthUser) {
    const link = await this.prisma.careLink.findFirst({
      where: { patientId: u.id, status: { in: ['PENDING', 'ACTIVE'] } },
      include: { dermatologist: { select: { id: true, fullName: true, title: true, city: true, bio: true, languages: true, priceMad: true } } },
    });
    const notes = link?.status === 'ACTIVE'
      ? await this.prisma.clinicalNote.findMany({ where: { patientId: u.id, dermatologistId: link.dermatologistId, recommendation: { not: null } }, orderBy: { createdAt: 'desc' }, select: { id: true, recommendation: true, createdAt: true } })
      : [];
    return { link, recommendations: notes, unread: await this.messaging.unreadForPatient(u.id) };
  }

  /** Demande de suivi : nécessite le consentement de partage du dossier avec le dermatologue. */
  @Post('care-team')
  async request(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ dermatologistId: z.string(), reason: z.string().max(500).optional() }), body);
    const derm = await this.prisma.dermatologist.findFirst({ where: { id: b.dermatologistId, verified: true } });
    if (!derm) throw new BadRequestException('Dermatologue non vérifié');
    const consent = await this.prisma.consent.findFirst({ where: { userId: u.id, type: 'care_sharing', revokedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!consent?.granted) throw new ForbiddenException('Autorisez le partage de votre dossier avec le dermatologue.');
    await this.prisma.careLink.updateMany({ where: { patientId: u.id, status: { in: ['PENDING', 'ACTIVE'] } }, data: { status: 'ENDED' } });
    const link = await this.prisma.careLink.create({ data: { patientId: u.id, dermatologistId: derm.id, reason: b.reason, status: 'PENDING' } });
    const me = await this.prisma.user.findUnique({ where: { id: u.id }, select: { firstName: true } });
    await this.notif.notify(derm.userId, { type: 'care_request', title: 'Nouvelle demande de suivi', body: `${me?.firstName ?? 'Une patiente'} souhaite vous confier son suivi${b.reason ? ` : « ${b.reason} »` : '.'}`, link: '/pro' });
    return link;
  }

  @Delete('care-team')
  async end(@CurrentUser() u: AuthUser) {
    const links = await this.prisma.careLink.findMany({ where: { patientId: u.id, status: { in: ['PENDING', 'ACTIVE'] } }, include: { dermatologist: true } });
    await this.prisma.careLink.updateMany({ where: { patientId: u.id, status: { in: ['PENDING', 'ACTIVE'] } }, data: { status: 'ENDED' } });
    for (const l of links) await this.notif.notify(l.dermatologist.userId, { type: 'system', title: 'Suivi terminé', body: 'Une patiente a mis fin à son suivi.', link: '/pro' });
    return { ended: true };
  }

  @Get('care-team/messages')
  messages(@CurrentUser() u: AuthUser, @Query('after') after?: string) {
    return this.messaging.thread(u.id, 'PATIENT', { after });
  }

  @Post('care-team/messages')
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  send(@CurrentUser() u: AuthUser, @Body() body: unknown, @UploadedFile() file?: Express.Multer.File) {
    const b = parse(msgSchema, body ?? {});
    return this.messaging.send(u.id, 'PATIENT', u.id, { ...b, file });
  }

  /** Pièce jointe d'un message (patiente ou dermatologue lié uniquement). */
  @Get('messages/:id/attachment')
  async attachment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const m = await this.messaging.attachment(id, u);
    res.setHeader('Content-Type', m.attachmentType ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(m.attachment!));
  }
}

@Module({ controllers: [CareController] })
export class CareModule {}
