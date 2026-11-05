import { Body, Controller, Delete, Get, Module, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, OptionalAuth, parse, z } from '../common/auth';
import { bestPrice, freshOffers, monthlyCost } from './pricing';
import { PriceSyncService } from './price-sync.service';

/** En production, seuls les produits validés par l'expert conseil sont publiés (REQUIRE_EXPERT_VALIDATION=true). */
export const requireValidation = () => process.env.REQUIRE_EXPERT_VALIDATION === 'true';

const productInclude = {
  offers: { include: { merchant: true } },
  ingredients: { include: { ingredient: true } },
} satisfies Prisma.ProductInclude;

type FullProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function serializeProduct(p: FullProduct) {
  const offers = freshOffers(p.offers);
  const price = offers[0]?.priceMad ?? null;
  return {
    id: p.id, brand: p.brand, name: p.name, domain: p.domain, category: p.category, sizeMl: p.sizeMl,
    skinTypes: p.skinTypes, concerns: p.concerns, avoidFor: p.avoidFor, description: p.description,
    howTo: p.howTo, precautions: p.precautions, isNatural: p.isNatural, origin: p.origin, sponsored: p.sponsored,
    imageUrl: p.imageUrl, imageSource: p.imageSource,
    validated: !!(p.validatedBy && p.validatedAt), validatedBy: p.validatedBy, price, monthlyMad: price ? monthlyCost(price, p.monthsSupply) : null,
    ingredients: p.ingredients
      .sort((a, b) => Number(b.key) - Number(a.key))
      .map((i) => ({ inci: i.ingredient.inci, name: i.ingredient.nameFr, function: i.ingredient.function, key: i.key, pregnancyUnsafe: i.ingredient.pregnancyUnsafe, irritant: i.ingredient.irritant, precautions: i.ingredient.precautions })),
    offers: offers.map((o) => ({ id: o.id, merchantId: o.merchantId, merchant: o.merchant.name, merchantType: o.merchant.type, city: o.merchant.city, website: o.merchant.website, partner: o.merchant.partner, verified: o.merchant.verified, priceMad: o.priceMad, regularMad: o.regularMad, url: o.url, updatedAt: o.updatedAt })),
  };
}

@ApiTags('Produits et contenus')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class CatalogController {
  constructor(private prisma: PrismaService) {}

  @OptionalAuth()
  @Get('products')
  async list(@Query('q') q?: string, @Query('category') category?: string, @Query('domain') domain?: string, @Query('concern') concern?: string, @Query('origin') origin?: string) {
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE', ...(requireValidation() ? { validatedAt: { not: null } } : {}) };
    if (category) where.category = category;
    if (domain) where.domain = domain;
    if (concern) where.concerns = { has: concern };
    if (origin) where.origin = origin.toUpperCase();
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }];
    const items = await this.prisma.product.findMany({ where, include: productInclude, orderBy: [{ brand: 'asc' }] });
    return items.map(serializeProduct).filter((p) => p.price !== null);
  }

  @OptionalAuth()
  @Get('products/:id')
  async one(@Param('id') id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, status: 'ACTIVE' }, include: productInclude });
    if (!p) throw new NotFoundException('Produit introuvable');
    return serializeProduct(p);
  }

  @OptionalAuth()
  @Get('products/:id/offers')
  async offers(@Param('id') id: string) {
    return (await this.one(id)).offers;
  }

  @OptionalAuth()
  @Get('rituals')
  rituals() {
    return this.prisma.ritual.findMany({ where: requireValidation() ? { validatedAt: { not: null } } : {}, orderBy: { name: 'asc' } });
  }

  @OptionalAuth()
  @Get('articles')
  articles() {
    return this.prisma.article.findMany({ where: requireValidation() ? { validatedBy: { not: null } } : {}, orderBy: { createdAt: 'asc' } });
  }

  /** Lien d'achat suivi (base des commissions d'affiliation) */
  @OptionalAuth()
  @Post('clicks')
  async click(@CurrentUser() u: AuthUser | undefined, @Body() body: unknown) {
    const b = parse(z.object({ productId: z.string(), merchantId: z.string() }), body);
    await this.prisma.clickEvent.create({ data: { ...b, userId: u?.id } });
    return { ok: true };
  }

  @Post('reports')
  async report(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ kind: z.enum(['counterfeit', 'reaction', 'wrong_price', 'other']), productId: z.string().optional(), message: z.string().min(3).max(1000) }), body);
    return this.prisma.report.create({ data: { ...b, userId: u.id } });
  }

  @Get('favorites')
  async favorites(@CurrentUser() u: AuthUser) {
    const favs = await this.prisma.favorite.findMany({ where: { userId: u.id }, include: { product: { include: productInclude } }, orderBy: { createdAt: 'desc' } });
    return favs.map((f) => serializeProduct(f.product));
  }

  @Post('favorites/:productId')
  async addFav(@CurrentUser() u: AuthUser, @Param('productId') productId: string) {
    await this.prisma.favorite.upsert({ where: { userId_productId: { userId: u.id, productId } }, create: { userId: u.id, productId }, update: {} });
    return { ok: true };
  }

  @Delete('favorites/:productId')
  async delFav(@CurrentUser() u: AuthUser, @Param('productId') productId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId: u.id, productId } });
    return { ok: true };
  }
}

export { bestPrice, productInclude };

@Module({ controllers: [CatalogController], providers: [PriceSyncService], exports: [PriceSyncService] })
export class CatalogModule {}
