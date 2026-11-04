import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';

export type Level = 'faible' | 'moyen' | 'marque';
export const CONCERNS = ['acne', 'taches', 'rides', 'pores', 'secheresse', 'rougeurs'] as const;
export type Concern = (typeof CONCERNS)[number];
export const ZONES = ['front', 'joues', 'menton'] as const;

export interface AnalysisResult {
  zones: Record<(typeof ZONES)[number], Partial<Record<Concern, Level>>>;
  concerns: Record<Concern, Level>;
  score: number;
  /** Résumé rédigé par le fournisseur (sinon généré par summarize) */
  summary?: string[];
  /** Signe visible justifiant un avis médical (RG-02) */
  medicalFlag?: string | null;
}

/** Photo inexploitable : renvoyée telle quelle à l'utilisatrice avec un conseil. */
export class PhotoQualityError extends Error {}

export function scoreOf(concerns: Record<Concern, Level>): number {
  const penalty = Object.values(concerns).reduce((s, l) => s + (l === 'marque' ? 12 : l === 'moyen' ? 6 : 1), 0);
  return Math.max(35, 100 - penalty);
}

/**
 * Interface interne : la brique d'analyse louée (ex. Perfect Corp) se branche ici,
 * ce qui permet de changer de fournisseur sans toucher au reste de l'app.
 */
export interface SkinAnalysisProvider {
  readonly name: string;
  readonly costMad: number;
  analyze(image: Buffer, hints: AnalysisHints): Promise<AnalysisResult>;
}

export interface AnalysisHints { declaredConcerns: string[]; skinType?: string; mimeType?: string; lang?: string }

/** Fournisseur de démonstration : résultat déterministe dérivé de l'image et du questionnaire. */
export class MockSkinProvider implements SkinAnalysisProvider {
  readonly name = 'mock';
  readonly costMad = 0;

  async analyze(image: Buffer, hints: AnalysisHints): Promise<AnalysisResult> {
    const h = createHash('sha256').update(image).digest();
    const lvl = (n: number, boost: boolean): Level => {
      const v = (n % 100) + (boost ? 45 : 0);
      return v > 105 ? 'marque' : v > 60 ? 'moyen' : 'faible';
    };
    const concerns = {} as Record<Concern, Level>;
    CONCERNS.forEach((c, i) => {
      const boost = hints.declaredConcerns.includes(c) || (c === 'secheresse' && hints.skinType === 'seche') || (c === 'pores' && hints.skinType === 'grasse');
      concerns[c] = lvl(h[i], boost);
    });
    const zones: AnalysisResult['zones'] = {
      front: { pores: concerns.pores, rides: concerns.rides, acne: concerns.acne === 'marque' ? 'moyen' : concerns.acne },
      joues: { taches: concerns.taches, rougeurs: concerns.rougeurs, secheresse: concerns.secheresse },
      menton: { acne: concerns.acne, pores: concerns.pores === 'marque' ? 'moyen' : 'faible' },
    };
    const penalty = Object.values(concerns).reduce((s, l) => s + (l === 'marque' ? 12 : l === 'moyen' ? 6 : 1), 0);
    return { zones, concerns, score: Math.max(35, 100 - penalty) };
  }
}

const LevelZ = z.enum(['faible', 'moyen', 'marque']);
const ConcernsZ = z.object({ acne: LevelZ, taches: LevelZ, rides: LevelZ, pores: LevelZ, secheresse: LevelZ, rougeurs: LevelZ });
const SkinAnalysisZ = z.object({
  photo: z.object({
    visage_humain_de_face: z.boolean(),
    eclairage: z.enum(['correct', 'trop_sombre', 'surexpose', 'contre_jour']),
    nettete: z.enum(['nette', 'floue']),
    maquillage_visible: z.boolean(),
  }),
  zones: z.object({ front: ConcernsZ, joues: ConcernsZ, menton: ConcernsZ }),
  global: ConcernsZ,
  resume: z.array(z.string()).describe('Exactement 3 phrases courtes, langage simple, dans la langue demandée'),
  signe_a_surveiller: z.boolean().describe('true si un élément visible justifie un avis médical'),
  raison_signe: z.string().describe('Description courte et prudente du signe, ou chaîne vide'),
});

