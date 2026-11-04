import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException, OnApplicationBootstrap, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { AuditService, PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, parse, z } from '../common/auth';
import { CatalogModule } from '../catalog/catalog.module';
import { PriceSyncService } from '../catalog/price-sync.service';
import { freshOffers } from '../catalog/pricing';
import { hashPassword } from '../auth/auth.module';

/**
 * Compte super administrateur créé au démarrage à partir de ADMIN_EMAIL / ADMIN_PASSWORD (variables d'environnement,
 * jamais dans le code). Le mot de passe n'est utilisé qu'à la création : un compte existant garde le sien.
 */
@Injectable()
export class AdminBootstrap implements OnApplicationBootstrap {
  private log = new Logger('Admin');
  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email) return;
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== 'ADMIN') {
        await this.prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), verifyTokenHash: null } });
        this.log.log(`${email} promu super administrateur`);
      }
      return;
    }
    if (!password || password.length < 8) { this.log.warn('ADMIN_PASSWORD manquant ou trop court : compte administrateur non créé'); return; }
    await this.prisma.user.create({ data: { email, passwordHash: await hashPassword(password), role: 'ADMIN', firstName: 'Aevora', emailVerifiedAt: new Date() } });
    this.log.log(`Compte super administrateur créé : ${email}`);
  }
}

const page = (q: { page?: string }) => Math.max(0, Number(q.page ?? 0) || 0);
const PAGE = 30;

const AdZ = z.object({
  placement: z.enum(['home_banner', 'discovery_inline', 'guide_inline']),
  advertiser: z.string().trim().min(2).max(80), title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(300),
  cta: z.string().trim().min(2).max(40), url: z.string().trim().url(), tone: z.enum(['rose', 'gold', 'night']).default('rose'), active: z.boolean().default(true),
});

