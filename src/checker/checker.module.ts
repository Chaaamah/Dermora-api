import { Body, Controller, Delete, Get, Injectable, Logger, Module, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, parse, z } from '../common/auth';
import { productInclude, serializeProduct } from '../catalog/catalog.module';
import { freshOffers } from '../catalog/pricing';
import { RoutineEngine } from '../routines/engine.service';
import { RoutinesModule } from '../routines/routines.module';
import { Analysis, CATEGORIES, Profile, analyze, guessCategory, parseInci } from './analyzer';

type FullProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** Catégorie du produit vérifié → catégorie du catalogue où chercher une alternative */
const ALT_CATEGORY: Record<string, string[]> = {
  cleanser: ['cleanser'], toner: ['serum'], serum: ['serum', 'treatment'], treatment: ['treatment', 'serum'], moisturizer: ['moisturizer'],
  sunscreen: ['sunscreen'], mask: ['treatment', 'serum'], shampoo: ['shampoo'], conditioner: ['conditioner'], hair_mask: ['hair_mask', 'conditioner'], hair_oil: ['hair_oil'], other: [],
};

const CheckZ = z.object({
  barcode: z.string().max(32).optional().nullable(),
  productId: z.string().max(40).optional().nullable(),
  brand: z.string().max(120).optional().nullable(),
  name: z.string().min(1).max(200),
  category: z.enum(CATEGORIES).optional().nullable(),
  ingredientsText: z.string().max(8000).optional().nullable(),
  imageUrl: z.string().url().max(500).optional().nullable(),
  source: z.enum(['barcode', 'photo', 'catalog', 'manual']).optional(),
});

@Injectable()
export class CheckerService {
  private log = new Logger('Checker');
  constructor(private prisma: PrismaService, private engine: RoutineEngine) {}

