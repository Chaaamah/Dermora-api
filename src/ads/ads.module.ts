import { Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/common.module';

/**
 * Emplacements publicitaires :
 *  - home_banner      : bannière discrète de la page d'accueil
 *  - discovery_inline : entre les sections des pages publiques de découverte
 *  - guide_inline     : intégrée au contenu des guides et conseils
 * Toute annonce est affichée avec la mention « Publicité » et n'influence jamais la routine (RG-10).
 */
@ApiTags('Publicité')
@Controller('ads')
export class AdsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query('placement') placement: string, @Query('limit') limit = '1', @Query('slot') slot = '0') {
    // Rotation : chaque emplacement d'une même page reçoit une annonce différente
    const ads = await this.prisma.ad.findMany({ where: { placement, active: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const start = ads.length ? (Number(slot) + Math.floor(Date.now() / 3_600_000)) % ads.length : 0;
    const rotated = [...ads.slice(start), ...ads.slice(0, start)];
    const pick = rotated.slice(0, Math.min(Number(limit) || 1, 5));
    if (pick.length) await this.prisma.ad.updateMany({ where: { id: { in: pick.map((a) => a.id) } }, data: { impressions: { increment: 1 } } });
    return pick.map(({ impressions: _i, clicks: _c, ...a }) => ({ ...a, label: 'Publicité' }));
  }

  @Post(':id/click')
  async click(@Param('id') id: string) {
    await this.prisma.ad.updateMany({ where: { id }, data: { clicks: { increment: 1 } } });
    return { ok: true };
  }
}

@Module({ controllers: [AdsController] })
export class AdsModule {}
