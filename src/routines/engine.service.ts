import { Injectable, NotFoundException } from '@nestjs/common';
import type { HairProfile, Prisma, RoutineRule, SkinProfile } from '@prisma/client';
import { PrismaService } from '../common/common.module';
import { safetyAlert } from '../common/safety';
import { productInclude, requireValidation, serializeProduct } from '../catalog/catalog.module';
import { freshOffers, monthlyCost } from '../catalog/pricing';

type FullProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
interface Candidate { product: FullProduct; score: number; cost: number }
interface Slot { key: string; domain: string; category: string; optional: boolean; candidates: Candidate[]; idx: number; dropped: boolean; natural?: Candidate }

const ESSENTIAL = new Set(['cleanser', 'sunscreen', 'moisturizer', 'shampoo']);

/**
 * Moteur de routine — règles validées par l'expert (matrice RoutineRule),
 * exclusions (grossesse, sensibilité, allergies), budget mensuel.
 * Aucun modèle de langage ne choisit de produit ici.
 */
@Injectable()
export class RoutineEngine {
  constructor(private prisma: PrismaService) {}

  eligible(p: FullProduct, skin: SkinProfile | null, hair: HairProfile | null): boolean {
    if (p.status !== 'ACTIVE' || (requireValidation() && !p.validatedAt)) return false;
    if (!freshOffers(p.offers).length) return false;
    const ings = p.ingredients.map((i) => i.ingredient);
    if (ings.some((i) => i.banned)) return false;
    if (skin) {
      if ((skin.pregnant || skin.breastfeeding) && (p.avoidFor.includes('pregnancy') || ings.some((i) => i.pregnancyUnsafe))) return false; // RG-04
      if (skin.sensitive && p.avoidFor.includes('sensitive')) return false;
      const allergies = skin.allergies.map((a) => a.toLowerCase());
      if (allergies.length && ings.some((i) => allergies.some((a) => i.inci.toLowerCase().includes(a) || i.nameFr.toLowerCase().includes(a)))) return false;
    }
    if (p.domain === 'skin' && skin && !(p.skinTypes.includes('all') || p.skinTypes.includes(skin.skinType))) return false;
    if (p.domain === 'hair' && hair && !(p.skinTypes.includes('all') || p.skinTypes.includes(hair.curlType))) return false;
    return true;
  }

  private score(p: FullProduct, concerns: string[], skin: SkinProfile | null, hair: HairProfile | null): number {
    let s = p.concerns.filter((c) => concerns.includes(c)).length * 3;
    if (p.domain === 'skin' && skin && p.skinTypes.includes(skin.skinType)) s += 2;
    if (p.domain === 'hair' && hair && p.skinTypes.includes(hair.curlType)) s += 2;
    if (p.skinTypes.includes('all')) s += 1;
    if (skin?.sensitive && !p.ingredients.some((i) => i.ingredient.irritant)) s += 1;
    return s; // RG-10 : « sponsorisé » n'entre jamais dans le score
  }