const LANG_NAME: Record<string, string> = { fr: 'français', ar: 'arabe', en: 'anglais' };

/**
 * Analyse cosmétique réelle de la photo par Claude (vision).
 * Transfert de la photo hors du Maroc : autorisation CNDP requise avant la mise en production.
 */
export class ClaudeSkinProvider implements SkinAnalysisProvider {
  readonly name = 'claude-vision';
  readonly costMad = Number(process.env.SKIN_ANALYSIS_COST_MAD ?? 0.3);
  async analyze(image: Buffer, hints: AnalysisHints): Promise<AnalysisResult> {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error("Service d'analyse non configuré : renseigner ANTHROPIC_API_KEY (ou SKIN_PROVIDER=mock en développement).");
    }
    const client = new Anthropic();
    const mediaType = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(hints.mimeType ?? '') ? hints.mimeType : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    const lang = LANG_NAME[hints.lang ?? 'fr'] ?? 'français';
    const params = {
      model: process.env.SKIN_ANALYSIS_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(SkinAnalysisZ) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `Tu es le module d'analyse cosmétique de Dermora, une application de soins de la peau au Maroc.
Tu observes un selfie et tu évalues l'APPARENCE de la peau pour adapter une routine cosmétique. Tu ne poses jamais de diagnostic médical, tu ne nommes aucune maladie et tu n'identifies pas la personne.

Pour chaque zone (front, joues, menton) et globalement, note six préoccupations visibles : acne (boutons, points noirs), taches (hyperpigmentation), rides (ridules), pores (pores dilatés), secheresse (desquamation, aspect terne et tiraillé), rougeurs.
Niveaux : « faible » (absent ou à peine visible), « moyen » (clairement visible), « marque » (très présent). En cas de doute, choisis le niveau le plus bas : ne surestime jamais.
Tiens compte de toutes les carnations de façon équitable ; une pigmentation naturelle uniforme n'est pas une tache.
Vérifie d'abord la photo : visage humain vu de face, éclairage, netteté, maquillage. Si la photo est inexploitable, note quand même les niveaux au mieux, ils ne seront pas utilisés.
signe_a_surveiller = true uniquement si tu vois un élément qui mérite l'avis d'un médecin (grain de beauté irrégulier ou de plusieurs couleurs, plaie ouverte, lésion qui saigne, éruption étendue). Décris-le prudemment, sans diagnostic.
Le résumé : exactement 3 phrases courtes et bienveillantes en ${lang} (les deux points principaux, puis un point positif).`,
      messages: [{
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: image.toString('base64') } },
          { type: 'text' as const, text: `Préoccupations déclarées par l'utilisatrice : ${hints.declaredConcerns.join(', ') || 'aucune'}. Type de peau déclaré : ${hints.skinType ?? 'inconnu'}. Ces informations sont indicatives : base-toi sur ce que tu vois.` },
        ],
      }],
    };
    const res = await client.beta.messages.parse(params as never) as unknown as { stop_reason: string; parsed_output: z.infer<typeof SkinAnalysisZ> | null };
    if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error('Analyse indisponible pour cette photo.');
    const a = res.parsed_output;
    if (!a.photo.visage_humain_de_face) throw new PhotoQualityError('Aucun visage de face détecté : cadrez votre visage entier, de face, dans l\'ovale.');
    if (a.photo.eclairage === 'trop_sombre') throw new PhotoQualityError('Photo trop sombre : placez-vous face à une fenêtre, en lumière du jour.');
    if (a.photo.eclairage === 'surexpose' || a.photo.eclairage === 'contre_jour') throw new PhotoQualityError('Lumière inadaptée : évitez le contre-jour, le soleil direct et le flash.');
    if (a.photo.nettete === 'floue') throw new PhotoQualityError('Photo floue : tenez le téléphone stable et nettoyez l\'objectif.');
    if (a.photo.maquillage_visible) throw new PhotoQualityError('Maquillage visible : démaquillez-vous pour une analyse fiable.');
    return {
      zones: a.zones,
      concerns: a.global,
      score: scoreOf(a.global),
      summary: a.resume.slice(0, 3),
      medicalFlag: a.signe_a_surveiller ? (a.raison_signe || 'Un élément visible mérite l\'avis d\'un médecin.') : null,
    };
  }
}

