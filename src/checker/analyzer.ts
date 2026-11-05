/**
 * Analyse d'un produit déjà utilisé par l'utilisatrice : liste INCI comparée à son profil
 * (type de peau, sensibilité, préoccupations, grossesse, allergies).
 * Règles déterministes et prudentes, à valider par le pharmacien conseil. Aucun modèle de langage.
 * Les textes (titres, détails) sont en français et traduits par les applications (dictionnaire commun).
 */

export type Verdict = 'adapte' | 'surveiller' | 'deconseille' | 'inconnu';
export type Level = 'stop' | 'warn' | 'info';

export interface Issue { code: string; level: Level; title: string; detail: string; ingredients: string[] }
export interface Positive { concern: string; title: string; ingredients: string[] }
export interface Analysis {
  verdict: Verdict;
  score: number;
  issues: Issue[];
  positives: Positive[];
  advice: string[];
  ingredientsCount: number;
  leaveOn: boolean;
  category: string;
}

export interface Profile {
  skinType?: string | null; // seche | grasse | mixte | normale
  sensitive?: boolean;
  concerns: string[];
  pregnant?: boolean;
  breastfeeding?: boolean;
  allergies: string[];
}

export const CATEGORIES = ['cleanser', 'toner', 'serum', 'treatment', 'moisturizer', 'sunscreen', 'mask', 'shampoo', 'conditioner', 'hair_mask', 'hair_oil', 'other'] as const;
const RINSE_OFF = new Set(['cleanser', 'shampoo', 'conditioner', 'hair_mask', 'mask']);

/** Découpe une liste INCI (y compris issue d'une photo : césures, points, retours à la ligne). */
export function parseInci(text: string): string[] {
  let t = text
    .replace(/\r/g, '\n')
    .replace(/(\w)\s*-\s*\n\s*(\w)/g, '$1$2') // césure en fin de ligne
    .replace(/(\w) - (\w)/g, '$1$2') // « CAPRY - LIC » (photo)
    .replace(/\n+/g, ', ');
  // Garder seulement ce qui suit « Ingredients : » si présent
  const m = /(ingr[ée]dients?|composition|inci)\s*[:：]/i.exec(t);
  if (m) t = t.slice(m.index + m[0].length);
  return t
    .split(/[,;•·]|\.\s+|\s\*\s/)
    .map((s) => s.replace(/\[[^\]]*\]|\{[^}]*\}/g, '').replace(/\d+([.,]\d+)?\s*%/g, '').replace(/[*†]/g, '').replace(/\s+/g, ' ').trim().toUpperCase())
    .map((s) => s.replace(/^AQUA\s*\/\s*WATER.*$|^WATER\s*\/\s*AQUA.*$/, 'AQUA').replace(/\.$/, ''))
    .filter((s) => s.length > 1 && s.length < 120 && /[A-Z]/.test(s));
}

type Rule = { re: RegExp; label?: string };
const has = (list: string[], rules: RegExp[]) => list.filter((i) => rules.some((r) => r.test(i)));

