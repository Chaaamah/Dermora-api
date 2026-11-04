/* eslint-disable no-console */
/**
 * Importe le catalogue RÉEL (prisma/catalog.json, produit par prisma/research/build-catalog.mjs) :
 *  - parapharmacies marocaines réelles (prix relevés automatiquement chaque jour ensuite)
 *  - produits effectivement vendus au Maroc, photo et lien d'achat réels
 *  - supprime le catalogue et les marchands fictifs de démonstration
 *  - remplace les publicités fictives par des annonces maison Dermora
 *  - régénère les routines actives sur le nouveau catalogue
 * Les produits importés sont « à valider » : seul le pharmacien conseil peut les valider (back-office).
 * Usage : npx ts-node prisma/import-catalog.ts
 */
import 'reflect-metadata';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { RoutineEngine } from '../src/routines/engine.service';

const prisma = new PrismaClient();

interface Spec {
  key: string; brand: string; name: string; domain?: string; category: string; size?: number; months: number;
  types: string[]; concerns: string[]; avoid?: string[]; natural?: boolean; ings: string[]; desc: string; how: string; prec?: string;
  image: string | null;
  offers: Array<{ site: string; externalId: number; title: string; url: string; priceMad: number; regularMad: number; inStock: boolean; image: string | null }>;
}

// Ingrédients (fonction et précautions) — à revoir par le pharmacien conseil
const INGREDIENTS: Record<string, { nameFr: string; fn: string; pregnancyUnsafe?: boolean; irritant?: boolean; precautions?: string }> = {
  'CERAMIDE NP': { nameFr: 'Céramides', fn: 'Restaure la barrière cutanée' },
  'SODIUM HYALURONATE': { nameFr: 'Acide hyaluronique', fn: 'Hydratant' },
  NIACINAMIDE: { nameFr: 'Niacinamide (vitamine B3)', fn: 'Pores, sébum, taches' },
  'SALICYLIC ACID': { nameFr: 'Acide salicylique (BHA)', fn: 'Désobstrue les pores', pregnancyUnsafe: true, irritant: true, precautions: 'Éviter à forte concentration pendant la grossesse.' },
  'GLYCOLIC ACID': { nameFr: 'Acide glycolique (AHA)', fn: 'Exfoliant', irritant: true, precautions: 'Photosensibilisant : protection solaire indispensable.' },
  'ZINC PCA': { nameFr: 'Zinc PCA', fn: 'Régule le sébum' },
  PANTHENOL: { nameFr: 'Panthénol (vitamine B5)', fn: 'Apaisant' },
  MADECASSOSIDE: { nameFr: 'Madécassoside (Centella asiatica)', fn: 'Apaisant, réparateur' },
  'SHEA BUTTER': { nameFr: 'Beurre de karité', fn: 'Nourrissant' },
  'TRANEXAMIC ACID': { nameFr: 'Acide tranexamique', fn: 'Unifie le teint', precautions: 'Demander l’avis d’un professionnel pendant la grossesse.' },
  'AZELAIC ACID': { nameFr: 'Acide azélaïque', fn: 'Imperfections, taches, rougeurs' },
  RETINOL: { nameFr: 'Rétinol', fn: 'Rides, texture, marques', pregnancyUnsafe: true, irritant: true, precautions: 'Interdit pendant la grossesse et l’allaitement. Le soir uniquement, protection solaire obligatoire.' },
  'AVENE THERMAL SPRING WATER': { nameFr: 'Eau thermale d’Avène', fn: 'Apaisante' },
  'METHOXYPROPYLAMINO CYCLOHEXENYLIDENE ETHOXYETHYLCYANOACETATE': { nameFr: 'Mexoryl 400', fn: 'Filtre UVA ultra-longs' },
  'ISOBUTYLAMIDO THIAZOLYL RESORCINOL': { nameFr: 'Thiamidol', fn: 'Anti-taches' },
  'ROSA DAMASCENA FLOWER WATER': { nameFr: 'Eau de rose', fn: 'Tonifiant, apaisant' },
  'ARGANIA SPINOSA KERNEL OIL': { nameFr: 'Huile d’argan', fn: 'Nourrissant, peau et cheveux' },
  'MOROCCAN LAVA CLAY': { nameFr: 'Ghassoul', fn: 'Nettoyant doux, absorbe le sébum' },
  'CICLOPIROX OLAMINE': { nameFr: 'Ciclopirox olamine', fn: 'Antipelliculaire' },
  'ZINC PYRITHIONE': { nameFr: 'Pyrithione de zinc', fn: 'Antipelliculaire' },
  'MANGIFERA INDICA SEED BUTTER': { nameFr: 'Beurre de mangue', fn: 'Nourrissant' },
};

const WEB = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100';

