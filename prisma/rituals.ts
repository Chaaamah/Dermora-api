/**
 * Bibliothèque des rituels de beauté marocains (cartes de l'onglet « Rituels »).
 * Importés comme « à valider » : le pharmacien conseil les valide avant la mise en production
 * (REQUIRE_EXPERT_VALIDATION=true n'affiche alors que les rituels validés).
 *
 *   npx ts-node prisma/rituals.ts
 */
import { PrismaClient } from '@prisma/client';

export interface RitualCard {
  slug: string; name: string; ingredient: string; forDomain: 'skin' | 'hair';
  category: 'visage' | 'corps' | 'hammam' | 'cheveux';
  durationMin: number; frequency: string; skinTypes: string[]; concerns: string[]; origin?: string;
  benefits: string; steps: string[]; precautions: string[]; avoidFor: string[];
}

const ALL = ['seche', 'grasse', 'mixte', 'normale'];

export const RITUALS: RitualCard[] = [
  // ───────── Hammam ─────────
  {
    slug: 'hammam-savon-beldi-kessa', name: 'Hammam : savon beldi & kessa', ingredient: "Savon noir à l'huile d'olive, gant kessa", forDomain: 'skin', category: 'hammam',
    durationMin: 45, frequency: '1 fois par semaine au plus', skinTypes: ['normale', 'grasse', 'mixte'], concerns: ['eclat'], origin: 'Tradition du hammam',
    benefits: 'Le savon beldi ramollit la couche superficielle de la peau ; la kessa retire ensuite les cellules mortes. La peau est plus douce et plus lumineuse.',
    steps: ['Rester 10 minutes dans la chaleur humide pour ouvrir la peau.', 'Appliquer une fine couche de savon beldi sur le corps humide (pas sur le visage), laisser poser 5 à 10 minutes.', 'Rincer, puis frotter avec la kessa par mouvements longs, sans insister sur une même zone.', 'Rincer à l\'eau tiède et hydrater (huile d\'argan ou lait corps).'],
    precautions: ['Pas de kessa sur le visage, sur un coup de soleil, une peau irritée, de l\'eczéma ou une acné inflammatoire', 'Attendre 48 h après une épilation ou un rasage', 'Peau sensible ou foncée : frotter légèrement, un frottement fort peut laisser des taches', 'Ne pas rester trop longtemps dans la chaleur en cas de grossesse, d\'hypertension ou de malaise'],
    avoidFor: [],
  },
  {
    slug: 'ghassoul-corps', name: 'Enveloppement au ghassoul', ingredient: "Argile ghassoul de l'Atlas", forDomain: 'skin', category: 'hammam',
    durationMin: 15, frequency: '1 fois par semaine', skinTypes: ['normale', 'grasse', 'mixte'], concerns: ['pores'], origin: 'Moyen Atlas (Missour)',
    benefits: 'Argile lavante qui absorbe l\'excès de sébum et laisse la peau nette, sans savon.',
    steps: ['Délayer 3 à 4 cuillères de ghassoul dans de l\'eau tiède ou de l\'eau de rose jusqu\'à obtenir une pâte lisse.', 'Appliquer sur le corps humide, après la kessa si vous en faites une.', 'Laisser poser 5 minutes sans laisser sécher.', 'Rincer abondamment et hydrater.'],
    precautions: ['Ne jamais laisser sécher complètement : l\'argile dessèche et tiraille', 'Peau sèche : espacer à 1 fois toutes les 2 semaines', 'Acheter un ghassoul pur, sans parfum ajouté'],
    avoidFor: [],
  },
  {
    slug: 'huile-olive-corps', name: "Soin du corps à l'huile d'olive", ingredient: "Huile d'olive vierge extra", forDomain: 'skin', category: 'corps',
    durationMin: 5, frequency: 'Après la douche, selon les besoins', skinTypes: ['seche', 'normale'], concerns: ['secheresse'], origin: 'Cuisine et pharmacopée familiale',
    benefits: 'Un geste simple et économique pour nourrir les zones sèches : coudes, genoux, talons.',
    steps: ['Sortir de la douche et tamponner sans sécher complètement.', 'Chauffer quelques gouttes d\'huile entre les mains.', 'Masser sur les zones sèches jusqu\'à pénétration.'],
    precautions: ['Ne pas utiliser sur le visage si la peau est grasse ou à tendance acnéique', 'Peut tacher les vêtements : laisser pénétrer avant de s\'habiller', 'Une peau atopique (eczéma) doit privilégier un émollient de pharmacie'],
    avoidFor: [],
  },
  {
    slug: 'pierre-alun', name: "Pierre d'alun (chebba)", ingredient: "Alun de potassium", forDomain: 'skin', category: 'corps',
    durationMin: 2, frequency: 'Chaque jour si besoin', skinTypes: ALL, concerns: [], origin: 'Usage traditionnel après rasage et comme déodorant',
    benefits: 'Limite le développement des bactéries responsables des odeurs ; resserre la peau après rasage.',
    steps: ['Humidifier la pierre.', 'La passer sur une peau propre et sèche.', 'Rincer et sécher la pierre avant de la ranger.'],
    precautions: ['Ne pas appliquer sur une peau rasée de frais, coupée ou irritée', 'Préférer une pierre d\'alun de potassium naturelle à l\'alun d\'ammonium', 'Ce n\'est pas un anti-transpirant : la transpiration n\'est pas bloquée'],
    avoidFor: [],
  },
  {
    slug: 'henne-mains', name: 'Henné des mains et des pieds', ingredient: 'Lawsonia inermis (henné pur)', forDomain: 'skin', category: 'corps',
    durationMin: 120, frequency: 'Occasionnel (fêtes, mariages)', skinTypes: ALL, concerns: [], origin: 'Fêtes et mariages marocains',
    benefits: 'Décoration traditionnelle temporaire, de l\'orangé au brun, qui s\'estompe en 1 à 3 semaines.',
    steps: ['Mélanger le henné pur avec de l\'eau tiède (ou du thé) et laisser reposer quelques heures.', 'Dessiner sur une peau propre, sans crème.', 'Laisser poser 1 à 2 heures, puis gratter la pâte sèche sans eau.', 'Éviter l\'eau pendant quelques heures pour une couleur plus intense.'],
    precautions: ['Refuser tout « henné noir » : il contient souvent de la PPD, qui peut provoquer des brûlures et une allergie à vie', 'Un henné pur ne donne jamais une couleur noire immédiate', 'Test sur une petite zone 48 h avant', 'Déconseillé chez le nourrisson (risque en cas de déficit en G6PD)'],
    avoidFor: [],
  },

  // ───────── Visage ─────────
  {
    slug: 'eau-de-rose', name: 'Eau de rose', ingredient: 'Hydrolat de Rosa damascena', forDomain: 'skin', category: 'visage',
    durationMin: 2, frequency: 'Matin et soir', skinTypes: ALL, concerns: ['rougeurs'], origin: "Vallée des roses, Kelâat M'Gouna",
    benefits: 'Tonifie, apaise et rafraîchit la peau après le nettoyage, idéale par temps chaud.',
    steps: ['Nettoyer le visage.', 'Vaporiser l\'eau de rose ou l\'appliquer avec un coton.', 'Laisser sécher quelques secondes, puis appliquer le sérum ou la crème.'],
    precautions: ['Choisir un hydrolat pur, sans alcool ni parfum ajouté', 'Conserver au frais et utiliser dans les 6 mois après ouverture', 'Ne remplace ni le nettoyant ni la crème hydratante'],
    avoidFor: [],
  },
  {
    slug: 'fleur-oranger', name: "Eau de fleur d'oranger (zhar)", ingredient: "Hydrolat de Citrus aurantium", forDomain: 'skin', category: 'visage',
    durationMin: 2, frequency: 'Matin et soir', skinTypes: ['seche', 'normale', 'mixte'], concerns: ['rougeurs'], origin: 'Distillation familiale du zhar au printemps',
    benefits: 'Lotion douce et parfumée pour les peaux sèches et sensibles.',
    steps: ['Après le nettoyage, imbiber un coton d\'eau de fleur d\'oranger.', 'Tamponner le visage et le cou sans frotter.', 'Poursuivre avec la crème.'],
    precautions: ['L\'eau de fleur d\'oranger de pâtisserie peut contenir des arômes : préférer un hydrolat cosmétique', 'Arrêter en cas de picotements'],
    avoidFor: [],
  },
  {
    slug: 'argan', name: "Huile d'argan visage", ingredient: 'Argania spinosa (huile cosmétique, non torréfiée)', forDomain: 'skin', category: 'visage',
    durationMin: 2, frequency: 'Le soir', skinTypes: ['seche', 'normale'], concerns: ['secheresse', 'rides'], origin: 'Coopératives féminines du Souss',
    benefits: 'Nourrit les peaux sèches grâce à ses acides gras et sa vitamine E, et renforce le confort cutané.',
    steps: ['Le soir, après le nettoyage, garder la peau légèrement humide.', 'Chauffer 2 gouttes entre les doigts.', 'Presser doucement sur le visage, sans frotter.'],
    precautions: ['Utiliser l\'huile cosmétique : l\'huile alimentaire (torréfiée) n\'est pas adaptée', 'Peut aggraver une peau acnéique ou très grasse', 'Conserver à l\'abri de la lumière et de la chaleur', 'Se méfier des prix très bas : les huiles coupées sont fréquentes'],
    avoidFor: [],
  },
  {
    slug: 'figue-de-barbarie', name: 'Huile de pépins de figue de barbarie', ingredient: 'Opuntia ficus-indica (huile de pépins)', forDomain: 'skin', category: 'visage',
    durationMin: 2, frequency: 'Le soir', skinTypes: ['seche', 'normale', 'mixte'], concerns: ['rides', 'secheresse', 'eclat'], origin: 'Sidi Ifni et Aït Baâmrane',
    benefits: 'Huile précieuse, riche en vitamine E et en acides gras, appréciée pour le confort des peaux matures et le contour des yeux.',
    steps: ['Après le nettoyage du soir, déposer 1 à 2 gouttes au creux de la main.', 'Appliquer par pressions sur le visage, le cou et le contour des yeux.', 'Laisser pénétrer avant le coucher.'],
    precautions: ['Il faut environ une tonne de fruits pour 1 litre d\'huile : un prix bas doit alerter', 'Vérifier « 100 % pure, première pression à froid »', 'Peau à tendance acnéique : tester sur une petite zone'],
    avoidFor: [],
  },
  {
    slug: 'ghassoul-visage', name: 'Masque purifiant au ghassoul', ingredient: "Argile ghassoul + eau de rose", forDomain: 'skin', category: 'visage',
    durationMin: 10, frequency: '1 fois par semaine', skinTypes: ['grasse', 'mixte'], concerns: ['pores', 'acne'], origin: 'Moyen Atlas',
    benefits: 'Absorbe l\'excès de sébum de la zone T et laisse la peau nette.',
    steps: ['Mélanger 1 cuillère de ghassoul avec de l\'eau de rose.', 'Appliquer en couche fine sur la zone T, en évitant les yeux et les lèvres.', 'Retirer après 5 à 8 minutes, avant que le masque ne sèche.', 'Rincer à l\'eau tiède, puis hydrater.'],
    precautions: ['Ne pas laisser sécher : vaporiser de l\'eau de rose si besoin', 'Ne pas appliquer sur une peau sèche, irritée ou sous traitement anti-acné asséchant', 'Test 24 h avant sur une petite zone'],
    avoidFor: [],
  },
  {
    slug: 'nila', name: 'Masque à la nila', ingredient: 'Poudre de nila (Indigofera)', forDomain: 'skin', category: 'visage',
    durationMin: 15, frequency: '1 fois par semaine', skinTypes: ['normale', 'mixte', 'grasse'], concerns: ['eclat'], origin: 'Hammams du Sud marocain',
    benefits: 'Poudre bleue traditionnelle utilisée au hammam pour un effet « bonne mine ». Son effet éclaircissant n\'est pas démontré scientifiquement.',
    steps: ['Mélanger une pincée de nila avec du savon beldi ou de l\'eau de rose.', 'Appliquer sur le visage propre en évitant les yeux.', 'Rincer après 10 minutes.'],
    precautions: ['Peut colorer la peau en bleu de façon temporaire', 'Acheter une nila de source connue : certaines poudres contiennent des colorants ajoutés', 'Arrêter en cas de rougeurs ou de picotements', 'Pour les taches, préférer un actif validé (niacinamide, acide azélaïque) + protection solaire'],
    avoidFor: [],
  },
  {
    slug: 'masque-miel', name: 'Masque au miel', ingredient: 'Miel pur', forDomain: 'skin', category: 'visage',
    durationMin: 15, frequency: '1 à 2 fois par semaine', skinTypes: ['seche', 'normale', 'mixte'], concerns: ['secheresse', 'eclat'], origin: 'Remède de grand-mère',
    benefits: 'Le miel retient l\'eau (humectant) : la peau est plus douce et confortable.',
    steps: ['Sur une peau propre et humide, appliquer une fine couche de miel liquide.', 'Laisser poser 10 à 15 minutes.', 'Rincer à l\'eau tiède et hydrater.'],
    precautions: ['Éviter le miel d\'euphorbe (« daghmouss »), irritant pour la peau', 'Allergie au pollen ou à la propolis : faire un test 24 h avant', 'Ne pas appliquer sur une plaie ou une peau abîmée'],
    avoidFor: [],
  },
  {
    slug: 'masque-avoine-yaourt', name: "Masque apaisant avoine & yaourt", ingredient: "Flocons d'avoine moulus, yaourt nature", forDomain: 'skin', category: 'visage',
    durationMin: 15, frequency: '1 fois par semaine', skinTypes: ALL, concerns: ['rougeurs', 'secheresse'], origin: 'Recette de cuisine',
    benefits: 'L\'avoine apaise les peaux qui tiraillent ; le yaourt adoucit la peau.',
    steps: ['Mixer 2 cuillères de flocons d\'avoine en poudre fine.', 'Mélanger avec 2 cuillères de yaourt nature non sucré.', 'Appliquer 10 à 15 minutes, puis rincer à l\'eau tiède.'],
    precautions: ['Préparer au moment de l\'utilisation, ne pas conserver', 'Allergie aux produits laitiers ou à l\'avoine : ne pas utiliser'],
    avoidFor: [],
  },
  {
    slug: 'aloe-vera', name: "Gel d'aloe vera après soleil", ingredient: 'Aloe barbadensis (gel)', forDomain: 'skin', category: 'visage',
    durationMin: 2, frequency: 'Selon les besoins', skinTypes: ALL, concerns: ['rougeurs'], origin: 'Plante cultivée dans les jardins marocains',
    benefits: 'Rafraîchit et apaise la peau après une exposition au soleil.',
    steps: ['Appliquer une couche de gel pur sur la peau propre.', 'Laisser pénétrer, renouveler si besoin.'],
    precautions: ['Si vous utilisez la plante : laisser couler la sève jaune (aloïne), irritante, et rincer la feuille avant d\'en extraire le gel', 'Choisir un gel sans alcool', 'Un coup de soleil avec cloques, fièvre ou malaise nécessite un avis médical'],
    avoidFor: [],
  },
  {
    slug: 'aker-fassi', name: 'Aker fassi', ingredient: 'Pigment traditionnel (écorce de grenade, coquelicot)', forDomain: 'skin', category: 'visage',
    durationMin: 5, frequency: 'Occasionnel', skinTypes: ALL, concerns: [], origin: 'Fès',
    benefits: 'Le « rouge » traditionnel des joues et des lèvres.',
    steps: ['Humidifier légèrement le pigment.', 'Tamponner sur les joues ou les lèvres.', 'Estomper du bout des doigts.'],
    precautions: ['Composition souvent inconnue : des colorants non autorisés peuvent être ajoutés', 'Faire un test sur une petite zone 48 h avant', 'Préférer un produit étiqueté avec sa liste d\'ingrédients'],
    avoidFor: [],
  },

  // ───────── Cheveux ─────────
  {
    slug: 'ghassoul', name: 'Shampooing au ghassoul', ingredient: "Argile de l'Atlas", forDomain: 'hair', category: 'cheveux',
    durationMin: 15, frequency: '1 fois par semaine', skinTypes: ['all'], concerns: ['pellicules', 'gras'], origin: 'Moyen Atlas',
    benefits: 'Lave en douceur sans mousser, absorbe l\'excès de sébum et purifie le cuir chevelu.',
    steps: ['Délayer 2 à 3 cuillères dans de l\'eau tiède ou de l\'eau de rose.', 'Appliquer sur le cuir chevelu et les longueurs mouillés.', 'Masser doucement 5 à 10 minutes.', 'Rincer très abondamment.'],
    precautions: ['Ne pas laisser sécher', 'Cheveux secs ou crépus : espacer et faire suivre d\'un après-shampooing', 'Test sur une petite zone 24 h avant'],
    avoidFor: [],
  },
  {
    slug: 'henne', name: 'Henné capillaire', ingredient: 'Lawsonia inermis (henné pur)', forDomain: 'hair', category: 'cheveux',
    durationMin: 120, frequency: '1 fois par mois', skinTypes: ['all'], concerns: ['chute'], origin: 'Tradition marocaine',
    benefits: 'Gaine la fibre, donne du corps et des reflets cuivrés naturels.',
    steps: ['Mélanger la poudre pure avec de l\'eau tiède et laisser reposer.', 'Appliquer mèche par mèche sur cheveux propres.', 'Couvrir et laisser poser 1 à 2 heures.', 'Rincer jusqu\'à ce que l\'eau soit claire, puis appliquer un après-shampooing.'],
    precautions: ['Refuser tout « henné noir » ou « henné neutre » coloré : la PPD provoque des allergies graves', 'Test d\'allergie 48 h avant', 'Peut réagir avec une coloration chimique récente ou un défrisage', 'Peut assécher : faire suivre d\'un bain d\'huile'],
    avoidFor: [],
  },
  {
    slug: 'bain-huile', name: "Bain d'huile avant shampooing", ingredient: "Huile d'argan, d'olive ou de nigelle", forDomain: 'hair', category: 'cheveux',
    durationMin: 45, frequency: '1 fois par semaine', skinTypes: ['all'], concerns: ['secheresse', 'frisottis'], origin: 'Tradition familiale',
    benefits: 'Nourrit les longueurs et limite la casse des cheveux secs, bouclés ou crépus.',
    steps: ['Sur cheveux secs, appliquer l\'huile des longueurs aux pointes.', 'Masser le cuir chevelu si celui-ci n\'est pas gras.', 'Couvrir d\'une serviette chaude 30 minutes à une nuit.', 'Faire deux shampooings pour bien éliminer l\'huile.'],
    precautions: ['Cuir chevelu gras ou pelliculaire : appliquer seulement sur les longueurs', 'L\'huile d\'argan alimentaire (torréfiée) laisse une odeur forte'],
    avoidFor: [],
  },
  {
    slug: 'helba', name: 'Masque au fenugrec (helba)', ingredient: 'Graines de fenugrec', forDomain: 'hair', category: 'cheveux',
    durationMin: 40, frequency: '1 fois par semaine', skinTypes: ['all'], concerns: ['chute', 'secheresse'], origin: 'Recette traditionnelle marocaine',
    benefits: 'Masque gainant qui apporte brillance et souplesse. Son effet sur la chute n\'est pas démontré.',
    steps: ['Faire tremper 3 cuillères de graines une nuit dans l\'eau.', 'Mixer pour obtenir une pâte.', 'Appliquer sur cuir chevelu et longueurs, laisser poser 30 minutes.', 'Rincer soigneusement puis faire un shampooing.'],
    precautions: ['Odeur forte et persistante', 'Allergie aux arachides ou aux légumineuses : risque d\'allergie croisée, test indispensable', 'Une chute importante ou soudaine nécessite un avis médical'],
    avoidFor: [],
  },
  {
    slug: 'romarin', name: 'Rinçage au romarin (azir)', ingredient: 'Infusion de romarin', forDomain: 'hair', category: 'cheveux',
    durationMin: 10, frequency: '2 fois par semaine', skinTypes: ['all'], concerns: ['chute', 'gras'], origin: 'Plante aromatique du Moyen Atlas',
    benefits: 'Rinçage tonifiant et parfumé pour le cuir chevelu.',
    steps: ['Infuser une poignée de romarin dans 1 litre d\'eau bouillante, 15 minutes.', 'Laisser refroidir et filtrer.', 'Verser sur le cuir chevelu après le shampooing, masser, ne pas rincer.'],
    precautions: ['Utiliser l\'infusion, pas l\'huile essentielle pure (irritante)', 'Huile essentielle de romarin déconseillée pendant la grossesse et en cas d\'épilepsie', 'Peut foncer légèrement les cheveux très clairs'],
    avoidFor: ['pregnancy'],
  },
  {
    slug: 'nigelle', name: 'Massage à l\'huile de nigelle (sanouj)', ingredient: 'Nigella sativa (huile)', forDomain: 'hair', category: 'cheveux',
    durationMin: 30, frequency: '1 fois par semaine', skinTypes: ['all'], concerns: ['secheresse'], origin: 'Usage traditionnel au Maghreb',
    benefits: 'Massage nourrissant du cuir chevelu sec.',
    steps: ['Mélanger 1 cuillère d\'huile de nigelle avec 2 cuillères d\'huile d\'olive ou d\'argan.', 'Masser le cuir chevelu du bout des doigts 5 minutes.', 'Laisser poser 30 minutes puis faire un shampooing.'],
    precautions: ['Peut provoquer des allergies de contact : test 48 h avant sur l\'avant-bras', 'Toujours diluer dans une autre huile'],
    avoidFor: [],
  },
  {
    slug: 'vinaigre-cidre', name: 'Rinçage au vinaigre de cidre', ingredient: 'Vinaigre de cidre dilué', forDomain: 'hair', category: 'cheveux',
    durationMin: 2, frequency: '1 fois par semaine', skinTypes: ['all'], concerns: ['frisottis'], origin: 'Remède de grand-mère',
    benefits: 'Le rinçage acide lisse les écailles du cheveu : plus de brillance, moins de calcaire.',
    steps: ['Diluer 2 cuillères à soupe de vinaigre de cidre dans 1 litre d\'eau.', 'Verser sur les cheveux après le shampooing.', 'Rincer à l\'eau claire.'],
    precautions: ['Ne jamais utiliser pur', 'Éviter les yeux', 'Ne pas utiliser sur un cuir chevelu irrité ou blessé'],
    avoidFor: [],
  },

  // ───────── À éviter ─────────
  {
    slug: 'citron', name: 'Citron sur la peau', ingredient: 'Citrus limon', forDomain: 'skin', category: 'visage',
    durationMin: 0, frequency: 'À éviter', skinTypes: ALL, concerns: ['taches'], origin: 'Remède populaire',
    benefits: 'Souvent conseillé contre les taches, mais déconseillé par nos experts.',
    steps: ['Ne pas appliquer de citron pur sur la peau.'],
    precautions: ['Brûlures et taches brunes au soleil (phytophotodermatose)', 'Pour les taches : niacinamide, acide azélaïque ou vitamine C + protection solaire'],
    avoidFor: ['all'],
  },
  {
    slug: 'dentifrice-bouton', name: 'Dentifrice sur les boutons', ingredient: 'Dentifrice', forDomain: 'skin', category: 'visage',
    durationMin: 0, frequency: 'À éviter', skinTypes: ALL, concerns: ['acne'], origin: 'Remède populaire',
    benefits: 'Il assèche le bouton, mais irrite la peau et peut laisser une tache.',
    steps: ['Ne pas appliquer de dentifrice sur la peau.'],
    precautions: ['Menthol, fluor et détergents : irritation et brûlure', 'Préférer un soin local à l\'acide salicylique ou au peroxyde de benzoyle'],
    avoidFor: ['all'],
  },
  {
    slug: 'bicarbonate', name: 'Gommage au bicarbonate', ingredient: 'Bicarbonate de soude', forDomain: 'skin', category: 'visage',
    durationMin: 0, frequency: 'À éviter', skinTypes: ALL, concerns: ['pores'], origin: 'Remède populaire',
    benefits: 'Très alcalin, il abîme la barrière cutanée (pH naturel de la peau ≈ 5).',
    steps: ['Ne pas utiliser sur le visage.'],
    precautions: ['Sécheresse, rougeurs, sensibilité accrue', 'Préférer un exfoliant doux 1 fois par semaine'],
    avoidFor: ['all'],
  },
  {
    slug: 'khol-traditionnel', name: 'Khôl traditionnel en poudre', ingredient: 'Kohl (souvent à base de sulfure de plomb)', forDomain: 'skin', category: 'visage',
    durationMin: 0, frequency: 'À éviter', skinTypes: ALL, concerns: [], origin: 'Usage traditionnel',
    benefits: 'De nombreux khôls traditionnels contiennent du plomb, toxique, surtout pour les enfants et pendant la grossesse.',
    steps: ['Préférer un crayon ou un khôl cosmétique étiqueté et vendu en pharmacie ou parapharmacie.'],
    precautions: ['Ne jamais en appliquer aux bébés et aux enfants', 'Déconseillé pendant la grossesse et l\'allaitement'],
    avoidFor: ['all'],
  },
];

export async function importRituals(prisma: PrismaClient) {
  for (const r of RITUALS) {
    const data = { ...r, howTo: r.steps.join(' '), validatedBy: null, validatedAt: null };
    await prisma.ritual.upsert({ where: { slug: r.slug }, create: data, update: data });
  }
  // Anciennes cartes remplacées
  await prisma.ritual.deleteMany({ where: { slug: { notIn: RITUALS.map((r) => r.slug) } } });
  return RITUALS.length;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  importRituals(prisma).then((n) => console.log(`✓ ${n} rituels importés (à valider par le pharmacien conseil)`)).finally(() => prisma.$disconnect());
}