// ───────── Ingrédients à risque
const RETINOIDS = [/\bRETINOL\b/, /\bRETINAL(DEHYDE)?\b/, /RETINYL/, /TRETINOIN/, /ADAPALENE/, /HYDROXYPINACOLONE RETINOATE/, /TAZAROTENE/];
const FORBIDDEN = [/HYDROQUINONE/, /MERCUR/, /CALOMEL/, /CLOBETASOL/, /BETAMETHASONE/, /HYDROCORTISONE/, /DEXAMETHASONE/, /TRIAMCINOLONE/, /FLUOCINOLONE/];
const SALICYLIC = [/SALICYLIC ACID/, /BETAINE SALICYLATE/, /\bBHA\b/];
const BENZOYL = [/BENZOYL PEROXIDE/];
const AHA = [/GLYCOLIC ACID/, /LACTIC ACID/, /MANDELIC ACID/, /MALIC ACID/, /TARTARIC ACID/];
const FRAGRANCE = [/^PARFUM\b/, /^FRAGRANCE\b/, /^AROMA$/, /\bPARFUM\s*\/\s*FRAGRANCE/, /FRAGRANCE\s*\/\s*PARFUM/];
const ALLERGENS = [/^LIMONENE$/, /^LINALOOL$/, /CITRONELLOL/, /GERANIOL/, /^CITRAL$/, /\bEUGENOL/, /COUMARIN/, /CINNAMAL/, /CINNAMYL ALCOHOL/, /HYDROXYCITRONELLAL/, /BENZYL SALICYLATE/, /BENZYL BENZOATE/, /BENZYL CINNAMATE/, /FARNESOL/, /ANISE ALCOHOL/, /ALPHA-ISOMETHYL IONONE/, /EVERNIA/];
const BANNED_ALLERGENS = [/BUTYLPHENYL METHYLPROPIONAL/, /LILIAL/, /HYDROXYISOHEXYL 3-CYCLOHEXENE CARBOXALDEHYDE/, /LYRAL/];
const ESSENTIAL_OILS = [/(LAVANDULA|MENTHA|EUCALYPTUS|CITRUS|MELALEUCA|ROSMARINUS|CINNAMOMUM|SYZYGIUM|PELARGONIUM|CYMBOPOGON|THYMUS|ORIGANUM).*(OIL|EXTRACT)/, /^MENTHOL$/, /^CAMPHOR$/, /PEPPERMINT/];
const DRYING_ALCOHOL = [/ALCOHOL DENAT/, /SD ALCOHOL/, /^ALCOHOL$/, /^ETHANOL$/, /^ISOPROPYL ALCOHOL$/];
const HARSH_SULFATES = [/SODIUM LAURYL SULFATE/, /AMMONIUM LAURYL SULFATE/];
const ISOTHIAZOLINONES = [/METHYLISOTHIAZOLINONE/, /METHYLCHLOROISOTHIAZOLINONE/];
const FORMALDEHYDE_RELEASERS = [/DMDM HYDANTOIN/, /IMIDAZOLIDINYL UREA/, /DIAZOLIDINYL UREA/, /QUATERNIUM-15/, /BRONOPOL/, /2-BROMO-2-NITROPROPANE/];
const COMEDOGENIC = [/COCOS NUCIFERA (OIL|BUTTER)/, /^COCONUT OIL/, /ISOPROPYL MYRISTATE/, /ISOPROPYL PALMITATE/, /ISOPROPYL ISOSTEARATE/, /MYRISTYL MYRISTATE/, /^LAURIC ACID$/, /ETHYLHEXYL PALMITATE/, /THEOBROMA CACAO/, /TRITICUM VULGARE (GERM )?OIL/, /ALGAE EXTRACT/, /CARRAGEENAN/, /LINUM USITATISSIMUM/, /ACETYLATED LANOLIN/, /DECYL OLEATE/, /OLETH-3/, /LAURETH-4/];
const UV_FILTERS = [/ZINC OXIDE/, /TITANIUM DIOXIDE/, /AVOBENZONE|BUTYL METHOXYDIBENZOYLMETHANE/, /OCTOCRYLENE/, /HOMOSALATE/, /ETHYLHEXYL (METHOXYCINNAMATE|SALICYLATE|TRIAZONE)/, /BIS-ETHYLHEXYLOXYPHENOL/, /DIETHYLAMINO HYDROXYBENZOYL/, /METHYLENE BIS-BENZOTRIAZOLYL/, /TEREPHTHALYLIDENE/, /DROMETRIZOLE/, /TRIS-BIPHENYL TRIAZINE/, /METHOXYPROPYLAMINO/, /OCTISALATE|OXYBENZONE|BENZOPHENONE-3/, /POLYSILICONE-15/, /PHENYLBENZIMIDAZOLE/];