/** Back-office Dermora : tableau de bord, comptes, dermatologues, catalogue, contenus, publicités, signalements, audit. */
@ApiTags('Back-office')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles('ADMIN', 'EXPERT')
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService, private audit: AuditService, private prices: PriceSyncService) {}

  // ───────── Tableau de bord ─────────

  @Get('stats')
  async stats() {
    const week = new Date(Date.now() - 7 * 86_400_000);
    const [clients, derms, dermsPending, newUsers, unverified, scans, scansWeek, routines, checks, clicks, openReports, products, withdrawn, productsToValidate, ritualsToValidate, careActive, careRequests, messagesWeek] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.dermatologist.count(),
      this.prisma.dermatologist.count({ where: { verified: false } }),
      this.prisma.user.count({ where: { createdAt: { gte: week } } }),
      this.prisma.user.count({ where: { verifyTokenHash: { not: null }, emailVerifiedAt: null } }),
      this.prisma.scan.count(),
      this.prisma.scan.count({ where: { createdAt: { gte: week } } }),
      this.prisma.routine.count({ where: { active: true, blocked: false } }),
      this.prisma.routineCheck.count(),
      this.prisma.clickEvent.count(),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      this.prisma.product.count({ where: { status: 'WITHDRAWN' } }),
      this.prisma.product.count({ where: { validatedAt: null, status: 'ACTIVE' } }),
      this.prisma.ritual.count({ where: { validatedAt: null } }),
      this.prisma.careLink.count({ where: { status: 'ACTIVE' } }),
      this.prisma.careLink.count({ where: { status: 'PENDING' } }),
      this.prisma.message.count({ where: { createdAt: { gte: week } } }),
    ]);
    const tiers = await this.prisma.routine.groupBy({ by: ['tier'], where: { active: true, blocked: false }, _count: { _all: true } });
    return {
      clients, derms, dermsPending, newUsers, unverified, scans, scansWeek, routines, checks, clicks, openReports,
      products, withdrawn, productsToValidate, ritualsToValidate, careActive, careRequests, messagesWeek,
      tiers: Object.fromEntries(tiers.map((t) => [t.tier ?? 'aucune', t._count._all])),
      prices: this.prices.lastRun,
      requireValidation: process.env.REQUIRE_EXPERT_VALIDATION === 'true',
    };
  }

  // ───────── Comptes ─────────

  @Get('users')
  async users(@Query() q: { q?: string; role?: string; page?: string }) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role as never } : {}),
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { firstName: { contains: q.q, mode: 'insensitive' } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: page(q) * PAGE, take: PAGE,
        select: { id: true, email: true, firstName: true, role: true, city: true, lang: true, createdAt: true, emailVerifiedAt: true, verifyTokenHash: true, _count: { select: { scans: true, routines: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      total, page: page(q), pageSize: PAGE,
      items: items.map(({ verifyTokenHash, ...u }) => ({ ...u, active: !(verifyTokenHash && !u.emailVerifiedAt) })),
    };
  }

  @Roles('ADMIN')
  @Patch('users/:id')
  async updateUser(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ role: z.enum(['CLIENT', 'DERMATOLOGIST', 'EXPERT', 'ADMIN']).optional(), firstName: z.string().trim().min(1).max(80).optional() }), body);
    if (id === me.id && b.role && b.role !== 'ADMIN') throw new ForbiddenException('Vous ne pouvez pas retirer votre propre rôle administrateur.');
    await this.audit.log(me.id, `update_user:${JSON.stringify(b)}`, `user:${id}`);
    return this.prisma.user.update({ where: { id }, data: b, select: { id: true, role: true, firstName: true } });
  }

  /** Activation manuelle d'un compte (e-mail d'activation non reçu) */
  @Roles('ADMIN')
  @Post('users/:id/activate')
  async activateUser(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.audit.log(me.id, 'activate_user', `user:${id}`);
    await this.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date(), verifyTokenHash: null, verifyExpiresAt: null } });
    return { ok: true };
  }

  @Roles('ADMIN')
  @Delete('users/:id')
  async deleteUser(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    if (id === me.id) throw new ForbiddenException('Vous ne pouvez pas supprimer votre propre compte ici.');
    await this.audit.log(me.id, 'delete_user', `user:${id}`);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  // ───────── Dermatologues ─────────

  @Get('dermatologists')
  async derms() {
    const list = await this.prisma.dermatologist.findMany({
      orderBy: [{ verified: 'asc' }, { fullName: 'asc' }],
      include: { user: { select: { email: true, createdAt: true } }, _count: { select: { links: { where: { status: 'ACTIVE' } } } } },
    });
    return list.map(({ user, _count, ...d }) => ({ ...d, email: user.email, createdAt: user.createdAt, patients: _count.links }));
  }

  @Patch('dermatologists/:id/verify')
  async verify(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ verified: z.boolean() }), body);
    await this.audit.log(u.id, `verify_derm:${b.verified}`, `dermatologist:${id}`);
    return this.prisma.dermatologist.update({ where: { id }, data: { verified: b.verified } });
  }

  // ───────── Catalogue ─────────

  @Get('products')
  async products(@Query() q: { q?: string; status?: string; validated?: string }) {
    const where: Prisma.ProductWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.validated === 'no' ? { validatedAt: null } : q.validated === 'yes' ? { validatedAt: { not: null } } : {}),
      ...(q.q ? { OR: [{ brand: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const list = await this.prisma.product.findMany({ where, orderBy: [{ brand: 'asc' }, { name: 'asc' }], include: { offers: { include: { merchant: true } } } });
    return list.map((p) => {
      const fresh = freshOffers(p.offers);
      return {
        id: p.id, brand: p.brand, name: p.name, category: p.category, domain: p.domain, imageUrl: p.imageUrl, status: p.status,
        validatedAt: p.validatedAt, validatedBy: p.validatedBy, sponsored: p.sponsored,
        offers: p.offers.length, freshOffers: fresh.length, minPrice: fresh.length ? Math.min(...fresh.map((o) => o.priceMad)) : null,
        merchants: [...new Set(p.offers.map((o) => o.merchant.name))],
      };
    });
  }

  /** RG-09 — retrait immédiat d'un produit visé par une interdiction (AMMPS) */
  @Post('products/:id/withdraw')
  async withdraw(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.audit.log(u.id, 'withdraw_product', `product:${id}`);
    return this.prisma.product.update({ where: { id }, data: { status: 'WITHDRAWN' } });
  }

  @Post('products/:id/restore')
  async restore(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.audit.log(u.id, 'restore_product', `product:${id}`);
    return this.prisma.product.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  /** Relevé immédiat des prix chez les marchands (quelques minutes, en tâche de fond) */
  @Post('prices/refresh')
  async refreshPrices(@CurrentUser() u: AuthUser) {
    await this.audit.log(u.id, 'prices_refresh', 'offers');
    void this.prices.refreshAll();
    return { started: true };
  }

  @Get('prices/status')
  pricesStatus() {
    return this.prices.lastRun ?? { at: null };
  }

  // ───────── Contenus : validation par le pharmacien conseil ─────────

  @Get('rituals')
  rituals() {
    return this.prisma.ritual.findMany({ orderBy: { name: 'asc' }, select: { id: true, slug: true, name: true, category: true, forDomain: true, avoidFor: true, validatedAt: true, validatedBy: true } });
  }

  @Get('articles')
  articles() {
    return this.prisma.article.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, slug: true, title: true, tag: true, readMinutes: true, validatedBy: true, createdAt: true } });
  }

  /** Validation (ou retrait de validation avec validatedBy: null). Publiés si REQUIRE_EXPERT_VALIDATION=true. */
  @Patch('validate/:kind/:id')
  async validate(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ validatedBy: z.string().min(3).max(120).nullable() }), body);
    await this.audit.log(u.id, b.validatedBy ? 'validate_content' : 'unvalidate_content', `${kind}:${id}`);
    const at = b.validatedBy ? new Date() : null;
    if (kind === 'product') return this.prisma.product.update({ where: { id }, data: { validatedBy: b.validatedBy, validatedAt: at } });
    if (kind === 'ritual') return this.prisma.ritual.update({ where: { id }, data: { validatedBy: b.validatedBy, validatedAt: at } });
    if (kind === 'article') return this.prisma.article.update({ where: { id }, data: { validatedBy: b.validatedBy } });
    throw new BadRequestException('kind : product | ritual | article');
  }

  // ───────── Publicités ─────────

  @Roles('ADMIN')
  @Get('ads')
  ads() {
    return this.prisma.ad.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] });
  }

  @Roles('ADMIN')
  @Post('ads')
  async createAd(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(AdZ, body);
    await this.audit.log(u.id, 'create_ad', b.title);
    return this.prisma.ad.create({ data: b });
  }

  @Roles('ADMIN')
  @Patch('ads/:id')
  async updateAd(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(AdZ.partial(), body);
    await this.audit.log(u.id, 'update_ad', `ad:${id}`);
    return this.prisma.ad.update({ where: { id }, data: b });
  }

  @Roles('ADMIN')
  @Delete('ads/:id')
  async deleteAd(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.audit.log(u.id, 'delete_ad', `ad:${id}`);
    await this.prisma.ad.delete({ where: { id } });
    return { deleted: true };
  }

  // ───────── Signalements ─────────

  @Get('reports')
  async reports() {
    const list = await this.prisma.report.findMany({ orderBy: [{ status: 'desc' }, { createdAt: 'desc' }] });
    const ids = [...new Set(list.map((r) => r.productId).filter(Boolean))] as string[];
    const uids = [...new Set(list.map((r) => r.userId).filter(Boolean))] as string[];
    const [prods, users] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, brand: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, email: true } }),
    ]);
    const pm = new Map(prods.map((p) => [p.id, `${p.brand} · ${p.name}`]));
    const um = new Map(users.map((x) => [x.id, x.email]));
    return list.map((r) => ({ ...r, product: r.productId ? pm.get(r.productId) ?? null : null, userEmail: r.userId ? um.get(r.userId) ?? null : null }));
  }

  @Patch('reports/:id')
  async updateReport(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']) }), body);
    await this.audit.log(u.id, `report:${b.status}`, `report:${id}`);
    const r = await this.prisma.report.update({ where: { id }, data: b }).catch(() => null);
    if (!r) throw new NotFoundException();
    return r;
  }

  // ───────── Journal d'audit ─────────

  @Get('audit')
  async auditLog() {
    const logs = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
    const actors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actorId))] } }, select: { id: true, email: true, firstName: true } });
    const am = new Map(actors.map((a) => [a.id, a.email ?? a.firstName ?? a.id]));
    return logs.map((l) => ({ ...l, actor: am.get(l.actorId) ?? l.actorId }));
  }
}

@Module({ imports: [CatalogModule], controllers: [AdminController], providers: [AdminBootstrap] })
export class AdminModule {}