  /** Code-barres → fiche produit : catalogue Dermora puis base libre Open Beauty Facts. */
  async lookup(barcode: string) {
    const code = barcode.replace(/\D/g, '');
    if (code.length < 8) throw new NotFoundException('Code-barres invalide');
    try {
      const r = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_fr,brands,ingredients_text,ingredients_text_fr,ingredients_text_en,categories_tags,image_front_small_url,image_front_url,quantity`, {
        headers: { 'User-Agent': 'Dermora/1.0 (cosmetic routine app; Morocco)' },
        signal: AbortSignal.timeout(8000),
      });
      const j = (await r.json()) as { status?: number; product?: Record<string, unknown> };
      const p = j.product;
      if (r.ok && p && j.status !== 0) {
        const name = String(p.product_name_fr || p.product_name || '').trim();
        const brand = String(p.brands || '').split(',')[0].trim();
        const ingredientsText = String(p.ingredients_text_fr || p.ingredients_text || p.ingredients_text_en || '').trim();
        const cats = Array.isArray(p.categories_tags) ? (p.categories_tags as string[]).join(' ') : '';
        return {
          found: true, source: 'openbeautyfacts', barcode: code, brand: brand || null, name: name || null,
          imageUrl: (p.image_front_url || p.image_front_small_url || null) as string | null,
          quantity: (p.quantity || null) as string | null,
          ingredientsText: ingredientsText || null,
          category: guessCategory(`${name} ${cats}`),
        };
      }
    } catch (e) {
      this.log.warn(`Open Beauty Facts indisponible : ${(e as Error).message}`);
    }
    return { found: false, source: null, barcode: code, brand: null, name: null, imageUrl: null, quantity: null, ingredientsText: null, category: null };
  }

  private async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { skinProfile: true, hairProfile: true, scans: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    const s = user.skinProfile;
    const concerns = new Set<string>(s?.concerns ?? []);
    const scan = (user.scans[0]?.results as { concerns?: Record<string, string>; skinType?: { type?: string } } | undefined) ?? {};
    for (const [c, lv] of Object.entries(scan.concerns ?? {})) if (lv === 'marque' || lv === 'moyen') concerns.add(c);
    const h = user.hairProfile;
    if (h?.scalp === 'pellicules') concerns.add('pellicules');
    if (h?.hairLoss === 'legere') concerns.add('chute');
    if (h && (h.porosity === 'forte' || h.curlType === 'boucle' || h.curlType === 'crepu')) concerns.add('frisottis');
    const profile: Profile = {
      skinType: scan.skinType?.type ?? s?.skinType ?? null,
      sensitive: !!s?.sensitive, concerns: [...concerns], pregnant: !!s?.pregnant, breastfeeding: !!s?.breastfeeding, allergies: s?.allergies ?? [],
    };
    return { profile, skin: s, hair: h };
  }

  /** Jusqu'à 3 produits du catalogue marocain mieux adaptés, avec les raisons. */
  private async alternatives(category: string, a: Analysis, profile: Profile, skin: Awaited<ReturnType<CheckerService['profile']>>['skin'], hair: Awaited<ReturnType<CheckerService['profile']>>['hair'], excludeId?: string | null) {
    const cats = ALT_CATEGORY[category] ?? [];
    if (!cats.length) return [];
    const products = await this.prisma.product.findMany({ where: { status: 'ACTIVE', category: { in: cats }, ...(excludeId ? { id: { not: excludeId } } : {}) }, include: productInclude });
    const flagged = new Set(a.issues.flatMap((i) => i.ingredients));
    const cands = products
      .filter((p) => this.engine.eligible(p, skin, hair) && freshOffers(p.offers).length)
      .map((p) => {
        const inci = p.ingredients.map((i) => i.ingredient.inci);
        const own = analyze({ ingredients: inci, category, name: `${p.brand} ${p.name}`, avoidFor: p.avoidFor, skinTypes: p.skinTypes }, profile);
        const covers = p.concerns.filter((c) => profile.concerns.includes(c));
        const score = this.engine.score(p, profile.concerns, skin, hair) - own.issues.filter((i) => i.level !== 'info').length * 5 + (inci.some((x) => flagged.has(x)) ? -10 : 0);
        return { p, own, covers, score, price: freshOffers(p.offers)[0]?.priceMad ?? Infinity };
      })
      .filter((c) => c.own.verdict !== 'deconseille')
      .sort((x, y) => y.score - x.score || x.price - y.price)
      .slice(0, 3);
    return cands.map(({ p, own, covers }) => ({
      product: serializeProduct(p as FullProduct),
      why: [
        ...(p.skinTypes.includes('all') ? [{ code: 'all_types' }] : profile.skinType && p.skinTypes.includes(profile.skinType) ? [{ code: 'skin_type', value: profile.skinType }] : []),
        ...(covers.length ? [{ code: 'concerns', values: covers }] : []),
        ...(a.issues.some((i) => i.code === 'fragrance') && !own.issues.some((i) => i.code === 'fragrance') ? [{ code: 'no_fragrance' }] : []),
        ...(a.issues.some((i) => i.code === 'comedogenic') ? [{ code: 'non_comedogenic' }] : []),
        ...((profile.pregnant || profile.breastfeeding) && !p.avoidFor.includes('pregnancy') ? [{ code: 'pregnancy_ok' }] : []),
        ...(profile.sensitive && !p.avoidFor.includes('sensitive') ? [{ code: 'sensitive_ok' }] : []),
        ...(own.positives.length ? [{ code: 'actives', values: [...new Set(own.positives.flatMap((x) => x.ingredients))].slice(0, 3) }] : []),
      ],
    }));
  }

  async check(userId: string, body: unknown) {
    const b = parse(CheckZ, body);
    const { profile, skin, hair } = await this.profile(userId);
    let ingredients = parseInci(b.ingredientsText ?? '');
    let category = b.category ?? guessCategory(`${b.name} ${b.brand ?? ''}`);
    let avoidFor: string[] | undefined;
    let skinTypes: string[] | undefined;
    let imageUrl = b.imageUrl ?? null;
    // Produit du catalogue Dermora : ingrédients clés, types de peau et précautions connus
    if (b.productId) {
      const p = await this.prisma.product.findUnique({ where: { id: b.productId }, include: productInclude });
      if (p) {
        if (!ingredients.length) ingredients = p.ingredients.map((i) => i.ingredient.inci);
        avoidFor = p.avoidFor; skinTypes = p.skinTypes; imageUrl ??= p.imageUrl;
        if (!b.category) category = p.category;
      }
    }
    const analysis = analyze({ ingredients, category, name: `${b.brand ?? ''} ${b.name}`, avoidFor, skinTypes }, profile);
    const alternatives = analysis.verdict === 'adapte' ? [] : await this.alternatives(category, analysis, profile, skin, hair, b.productId);
    const saved = await this.prisma.productCheck.create({
      data: {
        userId, barcode: b.barcode ?? null, productId: b.productId ?? null, brand: b.brand ?? null, name: b.name, category, imageUrl,
        ingredientsText: b.ingredientsText ?? null, source: b.source ?? 'manual', verdict: analysis.verdict, result: { analysis, profile: { skinType: profile.skinType, sensitive: profile.sensitive, concerns: profile.concerns } } as never,
      },
    });
    return { ...this.serialize(saved), alternatives };
  }

  serialize(c: { id: string; barcode: string | null; productId: string | null; brand: string | null; name: string; category: string; imageUrl: string | null; source: string; verdict: string; result: unknown; createdAt: Date }) {
    const r = c.result as { analysis: Analysis };
    return { id: c.id, barcode: c.barcode, productId: c.productId, brand: c.brand, name: c.name, category: c.category, imageUrl: c.imageUrl, source: c.source, verdict: c.verdict, analysis: r.analysis, createdAt: c.createdAt };
  }

  /** Ré-analyse une vérification enregistrée (profil à jour) avec ses alternatives. */
  async one(userId: string, id: string) {
    const c = await this.prisma.productCheck.findFirst({ where: { id, userId } });
    if (!c) throw new NotFoundException();
    const { profile, skin, hair } = await this.profile(userId);
    const a = (c.result as unknown as { analysis: Analysis }).analysis;
    const alternatives = a.verdict === 'adapte' ? [] : await this.alternatives(c.category, a, profile, skin, hair, c.productId);
    return { ...this.serialize(c), alternatives };
  }
}

@ApiTags('Mes produits')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('checks')
export class CheckerController {
  constructor(private prisma: PrismaService, private checker: CheckerService) {}

  @Get('lookup/:barcode')
  lookup(@Param('barcode') barcode: string) {
    return this.checker.lookup(barcode);
  }

  @Post()
  check(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.checker.check(u.id, body);
  }

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const items = await this.prisma.productCheck.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    return items.map((c) => this.checker.serialize(c));
  }

  @Get(':id')
  one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.checker.one(u.id, id);
  }

  @Delete(':id')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.productCheck.deleteMany({ where: { id, userId: u.id } });
    return { ok: true };
  }
}

@Module({ imports: [RoutinesModule], controllers: [CheckerController], providers: [CheckerService] })
export class CheckerModule {}