async function main() {
  const file = path.join(__dirname, 'catalog.json');
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as { collectedAt: string; sites: Array<{ id: string; name: string; base: string; city: string }>; products: Spec[] };
  const collectedAt = new Date(catalog.collectedAt);

  // 1. Marchands réels
  const merchantIds: Record<string, string> = {};
  for (const s of catalog.sites) {
    const existing = await prisma.merchant.findFirst({ where: { name: s.name } });
    const data = { name: s.name, type: 'ONLINE', city: s.city, website: s.base, verified: true, platform: 'woocommerce', apiBase: s.base };
    const m = existing ? await prisma.merchant.update({ where: { id: existing.id }, data }) : await prisma.merchant.create({ data });
    merchantIds[s.id] = m.id;
  }

  // 2. Ingrédients
  const ingIds: Record<string, string> = {};
  for (const [inci, m] of Object.entries(INGREDIENTS)) {
    const data = { nameFr: m.nameFr, function: m.fn, pregnancyUnsafe: !!m.pregnancyUnsafe, irritant: !!m.irritant, precautions: m.precautions ?? null };
    const i = await prisma.ingredient.upsert({ where: { inci }, create: { inci, ...data }, update: data });
    ingIds[inci] = i.id;
  }

  // 3. Produits réels
  let imported = 0;
  for (const p of catalog.products) {
    if (!p.offers.length) continue;
    const imgOffer = p.offers.find((o) => o.image && o.inStock) ?? p.offers.find((o) => o.image);
    const data = {
      brand: p.brand, name: p.name, domain: p.domain ?? 'skin', category: p.category, sizeMl: p.size ?? null, monthsSupply: p.months,
      skinTypes: p.types, concerns: p.concerns, avoidFor: p.avoid ?? [], description: p.desc, howTo: p.how, precautions: p.prec ?? null,
      isNatural: !!p.natural, imageUrl: imgOffer?.image ?? null, imageSource: imgOffer ? catalog.sites.find((s) => s.id === imgOffer.site)?.name ?? null : null,
      status: 'ACTIVE',
    };
    const prod = await prisma.product.upsert({ where: { sourceKey: p.key }, create: { sourceKey: p.key, ...data }, update: data });
    await prisma.productIngredient.deleteMany({ where: { productId: prod.id } });
    for (const [idx, inci] of p.ings.entries()) {
      if (ingIds[inci]) await prisma.productIngredient.create({ data: { productId: prod.id, ingredientId: ingIds[inci], key: idx < 3 } });
    }
    await prisma.offer.deleteMany({ where: { productId: prod.id } });
    for (const o of p.offers) {
      await prisma.offer.create({
        data: { productId: prod.id, merchantId: merchantIds[o.site], priceMad: o.priceMad, regularMad: o.regularMad || null, inStock: o.inStock, url: o.url, externalId: String(o.externalId), updatedAt: collectedAt },
      });
    }
    imported++;
  }

  // 4. Retrait du catalogue fictif
  const demoProducts = await prisma.product.deleteMany({ where: { sourceKey: null } });
  const demoMerchants = await prisma.merchant.deleteMany({ where: { name: { endsWith: '(démo)' } } });

  // 5. Contenus : en attente de validation par le pharmacien conseil (aucune fausse mention de validation)
  await prisma.ritual.updateMany({ where: { validatedBy: { contains: '(démo)' } }, data: { validatedBy: null, validatedAt: null } });
  await prisma.article.updateMany({ where: { validatedBy: { contains: '(démo)' } }, data: { validatedBy: null } });

  // 6. Publicités : annonces maison à la place des annonceurs fictifs
  await prisma.ad.updateMany({ where: { advertiser: { endsWith: '(démo)' } }, data: { active: false } });
  if (!(await prisma.ad.count({ where: { advertiser: 'Dermora', active: true } }))) {
    await prisma.ad.createMany({ data: [
      { placement: 'home_banner', advertiser: 'Dermora', title: 'Votre routine en 3 minutes', body: 'Questionnaire, selfie et produits disponibles au Maroc, dans votre budget.', cta: 'Commencer', url: `${WEB}/register`, tone: 'rose' },
      { placement: 'discovery_inline', advertiser: 'Dermora', title: 'Un dermatologue à vos côtés', body: 'Partagez votre dossier et échangez avec un dermatologue inscrit à l’Ordre.', cta: 'Créer mon espace', url: `${WEB}/register`, tone: 'night' },
      { placement: 'discovery_inline', advertiser: 'Dermora', title: 'Les prix du Maroc, mis à jour chaque jour', body: 'Comparez les parapharmacies avant d’acheter.', cta: 'Voir le catalogue', url: `${WEB}/decouvrir`, tone: 'gold' },
      { placement: 'guide_inline', advertiser: 'Dermora', title: 'Une question sur votre peau ?', body: 'Notre assistante et nos dermatologues vous répondent.', cta: 'Poser ma question', url: `${WEB}/register`, tone: 'rose' },
      { placement: 'guide_inline', advertiser: 'Dermora', title: 'Diagnostic selfie', body: 'Analyse par zone en quelques secondes.', cta: 'Essayer', url: `${WEB}/register`, tone: 'gold' },
    ] });
  }

  // 7. Routines actives recalculées sur le catalogue réel
  const engine = new RoutineEngine(prisma as never);
  const routines = await prisma.routine.findMany({ where: { active: true } });
  let regenerated = 0;
  for (const r of routines) {
    try { await engine.generate(r.userId, r.budgetMad); regenerated++; } catch (e) { console.warn(`Routine ${r.userId} : ${(e as Error).message}`); }
  }

  console.log(`✓ ${imported} produits réels importés (relevé du ${collectedAt.toLocaleString('fr-MA')})`);
  console.log(`✓ catalogue fictif retiré : ${demoProducts.count} produits, ${demoMerchants.count} marchands`);
  console.log(`✓ ${regenerated} routine(s) régénérée(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
