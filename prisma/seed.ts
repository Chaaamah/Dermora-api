/* eslint-disable no-console */
/**
 * Données de démonstration Dermora.
 * Les prix sont INDICATIFS (démo) et les parapharmacies sont fictives.
 * En production, le catalogue est saisi et validé dans le back-office par l'expert conseil.
 */
import { importRituals } from './rituals';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const DEMO_PASSWORD = 'Dermora2026';
const hash = (pw: string) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 64).toString('hex')}`;
};
const PWD = hash(DEMO_PASSWORD);

const prisma = new PrismaClient();
const EXPERT = 'Dr. Expert conseil (démo)';

const INGREDIENTS: Array<[string, string, string, Partial<{ pregnancyUnsafe: boolean; irritant: boolean; precautions: string }>?]> = [
  ['AQUA', 'Eau', 'Solvant'],
  ['GLYCERIN', 'Glycérine', 'Humectant'],
  ['CERAMIDE NP', 'Céramides', 'Restaure la barrière cutanée'],
  ['SODIUM HYALURONATE', 'Acide hyaluronique', 'Hydratant'],
  ['NIACINAMIDE', 'Niacinamide (vit. B3)', 'Pores, sébum, taches'],
  ['ASCORBIC ACID', 'Vitamine C', 'Éclat, antioxydant', { irritant: true, precautions: 'Peut picoter les peaux sensibles.' }],
  ['SALICYLIC ACID', 'Acide salicylique (BHA)', 'Désobstrue les pores', { pregnancyUnsafe: true, irritant: true, precautions: 'Éviter à forte concentration pendant la grossesse.' }],
  ['AZELAIC ACID', 'Acide azélaïque', 'Imperfections, taches, rougeurs'],
  ['RETINOL', 'Rétinol', 'Rides, texture', { pregnancyUnsafe: true, irritant: true, precautions: 'Interdit pendant grossesse et allaitement. Le soir uniquement, protection solaire obligatoire.' }],
  ['RETINAL', 'Rétinaldéhyde', 'Rides, texture', { pregnancyUnsafe: true, irritant: true, precautions: 'Rétinoïde : exclu pendant la grossesse.' }],
  ['GLYCOLIC ACID', 'Acide glycolique (AHA)', 'Exfoliant', { irritant: true, precautions: 'Photosensibilisant : protection solaire indispensable.' }],
  ['ZINC PCA', 'Zinc PCA', 'Régule le sébum'],
  ['PANTHENOL', 'Panthénol (B5)', 'Apaisant'],
  ['MADECASSOSIDE', 'Centella asiatica', 'Apaisant, réparateur'],
  ['SHEA BUTTER', 'Beurre de karité', 'Nourrissant'],
  ['ARGANIA SPINOSA KERNEL OIL', "Huile d'argan", 'Nourrissant, cheveux et peau'],
  ['ROSA DAMASCENA FLOWER WATER', 'Eau de rose', 'Tonifiant, apaisant'],
  ['MOROCCAN LAVA CLAY', 'Ghassoul', 'Nettoyant doux, absorbe le sébum'],
  ['LAWSONIA INERMIS', 'Henné naturel', 'Soin et coloration végétale'],
  ['ZINC OXIDE', 'Oxyde de zinc', 'Filtre minéral'],
  ['BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE', 'Tinosorb S', 'Filtre UV'],
  ['DIMETHICONE', 'Diméthicone', 'Démêlant, gainant'],
  ['KERATIN', 'Kératine', 'Renforce la fibre'],
  ['PIROCTONE OLAMINE', 'Piroctone olamine', 'Antipelliculaire'],
  ['CAFFEINE', 'Caféine', 'Stimule le cuir chevelu'],
  ['FRAGRANCE', 'Parfum', 'Parfum', { irritant: true, precautions: 'Peut irriter les peaux sensibles ou allergiques.' }],
];

const MERCHANTS = [
  { name: 'DermaShop Maroc (démo)', type: 'ONLINE', city: 'Livraison nationale', website: 'https://example.ma/dermashop' },
  { name: 'Parapharmacie Oasis (démo)', type: 'STORE', city: 'Casablanca', website: 'https://example.ma/oasis' },
  { name: 'Pharmacie Al Amal (démo)', type: 'STORE', city: 'Rabat', website: 'https://example.ma/alamal' },
  { name: 'Coopérative Argan Souss (démo)', type: 'ONLINE', city: 'Agadir', website: 'https://example.ma/argan' },
];

type P = {
  brand: string; name: string; domain?: string; category: string; size?: number; months: number;
  types: string[]; concerns: string[]; avoid?: string[]; natural?: boolean; sponsored?: boolean;
  ings: string[]; desc: string; how: string; prec?: string; prices: Array<[number, number]>;
};

const PRODUCTS: P[] = [
  // ── Nettoyants
  { brand: 'CeraVe', name: 'Crème lavante hydratante', category: 'cleanser', size: 236, months: 3, types: ['seche', 'normale', 'mixte'], concerns: ['secheresse'], ings: ['CERAMIDE NP', 'SODIUM HYALURONATE', 'GLYCERIN'], desc: 'Nettoyant crème sans savon qui respecte la barrière cutanée.', how: 'Matin et soir, masser sur peau humide, rincer.', prices: [[0, 149], [1, 155], [2, 152]] },
  { brand: 'CeraVe', name: 'Gel moussant', category: 'cleanser', size: 236, months: 3, types: ['grasse', 'mixte', 'normale'], concerns: ['acne', 'pores'], ings: ['CERAMIDE NP', 'NIACINAMIDE'], desc: "Gel moussant qui élimine l'excès de sébum sans dessécher.", how: 'Matin et soir sur peau humide, rincer.', prices: [[0, 149], [1, 158]] },
  { brand: 'La Roche-Posay', name: 'Effaclar Gel moussant purifiant', category: 'cleanser', size: 200, months: 2.5, types: ['grasse', 'mixte'], concerns: ['acne', 'pores'], ings: ['ZINC PCA'], desc: 'Gel purifiant pour peaux grasses à tendance acnéique.', how: 'Matin et soir, faire mousser, rincer.', prices: [[0, 185], [1, 190], [2, 182]] },
  { brand: 'Bioderma', name: 'Sensibio H2O eau micellaire', category: 'cleanser', size: 250, months: 2, types: ['all'], concerns: ['rougeurs'], ings: ['AQUA', 'GLYCERIN'], desc: 'Eau micellaire très douce pour peaux sensibles.', how: 'Sur un coton, sans frotter. Rinçage facultatif.', prices: [[0, 135], [1, 139], [2, 129]] },
  { brand: 'Garnier', name: 'Gel nettoyant Pure Active', category: 'cleanser', size: 150, months: 2, types: ['grasse', 'mixte'], concerns: ['acne'], ings: ['SALICYLIC ACID'], avoid: ['pregnancy'], desc: 'Nettoyant quotidien économique pour imperfections.', how: 'Matin et soir, rincer abondamment.', prices: [[0, 59], [1, 62]] },
  { brand: 'Nivea', name: 'Lait démaquillant doux', category: 'cleanser', size: 200, months: 2, types: ['seche', 'normale'], concerns: ['secheresse'], ings: ['GLYCERIN', 'PANTHENOL', 'FRAGRANCE'], avoid: ['sensitive'], desc: 'Lait nettoyant doux, petit prix.', how: 'Appliquer, retirer au coton.', prices: [[0, 45], [2, 49]] },
  // ── Sérums
  { brand: 'The Ordinary', name: 'Niacinamide 10% + Zinc 1%', category: 'serum', size: 30, months: 3, types: ['grasse', 'mixte', 'normale'], concerns: ['pores', 'acne', 'taches'], ings: ['NIACINAMIDE', 'ZINC PCA'], desc: 'Sérum qui resserre visiblement les pores et régule le sébum.', how: 'Quelques gouttes matin et/ou soir avant la crème.', prices: [[0, 129], [1, 135]] },
  { brand: 'La Roche-Posay', name: 'Hyalu B5 sérum', category: 'serum', size: 30, months: 2, types: ['all'], concerns: ['secheresse', 'rides'], ings: ['SODIUM HYALURONATE', 'PANTHENOL', 'MADECASSOSIDE'], desc: 'Sérum repulpant hydratant, bien toléré.', how: 'Matin et soir sur peau propre.', prices: [[0, 395], [1, 410], [2, 389]] },
  { brand: 'Vichy', name: 'Liftactiv Vitamine C 15%', category: 'serum', size: 20, months: 1.5, types: ['normale', 'mixte', 'seche'], concerns: ['taches', 'eclat'], ings: ['ASCORBIC ACID', 'SODIUM HYALURONATE'], avoid: ['sensitive'], desc: "Sérum éclat à la vitamine C pure.", how: 'Le matin, avant la crème et la protection solaire.', prices: [[0, 349], [1, 360]] },
  { brand: 'Garnier', name: 'Sérum Vitamine C Éclat', category: 'serum', size: 30, months: 2, types: ['all'], concerns: ['taches', 'eclat'], ings: ['ASCORBIC ACID', 'NIACINAMIDE'], desc: 'Sérum éclat accessible.', how: 'Le matin sur peau propre.', prices: [[0, 99], [2, 105]] },
  { brand: 'The Ordinary', name: 'Hyaluronic Acid 2% + B5', category: 'serum', size: 30, months: 2, types: ['all'], concerns: ['secheresse'], ings: ['SODIUM HYALURONATE', 'PANTHENOL'], desc: 'Hydratation multi-profondeur, prix doux.', how: 'Matin et soir sur peau légèrement humide.', prices: [[0, 119], [1, 125]] },
  // ── Traitements du soir
  { brand: 'La Roche-Posay', name: 'Effaclar Duo+M', category: 'treatment', size: 40, months: 2, types: ['grasse', 'mixte'], concerns: ['acne', 'pores'], ings: ['NIACINAMIDE', 'SALICYLIC ACID'], avoid: ['pregnancy'], desc: 'Soin anti-imperfections et anti-marques.', how: 'Le soir sur tout le visage.', prices: [[0, 219], [1, 225], [2, 215]] },
  { brand: 'Bioderma', name: 'Sébium Kerato+', category: 'treatment', size: 30, months: 2, types: ['grasse', 'mixte'], concerns: ['acne'], ings: ['SALICYLIC ACID', 'GLYCOLIC ACID'], avoid: ['pregnancy', 'sensitive'], desc: 'Gel-crème contre les imperfections sévères.', how: 'Le soir, en couche fine.', prices: [[0, 189], [2, 185]] },
  { brand: 'Uriage', name: 'Dépiderm sérum azélaïque', category: 'treatment', size: 30, months: 2, types: ['all'], concerns: ['taches', 'acne', 'rougeurs'], ings: ['AZELAIC ACID', 'NIACINAMIDE'], desc: 'Sérum unifiant compatible grossesse (selon avis expert).', how: 'Le soir sur les zones concernées.', prices: [[0, 259], [1, 265]] },
  { brand: 'The Ordinary', name: 'Azelaic Acid 10%', category: 'treatment', size: 30, months: 2, types: ['all'], concerns: ['taches', 'acne', 'rougeurs'], ings: ['AZELAIC ACID'], desc: 'Acide azélaïque pour imperfections et taches, prix doux.', how: 'Le soir, en fine couche.', prices: [[0, 139], [1, 145]] },
  { brand: 'Avène', name: 'RetrinAL 0,1 crème intensive', category: 'treatment', size: 30, months: 2, types: ['normale', 'seche', 'mixte'], concerns: ['rides', 'eclat'], ings: ['RETINAL'], avoid: ['pregnancy', 'sensitive'], desc: 'Soin anti-âge au rétinaldéhyde.', how: 'Le soir, 2 à 3 fois par semaine au début.', prec: 'Rétinoïde : jamais pendant la grossesse.', prices: [[0, 399], [1, 415]] },
  { brand: 'The Ordinary', name: 'Retinol 0.2% in Squalane', category: 'treatment', size: 30, months: 2.5, types: ['normale', 'mixte', 'seche'], concerns: ['rides'], ings: ['RETINOL'], avoid: ['pregnancy', 'sensitive'], desc: 'Rétinol doux pour débuter.', how: 'Le soir, 2 fois par semaine puis augmenter.', prec: 'Rétinoïde : jamais pendant la grossesse.', prices: [[0, 129], [1, 135]] },
  // ── Hydratants
  { brand: 'CeraVe', name: 'Crème hydratante', category: 'moisturizer', size: 340, months: 4, types: ['seche', 'normale'], concerns: ['secheresse'], ings: ['CERAMIDE NP', 'SODIUM HYALURONATE'], desc: 'Crème riche visage et corps aux céramides.', how: 'Matin et soir, après le sérum.', prices: [[0, 219], [1, 229], [2, 215]] },
  { brand: 'CeraVe', name: 'Lotion hydratante visage PM', category: 'moisturizer', size: 52, months: 2, types: ['grasse', 'mixte', 'normale'], concerns: ['pores', 'acne'], ings: ['NIACINAMIDE', 'CERAMIDE NP'], desc: 'Lotion légère non comédogène.', how: 'Matin et soir.', prices: [[0, 159], [1, 165]] },
  { brand: 'Avène', name: 'Tolérance Control crème apaisante', category: 'moisturizer', size: 40, months: 2, types: ['all'], concerns: ['rougeurs', 'secheresse'], ings: ['GLYCERIN'], desc: 'Pour peaux sensibles et réactives, formule minimaliste.', how: 'Matin et soir.', prices: [[0, 249], [1, 255], [2, 245]] },
  { brand: 'La Roche-Posay', name: 'Cicaplast Baume B5+', category: 'moisturizer', size: 40, months: 1.5, types: ['all'], concerns: ['rougeurs', 'secheresse'], ings: ['PANTHENOL', 'MADECASSOSIDE', 'SHEA BUTTER'], desc: 'Baume réparateur multi-usage.', how: 'Le soir ou en zone ciblée.', prices: [[0, 129], [1, 135], [2, 125]] },
  { brand: 'Nivea', name: 'Crème Soft', category: 'moisturizer', size: 100, months: 2, types: ['seche', 'normale'], concerns: ['secheresse'], ings: ['GLYCERIN', 'FRAGRANCE'], avoid: ['sensitive'], desc: 'Hydratant polyvalent petit prix.', how: 'Matin et soir.', prices: [[0, 42], [2, 45]] },
  { brand: 'Bioderma', name: 'Sébium Hydra', category: 'moisturizer', size: 40, months: 2, types: ['grasse', 'mixte'], concerns: ['acne', 'secheresse'], ings: ['GLYCERIN', 'NIACINAMIDE'], desc: 'Hydratant pour peaux grasses desséchées par les traitements.', how: 'Matin et soir.', prices: [[0, 165], [1, 170]] },
  // ── Protection solaire
  { brand: 'La Roche-Posay', name: 'Anthelios UVMune 400 Fluide SPF50+', category: 'sunscreen', size: 50, months: 1, types: ['all'], concerns: ['taches', 'rides'], ings: ['BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE'], desc: 'Très haute protection, texture invisible.', how: 'Chaque matin, 2 doigts pour visage et cou. Renouveler toutes les 2 h au soleil.', prices: [[0, 245], [1, 255], [2, 239]] },
  { brand: 'Bioderma', name: 'Photoderm Aquafluide SPF50+', category: 'sunscreen', size: 40, months: 1, types: ['all'], concerns: ['taches'], ings: ['BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE'], desc: 'Fluide ultra-léger, fini sec.', how: 'Chaque matin en dernière étape.', prices: [[0, 199], [1, 205], [2, 195]] },
  { brand: 'ISDIN', name: 'Fusion Water Magic SPF50', category: 'sunscreen', size: 50, months: 1, types: ['grasse', 'mixte', 'normale'], concerns: ['taches', 'acne'], ings: ['BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE'], desc: 'Texture eau, idéale climat chaud.', how: 'Chaque matin, renouveler au soleil.', prices: [[0, 269], [1, 279]] },
  { brand: 'Garnier', name: 'Ambre Solaire Super UV SPF50+', category: 'sunscreen', size: 40, months: 1, types: ['all'], concerns: [], ings: ['BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE'], desc: 'Protection quotidienne accessible.', how: 'Chaque matin, en dernière étape.', prices: [[0, 89], [2, 95]] },
  { brand: 'Avène', name: 'Fluide minéral SPF50+', category: 'sunscreen', size: 40, months: 1, types: ['all'], concerns: ['rougeurs'], ings: ['ZINC OXIDE'], desc: 'Filtres 100 % minéraux, peaux intolérantes.', how: 'Chaque matin.', prices: [[0, 229], [1, 235]] },
  // ── Naturels (peau)
  { brand: 'Coopérative (démo)', name: 'Eau de rose de Kelâat M\'Gouna', category: 'serum', size: 250, months: 2, types: ['all'], concerns: ['eclat', 'rougeurs'], natural: true, ings: ['ROSA DAMASCENA FLOWER WATER'], desc: 'Hydrolat pur, tonique doux.', how: 'Vaporiser après le nettoyage, matin et soir.', prec: "Choisir un hydrolat pur, sans alcool ni parfum ajouté.", prices: [[3, 45], [1, 55]] },
  { brand: 'Coopérative (démo)', name: "Huile d'argan cosmétique pure", category: 'moisturizer', size: 50, months: 3, types: ['seche', 'normale'], concerns: ['secheresse'], natural: true, ings: ['ARGANIA SPINOSA KERNEL OIL'], desc: 'Huile pressée à froid, certifiée cosmétique.', how: '2 gouttes le soir sur peau légèrement humide.', prec: 'Huile cosmétique (non torréfiée). Éviter sur peau très acnéique.', prices: [[3, 120], [1, 140]] },
  // ── Cheveux
  { brand: 'Klorane', name: 'Shampooing à la mangue', domain: 'hair', category: 'shampoo', size: 400, months: 3, types: ['boucle', 'crepu', 'ondule'], concerns: ['secheresse', 'frisottis'], ings: ['SHEA BUTTER'], desc: 'Shampooing nourrissant cheveux secs.', how: 'Masser le cuir chevelu, rincer.', prices: [[0, 129], [1, 135]] },
  { brand: 'Ducray', name: 'Kelual DS shampooing', domain: 'hair', category: 'shampoo', size: 100, months: 1.5, types: ['all'], concerns: ['pellicules'], ings: ['PIROCTONE OLAMINE'], desc: 'Shampooing traitant antipelliculaire.', how: '2 à 3 fois par semaine, laisser poser 3 min.', prices: [[0, 159], [2, 155]] },
  { brand: 'Garnier', name: 'Ultra Doux shampooing doux', domain: 'hair', category: 'shampoo', size: 400, months: 3, types: ['all'], concerns: [], ings: ['GLYCERIN'], desc: 'Shampooing quotidien économique.', how: 'Masser, rincer.', prices: [[0, 39], [2, 42]] },
  { brand: 'Vichy', name: 'Dercos Energy+ shampooing', domain: 'hair', category: 'shampoo', size: 200, months: 2, types: ['all'], concerns: ['chute'], ings: ['CAFFEINE'], desc: 'Shampooing fortifiant anti-chute passagère.', how: 'Masser 1 min, rincer.', prices: [[0, 175], [1, 180]] },
  { brand: 'Garnier', name: 'Fructis Hair Food après-shampooing', domain: 'hair', category: 'conditioner', size: 350, months: 3, types: ['all'], concerns: ['secheresse', 'frisottis'], ings: ['GLYCERIN', 'DIMETHICONE'], desc: 'Démêlant nourrissant, prix doux.', how: 'Sur les longueurs, rincer après 2 min.', prices: [[0, 59], [2, 62]] },
  { brand: 'Klorane', name: 'Baume après-shampooing au beurre de mangue', domain: 'hair', category: 'conditioner', size: 200, months: 2, types: ['boucle', 'crepu', 'ondule'], concerns: ['secheresse', 'frisottis'], ings: ['SHEA BUTTER'], desc: 'Baume démêlant intense.', how: 'Sur longueurs et pointes, rincer.', prices: [[0, 125], [1, 130]] },
  { brand: 'Coopérative (démo)', name: 'Ghassoul de l\'Atlas', domain: 'hair', category: 'hair_mask', size: 250, months: 3, types: ['all'], concerns: ['pellicules', 'gras'], natural: true, ings: ['MOROCCAN LAVA CLAY'], desc: 'Argile lavante traditionnelle.', how: "Délayer avec de l'eau tiède (ou de rose), appliquer 5 à 10 min, rincer.", prec: 'Ne pas laisser sécher complètement ; espacer sur cheveux secs.', prices: [[3, 35], [1, 45]] },
  { brand: 'Coopérative (démo)', name: "Huile d'argan cheveux pure", domain: 'hair', category: 'hair_oil', size: 100, months: 4, types: ['all'], concerns: ['secheresse', 'frisottis'], natural: true, ings: ['ARGANIA SPINOSA KERNEL OIL'], desc: 'Bain d\'huile avant shampooing ou quelques gouttes sur pointes.', how: '1 fois par semaine en bain d\'huile 30 min avant shampooing.', prices: [[3, 110], [1, 130]] },
  { brand: "L'Oréal Professionnel", name: 'Masque Absolut Repair', domain: 'hair', category: 'hair_mask', size: 250, months: 3, types: ['all'], concerns: ['secheresse', 'frisottis'], ings: ['KERATIN'], desc: 'Masque réparateur cheveux abîmés et colorés.', how: '1 fois par semaine, 5 min, rincer.', prices: [[0, 265], [1, 279]] },
];

const RITUALS = [
  { slug: 'ghassoul', name: 'Ghassoul', ingredient: 'Argile de l\'Atlas', forDomain: 'hair', benefits: 'Lave en douceur, absorbe l\'excès de sébum, purifie le cuir chevelu et la peau.', howTo: "Délayer 2 c. à soupe dans de l'eau tiède ou de l'eau de rose jusqu'à obtenir une pâte lisse. Appliquer 5 à 10 minutes, rincer abondamment.", precautions: ["Ne pas laisser sécher complètement sur la peau", 'Espacer à 1 fois par semaine sur peau ou cheveux secs', 'Faire un test sur une petite zone 24 h avant'], avoidFor: [] },
  { slug: 'henne', name: 'Henné naturel', ingredient: 'Lawsonia inermis', forDomain: 'hair', benefits: 'Gaine et fortifie la fibre, reflets cuivrés naturels.', howTo: "Mélanger la poudre pure avec de l'eau tiède, laisser reposer, appliquer 1 à 2 h sur cheveux propres.", precautions: ['Henné noir à éviter absolument : il contient souvent de la PPD, allergène puissant', 'Uniquement du henné pur (Lawsonia inermis)', 'Test d\'allergie 48 h avant', 'Peut réagir avec une coloration chimique récente'], avoidFor: [] },
  { slug: 'argan', name: "Huile d'argan", ingredient: 'Argania spinosa', forDomain: 'skin', benefits: 'Nourrit la peau sèche et les longueurs, riche en vitamine E.', howTo: "Peau : 2 gouttes le soir sur peau humide. Cheveux : bain d'huile 30 min avant shampooing.", precautions: ["Choisir l'huile cosmétique (non torréfiée) — l'huile alimentaire n'est pas adaptée", 'Peut aggraver une peau très acnéique', 'Conserver à l\'abri de la lumière'], avoidFor: [] },
  { slug: 'eau-de-rose', name: 'Eau de rose', ingredient: 'Rosa damascena', forDomain: 'skin', benefits: 'Tonifie, apaise et rafraîchit, idéale par temps chaud.', howTo: 'Vaporiser ou appliquer au coton après le nettoyage, matin et soir.', precautions: ['Préférer un hydrolat pur sans alcool ni parfum ajouté', 'Conserver au frais et utiliser dans les 6 mois'], avoidFor: [] },
  { slug: 'citron', name: 'Citron sur la peau', ingredient: 'Citrus limon', forDomain: 'skin', benefits: 'Souvent conseillé pour les taches — mais déconseillé par nos experts.', howTo: 'Ne pas appliquer pur sur la peau.', precautions: ['Pas de citron pur sur la peau : brûlures et taches au soleil (phytophotodermatose)', 'Pour les taches, préférer niacinamide, acide azélaïque ou vitamine C + protection solaire'], avoidFor: ['all'] },
];

export const ARTICLES = [
  { slug: 'lire-une-etiquette', title: 'Lire une étiquette en 2 minutes', tag: 'Bases', summary: 'Liste INCI, ordre des ingrédients, allégations : les repères essentiels.', body: "Les ingrédients sont listés par ordre décroissant de concentration jusqu'à 1 %. Repérez d'abord les 5 premiers : ils composent l'essentiel du produit.\n\nCherchez les actifs qui correspondent à vos préoccupations (niacinamide pour les pores, céramides pour la barrière). Méfiez-vous des promesses de « guérison » : un cosmétique entretient, il ne soigne pas.\n\nPour les peaux sensibles, le parfum (FRAGRANCE/PARFUM) est souvent la première cause d'irritation." },
  { slug: 'protection-solaire-maroc', title: 'La protection solaire, toute l\'année', tag: 'Soleil', summary: 'Au Maroc, l\'indice UV dépasse souvent 8. Le bon geste, chaque matin.', body: "La protection solaire est la seule étape anti-âge et anti-taches indispensable. Appliquez l'équivalent de deux doigts pour le visage et le cou, en dernière étape du matin.\n\nRenouvelez toutes les deux heures en cas d'exposition, après la baignade ou la transpiration. Même par temps nuageux, les UVA traversent les nuages." },
  { slug: 'acne-les-bons-gestes', title: 'Acné : les bons gestes', tag: 'Acné', summary: 'Nettoyer sans décaper, hydrater, patienter 8 semaines.', body: "Un nettoyant doux matin et soir suffit : décaper la peau stimule le sébum. Introduisez un seul actif à la fois et laissez-lui 6 à 8 semaines.\n\nNe percez pas les boutons. Si l'acné est douloureuse, laisse des cicatrices ou ne s'améliore pas après 3 mois, consultez un dermatologue." },
  { slug: 'reconnaitre-une-contrefacon', title: 'Reconnaître une contrefaçon', tag: 'Achat', summary: 'Prix trop bas, emballage approximatif, vendeur inconnu : les signaux d\'alerte.', body: "Un prix très inférieur au marché est le premier signal. Vérifiez le numéro de lot et la date de péremption, la qualité d'impression et l'odeur.\n\nAchetez de préférence en pharmacie, parapharmacie ou chez les vendeurs vérifiés Dermora. En cas de doute, signalez le produit dans l'app." },
];

// Matrice de règles (validée par l'expert)
export const RULES = [
  { domain: 'skin', moment: 'AM', order: 1, step: 'Nettoyant', category: 'cleanser', quantity: 'une noisette', introWeek: 1 },
  { domain: 'skin', moment: 'AM', order: 2, step: 'Sérum ciblé', category: 'serum', optional: true, quantity: '3 gouttes', introWeek: 3 },
  { domain: 'skin', moment: 'AM', order: 3, step: 'Hydratant', category: 'moisturizer', quantity: 'une noisette', introWeek: 2 },
  { domain: 'skin', moment: 'AM', order: 4, step: 'Protection solaire SPF50', category: 'sunscreen', quantity: '2 doigts (visage + cou)', introWeek: 1 },
  { domain: 'skin', moment: 'PM', order: 1, step: 'Nettoyant', category: 'cleanser', quantity: 'une noisette', introWeek: 1 },
  { domain: 'skin', moment: 'PM', order: 2, step: 'Soin ciblé', category: 'treatment', optional: true, quantity: 'un petit pois', frequency: '3 soirs par semaine au début', introWeek: 4, conditions: { concerns: ['acne', 'taches', 'rides', 'pores', 'rougeurs'] } },
  { domain: 'skin', moment: 'PM', order: 3, step: 'Hydratant', category: 'moisturizer', quantity: 'une noisette', introWeek: 2 },
  { domain: 'hair', moment: 'HAIR', order: 1, step: 'Shampooing', category: 'shampoo', frequency: 'selon le lavage', introWeek: 1 },
  { domain: 'hair', moment: 'HAIR', order: 2, step: 'Après-shampooing', category: 'conditioner', frequency: 'à chaque lavage', introWeek: 1 },
  { domain: 'hair', moment: 'HAIR', order: 3, step: 'Masque', category: 'hair_mask', optional: true, frequency: '1 fois par semaine', introWeek: 2 },
  { domain: 'hair', moment: 'HAIR', order: 4, step: 'Huile / bain d\'huile', category: 'hair_oil', optional: true, frequency: '1 fois par semaine', introWeek: 3 },
];

async function main() {
  console.log('→ Nettoyage…');
  await prisma.notification.deleteMany();
  await prisma.ad.deleteMany();
  await prisma.message.deleteMany();
  await prisma.clinicalNote.deleteMany();
  await prisma.careLink.deleteMany();
  await prisma.routineCheck.deleteMany();
  await prisma.routineStep.deleteMany();
  await prisma.routine.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.skinNote.deleteMany();
  await prisma.skinProfile.deleteMany();
  await prisma.hairProfile.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.productIngredient.deleteMany();
  await prisma.product.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.ritual.deleteMany();
  await prisma.article.deleteMany();
  await prisma.routineRule.deleteMany();
  await prisma.dermatologist.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.user.deleteMany();

  console.log('→ Ingrédients, marchands, produits…');
  const ingIds: Record<string, string> = {};
  for (const [inci, nameFr, fn, extra] of INGREDIENTS) {
    const i = await prisma.ingredient.create({ data: { inci, nameFr, function: fn, ...(extra ?? {}) } });
    ingIds[inci] = i.id;
  }
  const merchants: Array<{ id: string; website: string | null }> = [];
  for (const m of MERCHANTS) merchants.push(await prisma.merchant.create({ data: m }));

  const now = new Date();
  for (const p of PRODUCTS) {
    await prisma.product.create({
      data: {
        brand: p.brand, name: p.name, domain: p.domain ?? 'skin', category: p.category, sizeMl: p.size,
        monthsSupply: p.months, skinTypes: p.types, concerns: p.concerns, avoidFor: p.avoid ?? [],
        description: p.desc, howTo: p.how, precautions: p.prec, isNatural: !!p.natural, sponsored: !!p.sponsored,
        validatedBy: EXPERT, validatedAt: now,
        ingredients: { create: p.ings.map((inci, idx) => ({ ingredientId: ingIds[inci], key: idx < 2 })) },
        offers: { create: p.prices.map(([mi, price]) => ({ merchantId: merchants[mi].id, priceMad: price, url: `${merchants[mi].website}/p/${encodeURIComponent(p.brand + '-' + p.name)}`, updatedAt: now })) },
      },
    });
  }

  await importRituals(prisma);
  for (const a of ARTICLES) await prisma.article.create({ data: { ...a, validatedBy: EXPERT } });
  for (const r of RULES) await prisma.routineRule.create({ data: r as never });

  console.log('→ Comptes de démonstration…');
  const derms = [
    { email: 'salma@dermora.ma', phone: '+212600000001', fullName: 'Dr. Salma Bennani', city: 'Casablanca', ordre: 'CNOM-CA-10234', bio: 'Dermatologue, acné et taches pigmentaires. 12 ans d\'expérience.', languages: ['fr', 'ar'], price: 350 },
    { email: 'youssef@dermora.ma', phone: '+212600000002', fullName: 'Dr. Youssef El Idrissi', city: 'Rabat', ordre: 'CNOM-RA-20871', bio: 'Dermatologie esthétique et cuir chevelu.', languages: ['fr', 'ar', 'en'], price: 400 },
    { email: 'nadia@dermora.ma', phone: '+212600000003', fullName: 'Dr. Nadia Alaoui', city: 'Marrakech', ordre: 'CNOM-MA-31457', bio: 'Peaux sensibles, rosacée, dermatologie pédiatrique.', languages: ['fr', 'ar'], price: 300 },
  ];
  const dermRows: Array<{ id: string; userId: string }> = [];
  for (const d of derms) {
    const u = await prisma.user.create({ data: { email: d.email, passwordHash: PWD, phone: d.phone, role: 'DERMATOLOGIST', firstName: d.fullName, city: d.city, lang: 'fr' } });
    dermRows.push(await prisma.dermatologist.create({ data: { userId: u.id, fullName: d.fullName, ordreNumber: d.ordre, verified: true, city: d.city, bio: d.bio, languages: d.languages, priceMad: d.price } }));
  }

  // Cliente suivie par Dr. Bennani
  const sara = await prisma.user.create({ data: { email: 'sara@dermora.ma', passwordHash: PWD, phone: '+212600000100', firstName: 'Sara', city: 'Casablanca', birthDate: new Date('1997-04-12'), lang: 'fr' } });
  await prisma.consent.createMany({ data: ['photos', 'skin_data', 'care_sharing'].map((type) => ({ userId: sara.id, type, granted: true })) });
  await prisma.skinProfile.create({ data: { userId: sara.id, skinType: 'mixte', phototype: 4, concerns: ['acne', 'pores', 'taches'], allergies: [] } });
  await prisma.hairProfile.create({ data: { userId: sara.id, curlType: 'boucle', porosity: 'forte', scalp: 'normal', washPerWeek: 2 } });
  await prisma.careLink.create({ data: { patientId: sara.id, dermatologistId: dermRows[0].id, status: 'ACTIVE', reason: 'Imperfections persistantes sur le menton' } });
  await prisma.scan.create({ data: { userId: sara.id, provider: 'mock', costMad: 2.5, summary: ['Imperfections marquées sur le menton', 'Pores visibles sur le front', 'Hydratation correcte sur les joues'], results: { zones: { front: { pores: 'moyen', acne: 'faible' }, joues: { taches: 'faible', secheresse: 'faible' }, menton: { acne: 'marque' } }, concerns: { acne: 'marque', pores: 'moyen', taches: 'faible', rides: 'faible', secheresse: 'faible', rougeurs: 'faible' }, score: 68 } } });
  await prisma.message.createMany({ data: [
    { patientId: sara.id, channel: 'CARE', senderRole: 'PATIENT', senderId: sara.id, content: 'Bonjour Docteur, j\'ai encore quelques boutons sur le menton depuis 2 semaines.' },
    { patientId: sara.id, channel: 'CARE', senderRole: 'DERMATOLOGIST', senderId: dermRows[0].userId, content: 'Bonjour Sara, continuez la routine et notez dans le journal si une réaction apparaît. On refait le point dans 3 semaines.' },
  ] });

  // Cliente sans dermatologue → assistant IA
  const imane = await prisma.user.create({ data: { email: 'imane@dermora.ma', passwordHash: PWD, phone: '+212600000101', firstName: 'Imane', city: 'Rabat', birthDate: new Date('1993-09-30'), lang: 'fr' } });
  await prisma.consent.createMany({ data: ['photos', 'skin_data'].map((type) => ({ userId: imane.id, type, granted: true })) });
  await prisma.skinProfile.create({ data: { userId: imane.id, skinType: 'seche', sensitive: true, phototype: 3, concerns: ['secheresse', 'rougeurs'], allergies: [] } });

  // Notifications de démonstration
  await prisma.notification.createMany({ data: [
    { userId: sara.id, type: 'recommendation', title: 'Nouvelle recommandation de Dr. Salma Bennani', body: "Continuez l'acide azélaïque 3 soirs par semaine et notez toute réaction dans le journal.", link: '/app/conseil' },
    { userId: sara.id, type: 'message', title: 'Dr. Salma Bennani', body: 'Bonjour Sara, continuez la routine et notez dans le journal si une réaction apparaît.', link: '/app/conseil' },
    { userId: dermRows[0].userId, type: 'message', title: 'Message de Sara', body: "Bonjour Docteur, j'ai encore quelques boutons sur le menton depuis 2 semaines.", link: `/pro/messages?p=${sara.id}` },
  ] });
  await prisma.message.updateMany({ where: { patientId: sara.id, senderRole: 'DERMATOLOGIST' }, data: { readAt: null } });

  // Publicités de démonstration (annonceurs fictifs)
  await prisma.ad.createMany({ data: [
    { placement: 'home_banner', advertiser: 'Coopérative Argan Souss (démo)', title: "L'huile d'argan cosmétique, pressée à froid", body: 'Certifiée, traçable, livrée partout au Maroc.', cta: 'Découvrir', url: 'https://example.ma/argan', tone: 'gold' },
    { placement: 'home_banner', advertiser: 'DermaShop Maroc (démo)', title: 'Livraison offerte dès 300 MAD', body: 'Vos soins de parapharmacie, vendeurs vérifiés.', cta: 'En profiter', url: 'https://example.ma/dermashop', tone: 'rose' },
    { placement: 'discovery_inline', advertiser: 'Parapharmacie Oasis (démo)', title: 'Conseil personnalisé en boutique', body: 'Nos pharmaciens vous accueillent à Casablanca, 7j/7.', cta: 'Prendre rendez-vous', url: 'https://example.ma/oasis', tone: 'night' },
    { placement: 'discovery_inline', advertiser: 'DermaShop Maroc (démo)', title: "La protection solaire, tout l'été", body: '-15 % sur les SPF50+ cette semaine.', cta: 'Voir les offres', url: 'https://example.ma/dermashop/spf', tone: 'rose' },
    { placement: 'guide_inline', advertiser: 'Pharmacie Al Amal (démo)', title: 'Un doute sur un produit ?', body: "Nos pharmaciens vérifient l'authenticité de vos soins, gratuitement.", cta: 'En savoir plus', url: 'https://example.ma/alamal', tone: 'gold' },
    { placement: 'guide_inline', advertiser: 'Coopérative Argan Souss (démo)', title: 'Rituel ghassoul & eau de rose', body: 'Le coffret découverte de nos coopératives.', cta: 'Découvrir le coffret', url: 'https://example.ma/argan/coffret', tone: 'rose' },
  ] });

  console.log(`✓ Seed terminé : ${PRODUCTS.length} produits, ${RITUALS.length} rituels, ${ARTICLES.length} articles.`);
  console.log(`  Mot de passe démo : ${DEMO_PASSWORD}`);
  console.log('  Clientes      : sara@dermora.ma (suivie) · imane@dermora.ma (assistante IA)');
  console.log('  Dermatologue  : salma@dermora.ma');
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