/** Brique Perfect Corp (à activer après signature du contrat et autorisation CNDP de transfert). */
export class PerfectCorpProvider implements SkinAnalysisProvider {
  readonly name = 'perfectcorp';
  readonly costMad = 2.5;
  async analyze(): Promise<AnalysisResult> {
    throw new Error('Fournisseur Perfect Corp non configuré : renseigner PERFECTCORP_API_KEY et l\'autorisation CNDP.');
  }
}

/**
 * Fournisseur d'analyse : SKIN_PROVIDER = claude (par défaut) | perfectcorp | mock (développement uniquement).
 */
export function getProvider(): SkinAnalysisProvider {
  const p = process.env.SKIN_PROVIDER ?? 'claude';
  if (p === 'perfectcorp' && process.env.PERFECTCORP_API_KEY) return new PerfectCorpProvider();
  if (p === 'mock') return new MockSkinProvider();
  return new ClaudeSkinProvider();
}

const LABELS: Record<string, Record<Concern, string>> = {
  fr: { acne: 'imperfections', taches: 'taches', rides: 'ridules', pores: 'pores visibles', secheresse: 'sécheresse', rougeurs: 'rougeurs' },
  en: { acne: 'blemishes', taches: 'dark spots', rides: 'fine lines', pores: 'visible pores', secheresse: 'dryness', rougeurs: 'redness' },
  ar: { acne: 'الحبوب', taches: 'البقع', rides: 'الخطوط الدقيقة', pores: 'المسام الظاهرة', secheresse: 'الجفاف', rougeurs: 'الاحمرار' },
};
const ZONE_LABELS: Record<string, Record<string, string>> = {
  fr: { front: 'le front', joues: 'les joues', menton: 'le menton' },
  en: { front: 'forehead', joues: 'cheeks', menton: 'chin' },
  ar: { front: 'الجبهة', joues: 'الخدين', menton: 'الذقن' },
};

/** DER-12 — trois points principaux en langage simple. */
export function summarize(r: AnalysisResult, lang = 'fr'): string[] {
  const L = LABELS[lang] ?? LABELS.fr;
  const Z = ZONE_LABELS[lang] ?? ZONE_LABELS.fr;
  const rank = (l: Level) => (l === 'marque' ? 2 : l === 'moyen' ? 1 : 0);
  const sorted = [...CONCERNS].sort((a, b) => rank(r.concerns[b]) - rank(r.concerns[a]));
  const zoneOf = (c: Concern) => (Object.entries(r.zones).find(([, v]) => v[c] && rank(v[c]!) === rank(r.concerns[c]))?.[0] ?? 'front');
  const out: string[] = [];
  for (const c of sorted.slice(0, 2)) {
    const lv = r.concerns[c];
    if (lang === 'en') out.push(`${lv === 'marque' ? 'Marked' : lv === 'moyen' ? 'Moderate' : 'Light'} ${L[c]}, mostly on the ${Z[zoneOf(c)]}.`);
    else if (lang === 'ar') out.push(`${L[c]} ${lv === 'marque' ? 'واضحة' : lv === 'moyen' ? 'متوسطة' : 'خفيفة'}، خاصة على ${Z[zoneOf(c)]}.`);
    else out.push(`${L[c].charAt(0).toUpperCase() + L[c].slice(1)} ${lv === 'marque' ? 'marquées' : lv === 'moyen' ? 'modérées' : 'légères'}, surtout sur ${Z[zoneOf(c)]}.`);
  }
  const best = sorted[sorted.length - 1];
  if (lang === 'en') out.push(`Good news: ${L[best]} are barely visible.`);
  else if (lang === 'ar') out.push(`خبر جيد: ${L[best]} بالكاد تظهر.`);
  else out.push(`Bonne nouvelle : ${L[best]} à peine visibles.`);
  return out;
}
