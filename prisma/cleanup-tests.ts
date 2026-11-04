/* Nettoyage des données créées par les tests automatiques (messages de test, compte de test). */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();
const hash = (pw: string) => { const s = randomBytes(16); return `scrypt$${s.toString('hex')}$${scryptSync(pw, s, 64).toString('hex')}`; };

async function main() {
  const msgs = await prisma.message.deleteMany({
    where: { channel: 'CARE', content: { in: ['Bonjour Docteur, voici une photo', 'Zone du menton', 'Analyse partagée', 'Bien reçu, merci Sara.'] } },
  });
  const notifs = await prisma.notification.deleteMany({ where: { body: { in: ['Bonjour Docteur, voici une photo', '📷 Photo', '📊 Analyse de peau partagée', 'Bien reçu, merci Sara.'] } } });
  const users = await prisma.user.deleteMany({ where: { email: { endsWith: '@ex.ma' } } });
  await prisma.user.update({ where: { email: 'imane@dermora.ma' }, data: { passwordHash: hash('Dermora2026'), resetCodeHash: null, resetExpiresAt: null } });
  console.log(`messages: ${msgs.count}, notifications: ${notifs.count}, comptes de test: ${users.count}, mot de passe Imane restauré`);
}
main().finally(() => prisma.$disconnect());
