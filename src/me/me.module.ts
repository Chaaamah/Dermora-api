import { Body, Controller, Delete, Get, Module, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, ageFrom, parse, z } from '../common/auth';
import { safetyAlert } from '../common/safety';

const CONSENT_TYPES = ['photos', 'skin_data', 'model_improvement', 'marketing', 'care_sharing'] as const;

@ApiTags('Profil et consentements')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class MeController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      include: {
        skinProfile: true, hairProfile: true, dermatologist: true,
        consents: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' } },
        careLinks: { where: { status: { in: ['PENDING', 'ACTIVE'] } }, include: { dermatologist: true } },
      },
    });
    const consents: Record<string, boolean> = {};
    for (const c of user.consents) if (!(c.type in consents)) consents[c.type] = c.granted;
    const careLink = user.careLinks[0] ?? null;
    return {
      id: user.id, email: user.email, phone: user.phone, role: user.role, firstName: user.firstName, lang: user.lang, city: user.city,
      birthDate: user.birthDate, age: ageFrom(user.birthDate), consents,
      skinProfile: user.skinProfile, hairProfile: user.hairProfile,
      dermatologistProfile: user.dermatologist,
      careLink: careLink && { id: careLink.id, status: careLink.status, dermatologist: { id: careLink.dermatologist.id, fullName: careLink.dermatologist.fullName, city: careLink.dermatologist.city, title: careLink.dermatologist.title } },
      onboarded: !!(user.firstName && user.birthDate && consents.skin_data && user.skinProfile),
      alert: safetyAlert(user.skinProfile, user.hairProfile),
    };
  }

  @Patch()
  async update(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({
      firstName: z.string().trim().min(1).max(60).optional(),
      phone: z.string().trim().regex(/^\+?[0-9 ]{9,18}$/, 'Numéro invalide').optional(),
      lang: z.enum(['fr', 'ar', 'en']).optional(),
      city: z.string().max(60).optional(),
      birthDate: z.string().optional(),
    }), body);
    if (b.birthDate) {
      const age = ageFrom(new Date(b.birthDate));
      if (age === null || age < 18) {
        return { error: 'AGE', message: 'Dermora est réservée aux personnes de 18 ans et plus.' };
      }
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { ...b, birthDate: b.birthDate ? new Date(b.birthDate) : undefined } });
    return this.me(u);
  }

  @Post('consents')
  async consent(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ type: z.enum(CONSENT_TYPES), granted: z.boolean() }), body);
    await this.prisma.consent.updateMany({ where: { userId: u.id, type: b.type, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.consent.create({ data: { userId: u.id, type: b.type, granted: b.granted } });
    if (b.type === 'care_sharing' && !b.granted) {
      // Révoquer le partage termine le suivi en cours
      await this.prisma.careLink.updateMany({ where: { patientId: u.id, status: { in: ['PENDING', 'ACTIVE'] } }, data: { status: 'ENDED' } });
    }
    return this.me(u);
  }

  @Put('skin-profile')
  async skin(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({
      skinType: z.enum(['seche', 'grasse', 'mixte', 'normale']),
      sensitive: z.boolean().default(false),
      phototype: z.number().int().min(1).max(6).default(3),
      concerns: z.array(z.enum(['acne', 'taches', 'rides', 'pores', 'secheresse', 'rougeurs', 'eclat'])).default([]),
      pregnant: z.boolean().default(false),
      breastfeeding: z.boolean().default(false),
      allergies: z.array(z.string().trim().min(2)).default([]),
      currentProducts: z.string().max(500).optional(),
      city: z.string().optional(),
      moleChanging: z.boolean().default(false),
      lesionNotHealing: z.boolean().default(false),
      painfulRash: z.boolean().default(false),
    }), body);
    const { city, ...data } = b;
    if (city) await this.prisma.user.update({ where: { id: u.id }, data: { city } });
    await this.prisma.skinProfile.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data });
    return this.me(u);
  }

  @Put('hair-profile')
  async hair(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({
      curlType: z.enum(['lisse', 'ondule', 'boucle', 'crepu']),
      porosity: z.enum(['faible', 'moyenne', 'forte']),
      scalp: z.enum(['normal', 'gras', 'sec', 'pellicules']),
      hairLoss: z.enum(['non', 'legere', 'importante']).default('non'),
      suddenHairLoss: z.boolean().default(false),
      colored: z.boolean().default(false),
      washPerWeek: z.number().int().min(0).max(14).default(2),
    }), body);
    const data = { ...b, suddenHairLoss: b.suddenHairLoss || b.hairLoss === 'importante' };
    await this.prisma.hairProfile.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data });
    return this.me(u);
  }

  /** DER-06 — export complet des données */
  @Post('export')
  async export(@CurrentUser() u: AuthUser) {
    const data = await this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      include: { consents: true, skinProfile: true, hairProfile: true, scans: true, routines: { include: { steps: true } }, checks: true, notes: true, favorites: true, messages: true, careLinks: true, clinicalNotes: true, productChecks: true },
    });
    return { exportedAt: new Date().toISOString(), data };
  }

  /** DER-06 / RG-12 — suppression totale en un clic */
  @Delete()
  async remove(@CurrentUser() u: AuthUser) {
    await this.prisma.user.delete({ where: { id: u.id } });
    return { deleted: true, note: 'Photos et données de peau effacées ; purge des sauvegardes sous 30 jours.' };
  }
}

@Module({ controllers: [MeController] })
export class MeModule {}
