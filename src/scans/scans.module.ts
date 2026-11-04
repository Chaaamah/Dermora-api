import { Body, Controller, ForbiddenException, Get, HttpException, HttpStatus, Module, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, ageFrom, parse } from '../common/auth';
import { safetyAlert } from '../common/safety';
import { OnDeviceScanZ, scoreScan, summarize } from './providers';

const FREE_SCANS_PER_MONTH = Number(process.env.FREE_SCANS_PER_MONTH ?? 10);
export const COSMETIC_NOTICE = 'Analyse cosmétique, pas un avis médical.';

@ApiTags('Diagnostic')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('scans')
export class ScansController {
  constructor(private prisma: PrismaService) {}

  /**
   * RG-07 renforcée : la photo est analysée sur l'appareil de l'utilisatrice et n'est jamais transmise.
   * L'API reçoit uniquement des mesures chiffrées par zone (aucune image, aucun point du visage).
   */
  @Post()
  async analyze(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const scan = parse(OnDeviceScanZ, body);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { skinProfile: true, hairProfile: true, consents: { where: { revokedAt: null } } } });
    const age = ageFrom(user.birthDate);
    if (age === null || age < 18) throw new ForbiddenException('Le diagnostic par selfie est réservé aux 18 ans et plus.');
    const photoConsent = user.consents.find((c) => c.type === 'photos');
    if (!photoConsent?.granted) throw new ForbiddenException('Consentement « analyse de photo » requis.');

    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const used = await this.prisma.scan.count({ where: { userId: u.id, createdAt: { gte: since } } });
    if (used >= FREE_SCANS_PER_MONTH) throw new HttpException(`Limite de ${FREE_SCANS_PER_MONTH} diagnostics par mois atteinte.`, HttpStatus.TOO_MANY_REQUESTS);

    const results = scoreScan(scan, { skinType: user.skinProfile?.skinType, declaredConcerns: user.skinProfile?.concerns ?? [] });
    const saved = await this.prisma.scan.create({
      data: { userId: u.id, provider: results.engine, costMad: 0, results: results as never, summary: summarize(results, user.lang), photoKept: false },
    });
    return { ...saved, notice: COSMETIC_NOTICE, alert: safetyAlert(user.skinProfile, user.hairProfile), remainingThisMonth: FREE_SCANS_PER_MONTH - used - 1 };
  }

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const scans = await this.prisma.scan.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } });
    return scans.map((s) => ({ ...s, notice: COSMETIC_NOTICE }));
  }

  @Get(':id')
  async one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.prisma.scan.findFirst({ where: { id, userId: u.id } });
    if (!s) throw new NotFoundException();
    return { ...s, notice: COSMETIC_NOTICE };
  }
}

@Module({ controllers: [ScansController] })
export class ScansModule {}