// ───────── Actifs bénéfiques par préoccupation
const GOOD: Record<string, { title: string; rules: RegExp[] }> = {
  acne: { title: 'Actifs contre les imperfections', rules: [...SALICYLIC, /NIACINAMIDE/, /ZINC (PCA|GLUCONATE|SULFATE)/, /AZELAIC ACID/, ...BENZOYL, /^SULFUR$/, /GLUCONOLACTONE/, /ADAPALENE/, /MELALEUCA/, /PROPOLIS/, /CENTELLA/] },
  taches: { title: 'Actifs anti-taches', rules: [/NIACINAMIDE/, /ARBUTIN/, /TRANEXAMIC/, /AZELAIC ACID/, /ASCORBIC ACID|ASCORBYL|ASCORBATE/, /KOJIC/, /ISOBUTYLAMIDO THIAZOLYL RESORCINOL/, /GLYCYRRHIZA/, /GLYCOLIC ACID/, /MANDELIC ACID/] },
  rides: { title: 'Actifs anti-âge', rules: [...RETINOIDS, /PALMITOYL|HEXAPEPTIDE|TRIPEPTIDE|TETRAPEPTIDE|PEPTIDE/, /BAKUCHIOL/, /ASCORBIC ACID|ASCORBYL/, /HYALURON/] },
  secheresse: { title: 'Actifs hydratants et nourrissants', rules: [/CERAMIDE/, /HYALURON/, /^GLYCERIN$/, /SQUALANE/, /BUTYROSPERMUM PARKII/, /PANTHENOL/, /^UREA$/, /CHOLESTEROL/, /ARGANIA SPINOSA/, /SNAIL SECRETION/] },
  rougeurs: { title: 'Actifs apaisants', rules: [/CENTELLA|MADECASSOSIDE|ASIATICOSIDE/, /PANTHENOL/, /ALLANTOIN/, /BISABOLOL/, /AZELAIC ACID/, /NIACINAMIDE/, /AVENA SATIVA/, /THERMAL (SPRING )?WATER|EAU THERMALE/, /HOUTTUYNIA/, /CAMELLIA SINENSIS/] },
  pores: { title: 'Actifs pour les pores et le sébum', rules: [/NIACINAMIDE/, ...SALICYLIC, /ZINC (PCA|GLUCONATE)/, /KAOLIN|BENTONITE|MOROCCAN LAVA CLAY|ILLITE/] },
  eclat: { title: 'Actifs éclat', rules: [/ASCORBIC ACID|ASCORBYL|ASCORBATE/, /NIACINAMIDE/, /GLYCOLIC ACID/, /LACTIC ACID/, /ORYZA SATIVA/, /GLUTATHIONE/] },
  pellicules: { title: 'Actifs antipelliculaires', rules: [/PIROCTONE OLAMINE/, /ZINC PYRITHIONE/, /CICLOPIROX/, /KETOCONAZOLE/, /SELENIUM SULFIDE/, ...SALICYLIC] },
  chute: { title: 'Actifs pour la chute des cheveux', rules: [/CAFFEINE/, /AMINEXIL|DIAMINOPYRIMIDINE OXIDE/, /BIOTIN/, /ROSMARINUS/] },
  frisottis: { title: 'Actifs nourrissants pour les cheveux', rules: [/ARGANIA SPINOSA/, /BUTYROSPERMUM PARKII/, /COCOS NUCIFERA/, /RICINUS COMMUNIS/, /PANTHENOL/, /KERATIN/] },
};

/** Type de peau visé d'après le nom du produit (« peaux sèches », « oily skin »…). */
export function targetSkinType(name: string): string | null {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/peaux? (tres )?seches?|dry skin|peau normale a seche/.test(n)) return 'seche';
  if (/peaux? grasses?|oily skin|peau mixte a grasse|acne|imperfections/.test(n)) return 'grasse';
  return null;
}

/** Catégorie déduite du nom ou des catégories Open Beauty Facts. */
export function guessCategory(text: string): string {
  const n = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/apres[- ]shampo|conditioner|apres-shampooing/.test(n)) return 'conditioner';
  if (/shampo/.test(n)) return 'shampoo';
  if (/masque (capillaire|cheveux)|hair mask/.test(n)) return 'hair_mask';
  if (/huile (capillaire|cheveux)|hair oil/.test(n)) return 'hair_oil';
  if (/spf|solaire|sun ?(screen|cream|serum|stick|lotion)|ecran/.test(n)) return 'sunscreen';
  if (/nettoyant|cleanser|cleansing|gel moussant|lavant|micellaire|micellar|demaquill|foam|savon|wash/.test(n)) return 'cleanser';
  if (/tonique|toner|lotion tonique/.test(n)) return 'toner';
  if (/masque|mask/.test(n)) return 'mask';
  if (/serum|ampoule|essence|booster|concentre/.test(n)) return 'serum';
  if (/creme|cream|baume|balm|moistur|gel-creme|emulsion|fluide|lotion/.test(n)) return 'moisturizer';
  return 'other';
}

const TYPE_FR: Record<string, string> = { seche: 'sèches', grasse: 'grasses', mixte: 'mixtes', normale: 'normales' };

