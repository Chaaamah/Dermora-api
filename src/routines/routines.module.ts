import { BadRequestException, Body, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, parse, today, z } from '../common/auth';
import { productInclude } from '../catalog/catalog.module';
import { freshOffers, monthlyCost } from '../catalog/pricing';
import { RoutineEngine, TIERS, TIER_INFO } from './engine.service';
import { NotificationsService } from '../notifications/notifications.module';
import { RemindersModule, RemindersService } from '../reminders/reminders.module';

@ApiTags('Routine')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('routines')
export class RoutinesController {
  constructor(private prisma: PrismaService, private engine: RoutineEngine, private reminders: RemindersService, private notifications: NotificationsService) {}

  /** Trois formules (Essentielle → Premium) calculées pour la cliente, sans rien enregistrer */
  @Get('options')
  options(@CurrentUser() u: AuthUser) {
    return this.engine.options(u.id);
  }

  /** La cliente choisit sa formule : la routine est enregistrée et les rappels par étape activés */
  @Post('choose')
  async choose(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ tier: z.enum(TIERS) }), body);
    const r = await this.engine.choose(u.id, b.tier);
    if (!r.blocked) {
      const st = await this.reminders.settings(u.id);
      await this.notifications.notify(u.id, {
        type: 'routine', link: '/app',
        title: `Routine ${TIER_INFO[b.tier].name} activée`,
        body: st.enabled ? `Rappels de chaque étape à ${st.amTime} le matin et ${st.pmTime} le soir. Modifiables dans votre profil.` : 'Activez les rappels dans votre profil pour être guidée à chaque étape.',
      });
    }
    return this.engine.current(u.id);
  }

  @Post('generate')
  async generate(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ budgetMad: z.number().int().min(50).max(5000).default(400) }), body ?? {});
    await this.engine.generate(u.id, b.budgetMad);
    return this.engine.current(u.id);
  }

  @Get('current')
  current(@CurrentUser() u: AuthUser) {
    return this.engine.current(u.id);
  }

  @Patch(':id/budget')
  async budget(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ budgetMad: z.number().int().min(50).max(5000) }), body);
    const r = await this.prisma.routine.findFirst({ where: { id, userId: u.id } });
    if (!r) throw new NotFoundException();
    await this.engine.generate(u.id, b.budgetMad);
    return this.engine.current(u.id);
  }

  @Post(':id/steps/:stepId/replace')
  async replace(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('stepId') stepId: string, @Body() body: unknown) {
    const b = parse(z.object({ productId: z.string() }), body);
    const step = await this.prisma.routineStep.findFirst({ where: { id: stepId, routineId: id, routine: { userId: u.id } } });
    if (!step) throw new NotFoundException();
    const [p, user] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: b.productId }, include: productInclude }),
      this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { skinProfile: true, hairProfile: true } }),
    ]);
    if (!p || p.category !== step.category || !this.engine.eligible(p, user.skinProfile, user.hairProfile)) {
      throw new BadRequestException('Ce produit ne convient pas à votre profil pour cette étape.');
    }
    const cost = monthlyCost(freshOffers(p.offers)[0].priceMad, p.monthsSupply);
    // Une même catégorie (ex. nettoyant) est partagée matin et soir
    await this.prisma.routineStep.updateMany({ where: { routineId: id, category: step.category }, data: { productId: p.id, monthlyMad: cost } });
    const steps = await this.prisma.routineStep.findMany({ where: { routineId: id } });
    const seen = new Set<string>();
    const total = steps.reduce((s, x) => (seen.has(x.category) ? s : (seen.add(x.category), s + x.monthlyMad)), 0);
    await this.prisma.routine.update({ where: { id }, data: { totalMad: Math.round(total * 10) / 10 } });
    return this.engine.current(u.id);
  }
}

@ApiTags('Suivi')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class TrackingController {
  constructor(private prisma: PrismaService) {}

  /** DER-41 — cocher / décocher une étape du jour */
  @Post('routine-checks')
  async check(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ stepId: z.string(), done: z.boolean().default(true), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), body);
    const day = b.day ?? today();
    if (b.done) {
      await this.prisma.routineCheck.upsert({ where: { userId_day_stepId: { userId: u.id, day, stepId: b.stepId } }, create: { userId: u.id, day, stepId: b.stepId }, update: {} });
    } else {
      await this.prisma.routineCheck.deleteMany({ where: { userId: u.id, day, stepId: b.stepId } });
    }
    return this.stats(u);
  }

  @Get('routine-checks/stats')
  async stats(@CurrentUser() u: AuthUser, @Query('userId') _?: string) {
    return computeStats(this.prisma, u.id);
  }

  @Get('skin-notes')
  notes(@CurrentUser() u: AuthUser) {
    return this.prisma.skinNote.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } });
  }

  @Post('skin-notes')
  addNote(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ kind: z.enum(['reaction', 'irritation', 'amelioration', 'note']), text: z.string().trim().min(2).max(1000) }), body);
    return this.prisma.skinNote.create({ data: { userId: u.id, ...b } });
  }
}

/** Séries de jours et assiduité sur 28 jours (KPI « routines suivies 4 semaines »). */
export async function computeStats(prisma: PrismaService, userId: string) {
  const routine = await prisma.routine.findFirst({ where: { userId, active: true }, include: { steps: true } });
  const dailySteps = routine?.steps.filter((s) => s.moment !== 'HAIR').length ?? 0;
  const since = new Date(Date.now() - 27 * 86_400_000).toISOString().slice(0, 10);
  const checks = await prisma.routineCheck.findMany({ where: { userId, day: { gte: since } } });
  const byDay = new Map<string, number>();
  for (const c of checks) byDay.set(c.day, (byDay.get(c.day) ?? 0) + 1);
  const doneDay = (d: string) => dailySteps > 0 && (byDay.get(d) ?? 0) >= Math.ceil(dailySteps / 2);
  let streak = 0;
  for (let i = 0; i < 28; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    if (doneDay(d)) streak++;
    else if (i > 0) break;
  }
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(Date.now() - (27 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day: d, count: byDay.get(d) ?? 0, done: doneDay(d) };
  });
  const t = today();
  return {
    streak, dailySteps,
    todayDone: checks.filter((c) => c.day === t).map((c) => c.stepId),
    adherence28: Math.round((days.filter((d) => d.done).length / 28) * 100),
    days,
  };
}

@Module({ imports: [RemindersModule], controllers: [RoutinesController, TrackingController], providers: [RoutineEngine], exports: [RoutineEngine] })
export class RoutinesModule {}
