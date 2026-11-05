/**
 * Données de référence d'une base neuve (production) — SANS comptes de démonstration :
 * règles de routine (matrice validée) et guides. Idempotent : peut être relancé sans doublon.
 *
 * Mise en service complète d'une base vide :
 *   npx ts-node prisma/bootstrap.ts        → règles de routine + guides
 *   npx ts-node prisma/import-catalog.ts   → catalogue réel (produits, prix, photos, liens d'achat) + publicités maison
 *   npx ts-node prisma/rituals.ts          → 26 rituels
 */
import { PrismaClient } from '@prisma/client';
import { ARTICLES, RULES } from './seed';

async function main() {
  const prisma = new PrismaClient();
  try {
    const rules = await prisma.routineRule.count();
    if (!rules) {
      for (const r of RULES) await prisma.routineRule.create({ data: r as never });
      console.log(`✓ ${RULES.length} règles de routine créées`);
    } else console.log(`= ${rules} règles de routine déjà présentes`);

    let n = 0;
    for (const a of ARTICLES) {
      // Guides « à valider » par le pharmacien conseil (aucune fausse mention de validation)
      const data = { ...a, validatedBy: null };
      await prisma.article.upsert({ where: { slug: a.slug }, create: data, update: { title: a.title, summary: a.summary, body: a.body, tag: a.tag } });
      n++;
    }
    console.log(`✓ ${n} guides à jour`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