export function analyze(input: { ingredients: string[]; category: string; name?: string; avoidFor?: string[]; skinTypes?: string[] }, p: Profile): Analysis {
  const list = input.ingredients;
  const category = input.category || 'other';
  const leaveOn = !RINSE_OFF.has(category);
  const issues: Issue[] = [];
  const positives: Positive[] = [];
  const advice: string[] = [];
  const add = (code: string, level: Level, title: string, detail: string, ingredients: string[]) => issues.push({ code, level, title, detail, ingredients: [...new Set(ingredients)].slice(0, 6) });
  const pregnant = !!(p.pregnant || p.breastfeeding);
  const sensitive = !!p.sensitive || p.concerns.includes('rougeurs');
  const acneProne = p.concerns.includes('acne') || p.skinType === 'grasse' || p.skinType === 'mixte';
  const dry = p.skinType === 'seche' || p.concerns.includes('secheresse');

  if (!list.length) {
    return { verdict: 'inconnu', score: 0, issues: [{ code: 'no_ingredients', level: 'info', title: 'Liste des ingrédients introuvable', detail: 'Photographiez la liste des ingrédients au dos du produit pour une analyse complète.', ingredients: [] }], positives: [], advice: [], ingredientsCount: 0, leaveOn, category };
  }

  // 1. Interdits / dangereux (blanchissants, corticoïdes)
  const forbidden = has(list, FORBIDDEN);
  if (forbidden.length) add('forbidden', 'stop', 'Ingrédient interdit dans les cosmétiques', 'Ces substances (blanchissants, mercure, corticoïdes) sont interdites dans les cosmétiques : risques de taches, d’amincissement de la peau et d’effets graves. Arrêtez ce produit et parlez-en à un médecin.', forbidden);

  // 2. Allergies déclarées
  const allergies = p.allergies.map((a) => a.trim().toUpperCase()).filter((a) => a.length > 2);
  const allergic = list.filter((i) => allergies.some((a) => i.includes(a)));
  if (allergic.length) add('allergy', 'stop', 'Contient un ingrédient auquel vous êtes allergique', 'Vous avez signalé une allergie à cet ingrédient dans votre profil.', allergic);

  // 3. Grossesse / allaitement
  if (pregnant) {
    const ret = has(list, RETINOIDS);
    if (ret.length || input.avoidFor?.includes('pregnancy')) add('pregnancy_retinoid', 'stop', 'À éviter pendant la grossesse et l’allaitement', 'Les rétinoïdes (dérivés de la vitamine A) sont déconseillés pendant la grossesse et l’allaitement.', ret);
    const sal = has(list, SALICYLIC);
    if (sal.length && leaveOn) add('pregnancy_salicylic', 'warn', 'Prudence pendant la grossesse', 'L’acide salicylique en soin sans rinçage est à éviter en usage prolongé pendant la grossesse : demandez l’avis de votre médecin ou pharmacien.', sal);
    const bpo = has(list, BENZOYL);
    if (bpo.length) add('pregnancy_bpo', 'info', 'Demandez l’avis d’un professionnel', 'Le peroxyde de benzoyle pendant la grossesse : à utiliser seulement sur avis médical.', bpo);
  }

  // 4. Parfum interdit dans l'UE (Lilial, Lyral)
  const bannedAllergens = has(list, BANNED_ALLERGENS);
  if (bannedAllergens.length) add('banned_allergen', 'warn', 'Allergène interdit en Europe depuis 2022', 'Ce parfum de synthèse est interdit dans les cosmétiques européens : produit ancien ou non conforme.', bannedAllergens);

  // 5. Peau sensible ou rougeurs
  const fragrance = has(list, FRAGRANCE);
  const allergens = has(list, ALLERGENS);
  const oils = has(list, ESSENTIAL_OILS);
  const preservatives = [...has(list, ISOTHIAZOLINONES), ...has(list, FORMALDEHYDE_RELEASERS)];
  if (sensitive) {
    if (fragrance.length || allergens.length || oils.length) add('fragrance', leaveOn ? 'warn' : 'info', 'Parfum ou huiles essentielles', leaveOn ? 'Le parfum et les allergènes parfumés sont la première cause de réactions sur les peaux sensibles ou à rougeurs.' : 'Produit rincé : le risque est plus faible, mais arrêtez en cas de picotements.', [...fragrance, ...allergens, ...oils]);
    if (preservatives.length) add('preservatives', 'warn', 'Conservateur souvent allergisant', 'Ces conservateurs provoquent fréquemment des allergies de contact.', preservatives);
    const ret = has(list, RETINOIDS);
    if (ret.length && !pregnant && leaveOn) add('sensitive_retinoid', 'warn', 'Actif puissant pour une peau sensible', 'Les rétinoïdes peuvent irriter : commencez 2 soirs par semaine et espacez en cas de rougeurs.', ret);
    const aha = has(list, AHA);
    if (aha.length && leaveOn) add('sensitive_aha', 'warn', 'Exfoliant acide pour une peau sensible', 'Les AHA peuvent piquer et rougir les peaux sensibles : usage espacé recommandé.', aha);
  } else if (preservatives.length) {
    add('preservatives', 'info', 'Conservateur parfois allergisant', 'Arrêtez en cas de démangeaisons ou de rougeurs.', preservatives);
  }

  // 6. Peau sèche : alcool desséchant, sulfates agressifs
  const top = list.slice(0, 6);
  const alcohol = has(top, DRYING_ALCOHOL);
  if (alcohol.length && leaveOn && (dry || sensitive)) add('alcohol', 'warn', 'Alcool desséchant en tête de liste', 'Un alcool parmi les premiers ingrédients peut dessécher et fragiliser une peau sèche ou sensible.', alcohol);
  const sulfates = has(list, HARSH_SULFATES);
  if (sulfates.length && (dry || sensitive)) add('sulfates', 'warn', 'Tensioactif agressif', 'Le laurylsulfate de sodium décape le film protecteur de la peau : il peut tirailler et irriter.', sulfates);

  // 7. Peau à imperfections : ingrédients comédogènes
  const comedo = has(list, COMEDOGENIC);
  if (comedo.length && acneProne && leaveOn) add('comedogenic', comedo.length >= 2 && p.concerns.includes('acne') ? 'stop' : 'warn', 'Ingrédients pouvant boucher les pores', 'Sur une peau grasse ou à imperfections, ces ingrédients peuvent favoriser points noirs et boutons dans un soin sans rinçage.', comedo);

  // 8. Type de peau visé par le produit
  const target = input.skinTypes?.length ? (input.skinTypes.includes('all') || !p.skinType || input.skinTypes.includes(p.skinType) ? null : input.skinTypes[0]) : targetSkinType(input.name ?? '');
  if (p.skinType && target && target !== p.skinType && !(target === 'grasse' && p.skinType === 'mixte') && !(target === 'seche' && p.skinType === 'normale')) {
    add('skin_type', 'warn', `Formulé pour les peaux ${TYPE_FR[target] ?? target}`, target === 'seche' ? 'Texture probablement trop riche pour votre peau : risque de brillance ou d’imperfections.' : 'Formule prévue pour une peau plus grasse : elle peut dessécher ou tirailler la vôtre.', []);
  }

  // 9. Conseils
  if (has(list, [...RETINOIDS, ...AHA]).length && leaveOn) advice.push('Actif photosensibilisant : appliquez une protection solaire SPF 50 chaque matin.');
  if (category === 'sunscreen' && !has(list, UV_FILTERS).length) advice.push('Aucun filtre UV reconnu dans la liste : vérifiez qu’il s’agit bien d’une protection solaire.');
  if (has(list, RETINOIDS).length && has(list, AHA).length) advice.push('Rétinoïde et acides dans le même produit : à utiliser le soir, sans autre exfoliant.');

  // 10. Points forts par rapport à ses préoccupations
  for (const c of p.concerns) {
    const g = GOOD[c];
    if (!g) continue;
    const hit = has(list, g.rules);
    if (hit.length) positives.push({ concern: c, title: g.title, ingredients: [...new Set(hit)].slice(0, 4) });
  }
  if (sensitive && leaveOn && !fragrance.length && !allergens.length && !oils.length) positives.push({ concern: 'sensible', title: 'Sans parfum ajouté', ingredients: [] });

  const stops = issues.filter((i) => i.level === 'stop').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const verdict: Verdict = stops ? 'deconseille' : warns >= 3 ? 'deconseille' : warns ? 'surveiller' : 'adapte';
  const score = Math.max(5, Math.min(100, 85 - stops * 45 - warns * 15 + positives.length * 6));
  return { verdict, score, issues, positives, advice, ingredientsCount: list.length, leaveOn, category };
}
