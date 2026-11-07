import { Body, Controller, ForbiddenException, Get, Headers, Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, parse, z } from '../common/auth';
import { NotificationsService } from '../notifications/notifications.module';
import { PriceSyncService } from '../catalog/price-sync.service';
import { CatalogModule } from '../catalog/catalog.module';
import { trs } from '../common/i18n';

const TZ = 'Africa/Casablanca';
const MOMENT_LABEL: Record<string, string> = { AM: 'Routine du matin', PM: 'Routine du soir', HAIR: 'Soin des cheveux' };
/** Une étape n'est plus rappelée si l'heure prévue est passée depuis plus de 2 h (serveur en veille, etc.) */
const LATE_WINDOW_MIN = 120;

/** Heure locale du Maroc : jour (YYYY-MM-DD), jour de semaine (1 = lundi … 7 = dimanche), minutes depuis minuit */
export function moroccoNow(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(d).map((p) => [p.type, p.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const routineStepProductName = (step: { productId: string | null; customProduct: unknown }, names: Map<string, string>) => {
  if (step.productId) return names.get(step.productId) ?? null;
  const product = step.customProduct as { brand?: string | null; name?: string } | null;
  return product?.name ? `${product.brand ?? ''} ${product.name}`.trim() : null;
};

/** Jours de la semaine où une étape est prévue, d'après sa fréquence (« 3 soirs par semaine », « 1 fois par semaine »…) */
export function stepDays(frequency: string, hairDays: number[]): number[] {
  const m = /(\d+)\s*(fois|soirs?|jours?)\s*par\s*semaine/i.exec(frequency);
  if (!m) return [1, 2, 3, 4, 5, 6, 7];
  const n = Math.min(7, Math.max(1, Number(m[1])));
  const spread: Record<number, number[]> = { 1: [7], 2: [3, 7], 3: [1, 3, 5], 4: [1, 3, 5, 7], 5: [1, 2, 4, 5, 7], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 7] };
  return spread[n] ?? hairDays;
}

const SettingsZ = z.object({
  enabled: z.boolean(),
  amTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  pmTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  hairTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  hairDays: z.array(z.number().int().min(1).max(7)).max(7),
  stepGapMin: z.number().int().min(0).max(30),
}).partial();

@Injectable()
export class RemindersService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger('Reminders');
  private timer?: NodeJS.Timeout;
  private running = false;
  lastRun: { at: string; sent: number } | null = null;

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  onApplicationBootstrap() {
    // Exécution interne toutes les REMINDERS_INTERVAL_MIN minutes (0 = uniquement par la tâche cron externe)
    const every = Number(process.env.REMINDERS_INTERVAL_MIN ?? 5);
    if (every > 0) this.timer = setInterval(() => void this.run().catch((e) => this.log.error(e)), every * 60_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  settings(userId: string) {
    return this.prisma.reminderSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  /** Planning du jour : une entrée par étape, avec son heure (utilisé aussi par l'app mobile pour les rappels locaux). */
  schedule(settings: { amTime: string; pmTime: string; hairTime: string; hairDays: number[]; stepGapMin: number }, steps: { id: string; moment: string; order: number; step: string; frequency: string; quantity: string | null; productName?: string | null }[], lang?: string | null) {
    const out: { stepId: string; moment: string; title: string; body: string; minutes: number; days: number[] }[] = [];
    for (const moment of ['AM', 'PM', 'HAIR']) {
      const list = steps.filter((s) => s.moment === moment).sort((a, b) => a.order - b.order);
      const start = toMin(moment === 'AM' ? settings.amTime : moment === 'PM' ? settings.pmTime : settings.hairTime);
      list.forEach((s, i) => {
        const days = moment === 'HAIR' && !/par\s*semaine/i.test(s.frequency) ? settings.hairDays : stepDays(s.frequency, settings.hairDays);
        out.push({
          stepId: s.id, moment, days, minutes: (start + i * settings.stepGapMin) % 1440,
          title: `${trs(MOMENT_LABEL[moment], lang)} · ${trs('étape', lang)} ${i + 1}/${list.length}`,
          body: `${trs(s.step, lang)}${s.productName ? ` — ${s.productName}` : ''}${s.quantity ? ` (${trs(s.quantity, lang)})` : ''}`,
        });
      });
    }
    return out;
  }

  /** Envoie les rappels arrivés à échéance (appelé par le minuteur interne ou la tâche cron). */
  async run(now = new Date()) {
    if (this.running) return { sent: 0, skipped: 'déjà en cours' };
    this.running = true;
    let sent = 0;
    try {
      const { day, weekday, minutes } = moroccoNow(now);
      const users = await this.prisma.reminderSettings.findMany({ where: { enabled: true }, include: { user: { select: { lang: true } } } });
      for (const st of users) {
        const routine = await this.prisma.routine.findFirst({ where: { userId: st.userId, active: true, blocked: false }, include: { steps: true } });
        if (!routine?.steps.length) continue;
        const products = await this.prisma.product.findMany({ where: { id: { in: routine.steps.map((s) => s.productId!).filter(Boolean) } }, select: { id: true, brand: true, name: true } });
        const pName = new Map(products.map((p) => [p.id, `${p.brand} ${p.name}`]));
        const plan = this.schedule(st, routine.steps.map((s) => ({ ...s, productName: routineStepProductName(s, pName) })), st.user.lang);
        const [done, logged] = await Promise.all([
          this.prisma.routineCheck.findMany({ where: { userId: st.userId, day }, select: { stepId: true } }),
          this.prisma.reminderLog.findMany({ where: { userId: st.userId, day }, select: { stepId: true } }),
        ]);
        const skip = new Set([...done, ...logged].map((x) => x.stepId));
        for (const p of plan) {
          if (skip.has(p.stepId) || !p.days.includes(weekday)) continue;
          if (minutes < p.minutes || minutes > p.minutes + LATE_WINDOW_MIN) continue;
          const created = await this.prisma.reminderLog.create({ data: { userId: st.userId, day, stepId: p.stepId } }).catch(() => null);
          if (!created) continue; // déjà envoyé par une autre instance
          // Sur mobile, les rappels sont programmés localement (hors ligne) : push uniquement vers le navigateur
          await this.notifications.notify(st.userId, { type: 'reminder', title: p.title, body: p.body, link: '/app' }, { pushPlatforms: ['web'] });
          sent++;
        }
      }
      // Historique des rappels : 14 jours
      const old = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
      await this.prisma.reminderLog.deleteMany({ where: { day: { lt: old } } });
      this.lastRun = { at: now.toISOString(), sent };
      if (sent) this.log.log(`${sent} rappel(s) envoyé(s)`);
      return { sent };
    } finally {
      this.running = false;
    }
  }
}

@ApiTags('Rappels')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private prisma: PrismaService, private reminders: RemindersService) {}

  @Get()
  async get(@CurrentUser() u: AuthUser) {
    const settings = await this.reminders.settings(u.id);
    const me = await this.prisma.user.findUnique({ where: { id: u.id }, select: { lang: true } });
    const routine = await this.prisma.routine.findFirst({ where: { userId: u.id, active: true, blocked: false }, include: { steps: true } });
    const products = routine ? await this.prisma.product.findMany({ where: { id: { in: routine.steps.map((s) => s.productId!).filter(Boolean) } }, select: { id: true, brand: true, name: true } }) : [];
    const pName = new Map(products.map((p) => [p.id, `${p.brand} ${p.name}`]));
    return {
      settings,
      timezone: TZ,
      schedule: routine ? this.reminders.schedule(settings, routine.steps.map((s) => ({ ...s, productName: routineStepProductName(s, pName) })), me?.lang) : [],
    };
  }

  @Put()
  async update(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(SettingsZ, body);
    await this.prisma.reminderSettings.upsert({ where: { userId: u.id }, create: { userId: u.id, ...b }, update: b });
    return this.get(u);
  }
}

/**
 * Tâches planifiées appelées par un service cron externe (Render Cron Job, cron-job.org…) :
 * en-tête « x-cron-secret: <CRON_SECRET> ».
 */
@ApiTags('Cron')
@Controller('cron')
export class CronController {
  constructor(private reminders: RemindersService, private prices: PriceSyncService) {}

  private check(secret?: string) {
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) throw new ForbiddenException('CRON_SECRET invalide');
  }

  @Post('reminders')
  remindersRun(@Headers('x-cron-secret') secret?: string) {
    this.check(secret);
    return this.reminders.run();
  }

  @Post('prices')
  async pricesRun(@Headers('x-cron-secret') secret?: string) {
    this.check(secret);
    void this.prices.refreshAll(); // plusieurs minutes : réponse immédiate
    return { started: true };
  }
}

@Module({ imports: [CatalogModule], controllers: [RemindersController, CronController], providers: [RemindersService], exports: [RemindersService] })
export class RemindersModule {}
