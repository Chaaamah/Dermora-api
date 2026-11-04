import {
  BadRequestException, Controller, Logger, ServiceUnavailableException, UnprocessableEntityException, ForbiddenException, Get, HttpException, HttpStatus, Module, NotFoundException,
  Param, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, ageFrom } from '../common/auth';
import { safetyAlert } from '../common/safety';
import { PhotoQualityError, getProvider, summarize } from './providers';

const FREE_SCANS_PER_MONTH = Number(process.env.FREE_SCANS_PER_MONTH ?? 3);
export const COSMETIC_NOTICE = 'Analyse cosmétique, pas un avis médical.';

@ApiTags('Diagnostic')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('scans')
export class ScansController {
  constructor(private prisma: PrismaService) {}

  /**
   * Le selfie est analysé en mémoire puis jeté : il n'est jamais écrit sur disque
   * tant que le suivi photo (V2) n'est pas activé (RG-07). Seuls les résultats sont gardés.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async analyze(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { skinProfile: true, hairProfile: true, consents: { where: { revokedAt: null } } } });
    const age = ageFrom(user.birthDate);
    if (age === null || age < 18) throw new ForbiddenException('Le diagnostic par selfie est réservé aux 18 ans et plus.');
    const photoConsent = user.consents.find((c) => c.type === 'photos');
    if (!photoConsent?.granted) throw new ForbiddenException('Consentement « photos du visage » requis.');
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Envoyez une photo au format JPEG, PNG ou WebP.');
    if (file.size < 15_000) throw new BadRequestException('Photo de trop faible qualité : prenez-la en lumière du jour, de face, sans maquillage.');

    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const used = await this.prisma.scan.count({ where: { userId: u.id, createdAt: { gte: since } } });
    if (used >= FREE_SCANS_PER_MONTH) throw new HttpException(`Limite de ${FREE_SCANS_PER_MONTH} diagnostics gratuits par mois atteinte.`, HttpStatus.TOO_MANY_REQUESTS);

    const provider = getProvider();
    const t0 = Date.now();
    let results;
    try {
      results = await provider.analyze(file.buffer, { declaredConcerns: user.skinProfile?.concerns ?? [], skinType: user.skinProfile?.skinType, mimeType: file.mimetype, lang: user.lang });
    } catch (e) {
      file.buffer.fill(0);
      // Photo inexploitable : conseil renvoyé, l'analyse n'est pas décomptée
      if (e instanceof PhotoQualityError) throw new UnprocessableEntityException(e.message);
      new Logger('Scan').error(`Analyse impossible (${provider.name}) : ${(e as Error).message}`);
      throw new ServiceUnavailableException('Analyse momentanément indisponible, réessayez dans quelques minutes.');
    }
    file.buffer.fill(0); // le selfie n'est pas conservé

    const scan = await this.prisma.scan.create({
      data: { userId: u.id, provider: provider.name, costMad: provider.costMad, results: results as never, summary: results.summary?.length ? results.summary : summarize(results, user.lang), photoKept: false },
    });
    return { ...scan, durationMs: Date.now() - t0, notice: COSMETIC_NOTICE, alert: results.medicalFlag ? `${results.medicalFlag} Dermora ne peut pas poser de diagnostic : consultez un dermatologue ou un médecin.` : safetyAlert(user.skinProfile, user.hairProfile), remainingThisMonth: FREE_SCANS_PER_MONTH - used - 1 };
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
