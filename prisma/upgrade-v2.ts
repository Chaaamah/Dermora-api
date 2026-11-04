/* eslint-disable no-console */
/**
 * Mise à niveau v2 sans perte de données :
 * - e-mail + mot de passe pour les comptes de démonstration existants (identifiés par téléphone)
 * - publicités et notifications de démonstration si absentes
 * Les autres comptes sont conservés ; ils devront créer un mot de passe via « Mot de passe oublié ».
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Dermora2026';
const hash = (pw: string) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 64).toString('hex')}`;
};

const DEMO: Record<string, string> = {
  '+212600000001': 'salma@dermora.ma',
  '+212600000002': 'youssef@dermora.ma',
  '+212600000003': 'nadia@dermora.ma',
  '+212600000100': 'sara@dermora.ma',
  '+212600000101': 'imane@dermora.ma',
};

async function main() {
  for (const [phone, email] of Object.entries(DEMO)) {
    const u = await prisma.user.findUnique({ where: { phone } });
    if (u && !u.email) {
      await prisma.user.update({ where: { id: u.id }, data: { email, passwordHash: hash(DEMO_PASSWORD) } });
      console.log(`✓ ${email}`);
    }
  }

  if ((await prisma.ad.count()) === 0) {
    await prisma.ad.createMany({ data: [
      { placement: 'home_banner', advertiser: 'Coopérative Argan Souss (démo)', title: "L'huile d'argan cosmétique, pressée à froid", body: 'Certifiée, traçable, livrée partout au Maroc.', cta: 'Découvrir', url: 'https://example.ma/argan', tone: 'gold' },
      { placement: 'home_banner', advertiser: 'DermaShop Maroc (démo)', title: 'Livraison offerte dès 300 MAD', body: 'Vos soins de parapharmacie, vendeurs vérifiés.', cta: 'En profiter', url: 'https://example.ma/dermashop', tone: 'rose' },
      { placement: 'discovery_inline', advertiser: 'Parapharmacie Oasis (démo)', title: 'Conseil personnalisé en boutique', body: 'Nos pharmaciens vous accueillent à Casablanca, 7j/7.', cta: 'Prendre rendez-vous', url: 'https://example.ma/oasis', tone: 'night' },
      { placement: 'discovery_inline', advertiser: 'DermaShop Maroc (démo)', title: "La protection solaire, tout l'été", body: '-15 % sur les SPF50+ cette semaine.', cta: 'Voir les offres', url: 'https://example.ma/dermashop/spf', tone: 'rose' },
      { placement: 'guide_inline', advertiser: 'Pharmacie Al Amal (démo)', title: 'Un doute sur un produit ?', body: "Nos pharmaciens vérifient l'authenticité de vos soins, gratuitement.", cta: 'En savoir plus', url: 'https://example.ma/alamal', tone: 'gold' },
      { placement: 'guide_inline', advertiser: 'Coopérative Argan Souss (démo)', title: 'Rituel ghassoul & eau de rose', body: 'Le coffret découverte de nos coopératives.', cta: 'Découvrir le coffret', url: 'https://example.ma/argan/coffret', tone: 'rose' },
    ] });
    console.log('✓ publicités');
  }

  const sara = await prisma.user.findUnique({ where: { phone: '+212600000100' } });
  const salma = await prisma.user.findUnique({ where: { phone: '+212600000001' } });
  if (sara && salma && (await prisma.notification.count()) === 0) {
    await prisma.notification.createMany({ data: [
      { userId: sara.id, type: 'recommendation', title: 'Nouvelle recommandation de Dr. Salma Bennani', body: "Continuez l'acide azélaïque 3 soirs par semaine et notez toute réaction dans le journal.", link: '/app/conseil' },
      { userId: sara.id, type: 'message', title: 'Dr. Salma Bennani', body: 'Bonjour Sara, continuez la routine et notez dans le journal si une réaction apparaît.', link: '/app/conseil' },
      { userId: salma.id, type: 'message', title: 'Message de Sara', body: "Bonjour Docteur, j'ai encore quelques boutons sur le menton depuis 2 semaines.", link: `/pro/messages?p=${sara.id}` },
    ] });
    console.log('✓ notifications');
  }
  console.log(`Mot de passe des comptes démo : ${DEMO_PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
