/**
 * Supprime les comptes de démonstration (et toutes leurs données : analyses, routines, messages, suivis…).
 *   npx ts-node prisma/remove-demo.ts            → liste seulement
 *   npx ts-node prisma/remove-demo.ts --apply    → supprime
 * SQL direct : fonctionne même si la base n'a pas encore les dernières colonnes.
 */
import { PrismaClient } from '@prisma/client';

const DEMO = ['sara@dermora.ma', 'imane@dermora.ma', 'salma@dermora.ma', 'nadia@dermora.ma', 'youssef@dermora.ma'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const found = await prisma.$queryRawUnsafe<{ email: string; role: string }[]>(
      `SELECT email, role::text AS role FROM app."User" WHERE email = ANY($1::text[])`, DEMO,
    );
    console.log(found.length ? `Comptes de démonstration trouvés : ${found.map((u) => `${u.email} (${u.role})`).join(', ')}` : 'Aucun compte de démonstration dans cette base.');
    if (!found.length || !process.argv.includes('--apply')) return;
    const n = await prisma.$executeRawUnsafe(`DELETE FROM app."User" WHERE email = ANY($1::text[])`, DEMO);
    console.log(`✓ ${n} compte(s) supprimé(s) avec leurs données.`);
  } finally {
    await prisma.$disconnect();
  }
}
main();
