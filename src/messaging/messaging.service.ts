import { BadRequestException, ForbiddenException, Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { PrismaService } from '../common/common.module';
import { NotificationsService } from '../notifications/notifications.module';

export type Sender = 'PATIENT' | 'DERMATOLOGIST';

export interface OutgoingMessage {
  content?: string;
  kind?: 'text' | 'image' | 'scan';
  refId?: string;
  file?: { buffer: Buffer; mimetype: string; size: number };
}

/** Message sans les octets de la pièce jointe (servie par une URL dédiée). */
export function publicMessage(m: Message) {
  const { attachment, ...rest } = m;
  return { ...rest, hasAttachment: !!attachment };
}

/**
 * Messagerie patiente ↔ dermatologue : texte, photo, partage d'une analyse,
 * accusés de lecture et notifications.
 */
@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService, private notif: NotificationsService) {}

  async activeLink(patientId: string) {
    return this.prisma.careLink.findFirst({ where: { patientId, status: 'ACTIVE' }, include: { dermatologist: true } });
  }

  /** Liste le fil et marque comme lus les messages reçus par le lecteur. */
  async thread(patientId: string, viewer: Sender, opts: { after?: string } = {}) {
    const other = viewer === 'PATIENT' ? 'DERMATOLOGIST' : 'PATIENT';
    await this.prisma.message.updateMany({ where: { patientId, channel: 'CARE', senderRole: other, readAt: null }, data: { readAt: new Date() } });
    const msgs = await this.prisma.message.findMany({
      where: { patientId, channel: 'CARE', ...(opts.after ? { createdAt: { gt: new Date(opts.after) } } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    const scanIds = msgs.filter((m) => m.kind === 'scan' && m.refId).map((m) => m.refId!);
    const scans = scanIds.length ? await this.prisma.scan.findMany({ where: { id: { in: scanIds }, userId: patientId } }) : [];
    return msgs.map((m) => ({ ...publicMessage(m), scan: m.kind === 'scan' ? scans.find((s) => s.id === m.refId) ?? null : undefined }));
  }

  async send(patientId: string, from: Sender, senderId: string, msg: OutgoingMessage) {
    const link = await this.activeLink(patientId);
    if (!link) throw new ForbiddenException('Aucun suivi actif entre vous.');
    let kind = msg.kind ?? 'text';
    const content = (msg.content ?? '').trim();
    if (msg.file) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(msg.file.mimetype)) throw new BadRequestException('Format d\'image non pris en charge.');
      if (msg.file.size > 5 * 1024 * 1024) throw new BadRequestException('Image trop lourde (5 Mo maximum).');
      kind = 'image';
    }
    if (kind === 'scan') {
      if (from !== 'PATIENT' || !msg.refId) throw new BadRequestException('Analyse manquante.');
      const scan = await this.prisma.scan.findFirst({ where: { id: msg.refId, userId: patientId } });
      if (!scan) throw new NotFoundException('Analyse introuvable.');
    }
    if (kind === 'text' && !content) throw new BadRequestException('Message vide.');

    const m = await this.prisma.message.create({
      data: {
        patientId, channel: 'CARE', senderRole: from, senderId, kind,
        content: content || (kind === 'image' ? 'Photo' : kind === 'scan' ? 'Analyse partagée' : ''),
        refId: kind === 'scan' ? msg.refId : null,
        attachment: msg.file ? new Uint8Array(msg.file.buffer) : undefined, attachmentType: msg.file?.mimetype,
      },
    });

    const preview = kind === 'image' ? '📷 Photo' : kind === 'scan' ? '📊 Analyse de peau partagée' : content;
    if (from === 'PATIENT') {
      const patient = await this.prisma.user.findUnique({ where: { id: patientId }, select: { firstName: true } });
      await this.notif.notify(link.dermatologist.userId, { type: 'message', title: `Message de ${patient?.firstName ?? 'votre patiente'}`, body: preview, link: `/pro/messages?p=${patientId}` });
    } else {
      await this.notif.notify(patientId, { type: 'message', title: `${link.dermatologist.fullName}`, body: preview, link: '/app/conseil' });
    }
    return publicMessage(m);
  }

  async attachment(messageId: string, viewer: { id: string; role: string }) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!m?.attachment) throw new NotFoundException();
    if (viewer.role === 'DERMATOLOGIST') {
      const d = await this.prisma.dermatologist.findUnique({ where: { userId: viewer.id } });
      const link = d && (await this.prisma.careLink.findFirst({ where: { dermatologistId: d.id, patientId: m.patientId, status: 'ACTIVE' } }));
      if (!link) throw new ForbiddenException();
    } else if (m.patientId !== viewer.id) {
      throw new ForbiddenException();
    }
    return m;
  }

  unreadForPatient(patientId: string) {
    return this.prisma.message.count({ where: { patientId, channel: 'CARE', senderRole: 'DERMATOLOGIST', readAt: null } });
  }
}

@Global()
@Module({ providers: [MessagingService], exports: [MessagingService] })
export class MessagingModule {}