  async generate(userId: string, budgetMad: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { skinProfile: true, hairProfile: true, scans: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const skin = user.skinProfile;
    const hair = user.hairProfile;
    await this.prisma.routine.updateMany({ where: { userId, active: true }, data: { active: false } });

    const alert = safetyAlert(skin, hair);
    if (alert) {
      // RG-02 : la routine est bloquée, orientation vers un médecin
      return this.prisma.routine.create({ data: { userId, budgetMad, blocked: true, blockReason: alert, notes: ['Consultez un dermatologue ou un médecin avant de commencer une routine.'] } });
    }
    if (!skin) throw new NotFoundException('Complétez d\'abord le questionnaire peau.');

    const concerns = new Set<string>(skin.concerns);
    const scanConcerns = (user.scans[0]?.results as { concerns?: Record<string, string> } | undefined)?.concerns ?? {};
    for (const [c, lvl] of Object.entries(scanConcerns)) if (lvl === 'marque' || lvl === 'moyen') concerns.add(c);
    if (hair) {
      if (hair.scalp === 'pellicules') concerns.add('pellicules');
      if (hair.hairLoss === 'legere') concerns.add('chute');
      if (hair.porosity === 'forte' || hair.curlType === 'boucle' || hair.curlType === 'crepu') { concerns.add('frisottis'); concerns.add('secheresse'); }
    }
    const cs = [...concerns];

    const rules = await this.prisma.routineRule.findMany({ where: { validated: true, domain: hair ? { in: ['skin', 'hair'] } : 'skin' }, orderBy: [{ moment: 'asc' }, { order: 'asc' }] });
    const products = await this.prisma.product.findMany({ where: { status: 'ACTIVE' }, include: productInclude });

    // Un « slot » par catégorie : un même nettoyant sert matin et soir.
    const slots = new Map<string, Slot>();
    const activeRules: RoutineRule[] = [];
    for (const r of rules) {
      const cond = (r.conditions ?? {}) as { concerns?: string[] };
      if (cond.concerns && !cond.concerns.some((c) => concerns.has(c))) continue;
      const key = `${r.domain}:${r.category}`;
      if (!slots.has(key)) {
        const pool = products.filter((p) => p.domain === r.domain && p.category === r.category && this.eligible(p, skin, hair));
        const toCand = (p: FullProduct): Candidate => ({ product: p, score: this.score(p, cs, skin, hair), cost: monthlyCost(freshOffers(p.offers)[0].priceMad, p.monthsSupply) });
        // Peau : les produits naturels sont proposés comme alternative ; cheveux : ils peuvent être le choix principal.
        const main = pool.filter((p) => r.domain === 'hair' || !p.isNatural).map(toCand);
        // Sérum / soin ciblé : uniquement s'ils répondent à une préoccupation
        const targeted = r.category === 'serum' || r.category === 'treatment' || r.category === 'hair_mask';
        const candidates = (targeted ? main.filter((c) => c.product.concerns.some((x) => concerns.has(x))) : main)
          .sort((a, b) => b.score - a.score || a.cost - b.cost);
        const natural = pool.filter((p) => p.isNatural).map(toCand).sort((a, b) => b.score - a.score)[0];
        if (!candidates.length) continue;
        slots.set(key, { key, domain: r.domain, category: r.category, optional: r.optional, candidates, idx: 0, dropped: false, natural });
      }
      activeRules.push(r);
    }

    // Ajustement au budget (DER-21)
    const total = () => [...slots.values()].filter((s) => !s.dropped).reduce((sum, s) => sum + s.candidates[s.idx].cost, 0);
    let guard = 0;
    while (total() > budgetMad && guard++ < 200) {
      let best: { slot: Slot; idx: number; ratio: number } | null = null;
      for (const s of slots.values()) {
        if (s.dropped) continue;
        const cur = s.candidates[s.idx];
        s.candidates.forEach((c, j) => {
          if (c.cost >= cur.cost) return;
          const ratio = (cur.score - c.score + 0.5) / (cur.cost - c.cost);
          if (!best || ratio < best.ratio) best = { slot: s, idx: j, ratio };
        });
      }
      if (best) { (best as { slot: Slot; idx: number }).slot.idx = (best as { slot: Slot; idx: number }).idx; continue; }
      const droppable = [...slots.values()].filter((s) => !s.dropped && s.optional && !ESSENTIAL.has(s.category))
        .sort((a, b) => b.candidates[b.idx].cost - a.candidates[a.idx].cost)[0];
      if (!droppable) break;
      droppable.dropped = true;
    }
    const totalMad = Math.round(total() * 10) / 10;

    const notes: string[] = [
      'Introduisez un seul nouveau produit à la fois, en suivant les semaines indiquées.',
      'Faites un test sur une petite zone (derrière l\'oreille) 48 h avant chaque nouveau produit.',
      'La protection solaire est indispensable chaque matin, même en hiver.',
    ];
    if (skin.pregnant || skin.breastfeeding) notes.push('Grossesse / allaitement : les ingrédients déconseillés (rétinoïdes, acide salicylique fort…) ont été exclus.');
    if (totalMad > budgetMad) notes.push(`Budget minimum pour une routine sûre : ${Math.ceil(totalMad)} MAD / mois.`);
    const droppedSlots = [...slots.values()].filter((s) => s.dropped);
    if (droppedSlots.length) notes.push('Certaines étapes facultatives ont été retirées pour respecter votre budget.');

    const steps: Prisma.RoutineStepCreateWithoutRoutineInput[] = [];
    for (const r of activeRules) {
      const s = slots.get(`${r.domain}:${r.category}`);
      if (!s || s.dropped) continue;
      const chosen = s.candidates[s.idx];
      const cheaper = s.candidates.filter((c) => c.cost < chosen.cost && c.product.id !== chosen.product.id).sort((a, b) => a.cost - b.cost)[0];
      const frequency = r.category === 'shampoo' && hair ? `${hair.washPerWeek} fois par semaine` : r.frequency;
      steps.push({
        moment: r.moment, order: r.order, step: r.step, category: r.category, productId: chosen.product.id,
        monthlyMad: chosen.cost, frequency, quantity: r.quantity, introWeek: r.introWeek,
        alternatives: { cheaper: cheaper?.product.id ?? null, natural: s.natural && s.natural.product.id !== chosen.product.id ? s.natural.product.id : null },
      });
    }

    return this.prisma.routine.create({ data: { userId, budgetMad, totalMad, notes, steps: { create: steps } } });
  }

  async current(userId: string) {
    const r = await this.prisma.routine.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' }, include: { steps: { orderBy: [{ moment: 'asc' }, { order: 'asc' }] } } });
    if (!r) return null;
    const ids = new Set<string>();
    for (const s of r.steps) {
      if (s.productId) ids.add(s.productId);
      const alt = (s.alternatives ?? {}) as { cheaper?: string; natural?: string };
      if (alt.cheaper) ids.add(alt.cheaper);
      if (alt.natural) ids.add(alt.natural);
    }
    const prods = await this.prisma.product.findMany({ where: { id: { in: [...ids] } }, include: productInclude });
    const map = new Map(prods.map((p) => [p.id, serializeProduct(p)]));
    return {
      ...r,
      steps: r.steps.map((s) => {
        const alt = (s.alternatives ?? {}) as { cheaper?: string; natural?: string };
        return { ...s, product: s.productId ? map.get(s.productId) ?? null : null, cheaper: alt.cheaper ? map.get(alt.cheaper) ?? null : null, natural: alt.natural ? map.get(alt.natural) ?? null : null };
      }),
    };
  }
}
