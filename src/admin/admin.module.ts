import { Body, Controller, Get, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService, PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, parse, z } from '../common/auth';
import { CatalogModule } from '../catalog/catalog.module';
import { PriceSyncService } from '../catalog/price-sync.service';

/** Socle du back-office (dermora-admin) : tableau de bord, vérification des dermatologues, alertes réglementaires. */
@ApiTags('Back-office')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles('ADMIN', 'EXPERT')
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService, private audit: AuditService, private prices: PriceSyncService) {}

  /** Relevé immédiat des prix chez les marchands */
  @Post('prices/refresh')
  async refreshPrices(@CurrentUser() u: AuthUser) {
    await this.audit.log(u.id, 'prices_refresh', 'offers');
    return this.prices.refreshAll();
  }

  @Get('prices/status')
  pricesStatus() {
    return this.prices.lastRun ?? { at: null };
  }

  @Get('stats')
  async stats() {
    const [users, scans, routines, checks, clicks, cost, reports] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.scan.count(),
      this.prisma.routine.count({ where: { active: true, blocked: false } }),
      this.prisma.routineCheck.count(),
      this.prisma.clickEvent.count(),
      this.prisma.scan.aggregate({ _sum: { costMad: true } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
    ]);
    return { users, scans, routines, checks, clicks, analysisCostMad: cost._sum.costMad ?? 0, openReports: reports };
  }

  @Get('dermatologists')
  derms() {
    return this.prisma.dermatologist.findMany({ orderBy: { verified: 'asc' } });
  }

  @Patch('dermatologists/:id/verify')
  async verify(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ verified: z.boolean() }), body);
    await this.audit.log(u.id, `verify_derm:${b.verified}`, `dermatologist:${id}`);
    return this.prisma.dermatologist.update({ where: { id }, data: { verified: b.verified } });
  }

  /** RG-09 — retrait immédiat d'un produit visé par une interdiction (AMMPS) */
  @Post('products/:id/withdraw')
  async withdraw(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.audit.log(u.id, 'withdraw_product', `product:${id}`);
    return this.prisma.product.update({ where: { id }, data: { status: 'WITHDRAWN' } });
  }

  @Get('reports')
  reports() {
    return this.prisma.report.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get('audit')
  auditLog() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }
}

@Module({ imports: [CatalogModule], controllers: [AdminController] })
export class AdminModule {}
