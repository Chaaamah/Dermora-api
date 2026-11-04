import { Body, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService, PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, ageFrom, parse, z } from '../common/auth';
import { safetyAlert } from '../common/safety';
import { RoutineEngine } from '../routines/engine.service';
import { RoutinesModule, computeStats } from '../routines/routines.module';
import { NotificationsService } from '../notifications/notifications.module';
import { MessagingService, publicMessage } from '../messaging/messaging.service';

/** Espace dermatologue : patientes suivies, dossier, notes, messagerie. Chaque accès est tracé. */
@ApiTags('Espace dermatologue')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles('DERMATOLOGIST')
@Controller('pro')
export class ProController {
  constructor(private prisma: PrismaService, private audit: AuditService, private engine: RoutineEngine, private notif: NotificationsService, private messaging: MessagingService) {}

  private async derm(userId: string) {
    const d = await this.prisma.dermatologist.findUnique({ where: { userId } });
    if (!d) throw new NotFoundException('Profil dermatologue à compléter');
    return d;
  }

  private async link(userId: string, patientId: string, statuses = ['ACTIVE']) {
    const d = await this.derm(userId);
    const link = await this.prisma.careLink.findFirst({ where: { dermatologistId: d.id, patientId, status: { in: statuses } } });
    if (!link) throw new ForbiddenException('Cette patiente ne vous a pas confié son suivi.');
    return { d, link };
  }

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    return this.prisma.dermatologist.findUnique({ where: { userId: u.id } });
  }

  /** Inscription / mise à jour du profil. La vérification de l'inscription à l'Ordre est faite par l'équipe Dermora. */
  @Patch('me')
  async update(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({
      fullName: z.string().trim().min(3).max(80),
      ordreNumber: z.string().trim().min(4).max(40),
      city: z.string().trim().min(2).max(60),
      bio: z.string().max(600).optional(),
      languages: z.array(z.enum(['fr', 'ar', 'en'])).default(['fr']),
      priceMad: z.number().int().min(0).max(5000).default(300),
    }), body);
    await this.prisma.user.update({ where: { id: u.id }, data: { firstName: b.fullName, city: b.city } });
    return this.prisma.dermatologist.upsert({ where: { userId: u.id }, create: { userId: u.id, ...b, verified: false }, update: b });
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser) {
    const d = await this.derm(u.id);
    const links = await this.prisma.careLink.findMany({
      where: { dermatologistId: d.id, status: { in: ['PENDING', 'ACTIVE'] } },
      include: { patient: { include: { skinProfile: true, hairProfile: true, scans: { orderBy: { createdAt: 'desc' }, take: 1 }, notes: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
      orderBy: { updatedAt: 'desc' },
    });
    const patients = await Promise.all(links.map(async (l) => {
      const p = l.patient;
      const stats = l.status === 'ACTIVE' ? await computeStats(this.prisma, p.id) : null;
      const unread = await this.prisma.message.count({ where: { patientId: p.id, channel: 'CARE', senderRole: 'PATIENT', readAt: null } });
      return {
        linkId: l.id, status: l.status, reason: l.reason, since: l.createdAt,
        patient: { id: p.id, firstName: p.firstName, city: p.city, age: ageFrom(p.birthDate) },
        skinType: p.skinProfile?.skinType, concerns: p.skinProfile?.concerns ?? [],
        alert: safetyAlert(p.skinProfile, p.hairProfile),
        lastScanScore: (p.scans[0]?.results as { score?: number } | undefined)?.score ?? null,
        lastNote: p.notes[0] ?? null,
        adherence28: stats?.adherence28 ?? null, streak: stats?.streak ?? null,
        awaitingReply: unread > 0, unread,
      };
    }));
    return {
      profile: d,
      counts: { active: patients.filter((p) => p.status === 'ACTIVE').length, pending: patients.filter((p) => p.status === 'PENDING').length, alerts: patients.filter((p) => p.alert).length, awaiting: patients.filter((p) => p.awaitingReply).length },
      patients,
    };
  }

  @Patch('patients/:id/link')
  async decide(@CurrentUser() u: AuthUser, @Param('id') patientId: string, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(['ACTIVE', 'ENDED']) }), body);
    const { d, link } = await this.link(u.id, patientId, ['PENDING', 'ACTIVE']);
    if (!d.verified && b.status === 'ACTIVE') throw new ForbiddenException('Votre inscription à l\'Ordre est en cours de vérification.');
    await this.audit.log(u.id, `care_link:${b.status}`, `patient:${patientId}`);
    const updated = await this.prisma.careLink.update({ where: { id: link.id }, data: { status: b.status } });
    await this.notif.notify(patientId, b.status === 'ACTIVE'
      ? { type: 'care_accepted', title: 'Suivi accepté', body: `${d.fullName} a accepté de vous suivre. Vous pouvez maintenant échanger ensemble.`, link: '/app/conseil' }
      : { type: 'care_declined', title: 'Demande non retenue', body: `${d.fullName} ne peut pas assurer votre suivi. Vous pouvez choisir un autre dermatologue.`, link: '/app/conseil' });
    return updated;
  }

  @Get('patients/:id')
  async patient(@CurrentUser() u: AuthUser, @Param('id') patientId: string) {
    const { d, link } = await this.link(u.id, patientId);
    await this.audit.log(u.id, 'read_profile', `patient:${patientId}`);
    const p = await this.prisma.user.findUniqueOrThrow({
      where: { id: patientId },
      include: { skinProfile: true, hairProfile: true, scans: { orderBy: { createdAt: 'desc' } }, notes: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    const [routine, stats, clinicalNotes] = await Promise.all([
      this.engine.current(patientId),
      computeStats(this.prisma, patientId),
      this.prisma.clinicalNote.findMany({ where: { patientId, dermatologistId: d.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      link,
      patient: { id: p.id, firstName: p.firstName, city: p.city, age: ageFrom(p.birthDate), lang: p.lang },
      skinProfile: p.skinProfile, hairProfile: p.hairProfile, alert: safetyAlert(p.skinProfile, p.hairProfile),
      scans: p.scans, journal: p.notes, routine, stats, clinicalNotes,
    };
  }

  @Post('patients/:id/notes')
  async note(@CurrentUser() u: AuthUser, @Param('id') patientId: string, @Body() body: unknown) {
    const b = parse(z.object({ text: z.string().trim().min(2).max(4000), recommendation: z.string().trim().max(1000).optional() }), body);
    const { d } = await this.link(u.id, patientId);
    await this.audit.log(u.id, 'write_note', `patient:${patientId}`);
    const note = await this.prisma.clinicalNote.create({ data: { patientId, dermatologistId: d.id, text: b.text, recommendation: b.recommendation || null } });
    if (b.recommendation) await this.notif.notify(patientId, { type: 'recommendation', title: `Nouvelle recommandation de ${d.fullName}`, body: b.recommendation, link: '/app/conseil' });
    return note;
  }

  @Get('patients/:id/messages')
  async messages(@CurrentUser() u: AuthUser, @Param('id') patientId: string, @Query('after') after?: string) {
    await this.link(u.id, patientId);
    return this.messaging.thread(patientId, 'DERMATOLOGIST', { after });
  }

  @Post('patients/:id/messages')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async send(@CurrentUser() u: AuthUser, @Param('id') patientId: string, @Body() body: unknown, @UploadedFile() file?: Express.Multer.File) {
    const b = parse(z.object({ content: z.string().max(2000).optional() }), body ?? {});
    await this.link(u.id, patientId);
    return this.messaging.send(patientId, 'DERMATOLOGIST', u.id, { content: b.content, file });
  }

  /** Boîte de réception : une conversation par patiente suivie, triée par activité. */
  @Get('inbox')
  async inbox(@CurrentUser() u: AuthUser) {
    const d = await this.derm(u.id);
    const links = await this.prisma.careLink.findMany({ where: { dermatologistId: d.id, status: 'ACTIVE' }, include: { patient: { select: { id: true, firstName: true, city: true, birthDate: true } } } });
    const rows = await Promise.all(links.map(async (l) => {
      const [last, unread] = await Promise.all([
        this.prisma.message.findFirst({ where: { patientId: l.patientId, channel: 'CARE' }, orderBy: { createdAt: 'desc' } }),
        this.prisma.message.count({ where: { patientId: l.patientId, channel: 'CARE', senderRole: 'PATIENT', readAt: null } }),
      ]);
      return { patient: { id: l.patient.id, firstName: l.patient.firstName, city: l.patient.city, age: ageFrom(l.patient.birthDate) }, last: last ? publicMessage(last) : null, unread, since: l.createdAt };
    }));
    return rows.sort((a, b) => new Date(b.last?.createdAt ?? b.since).getTime() - new Date(a.last?.createdAt ?? a.since).getTime());
  }
}

@Module({ imports: [RoutinesModule], controllers: [ProController] })
export class ProModule {}
