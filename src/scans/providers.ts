import { z } from 'zod';

/**
 * Analyse de peau « sur l'appareil » : la photo est analysée dans le navigateur ou le téléphone
 * (Dermora-web/lib/skin-analysis.ts, Dermora-mobile/lib/core/skin_analysis.dart) et n'est JAMAIS envoyée.
 * L'API ne reçoit que des mesures chiffrées par zone, qu'elle convertit ici en niveaux.
 */
export type Level = 'faible' | 'moyen' | 'marque';
export const CONCERNS = ['acne', 'taches', 'rides', 'pores', 'secheresse', 'rougeurs'] as const;
export type Concern = (typeof CONCERNS)[number];
export const ZONES = ['front', 'joues', 'menton'] as const;
export type Zone = (typeof ZONES)[number];

export const ENGINE = 'dermora-local-1';

const unit = z.number().finite().min(0).max(1);
const ZoneMetricsZ = z.object({
  redness: unit, // part de peau nettement plus rouge que la moyenne du visage
  blemish: unit, // petites zones rouges localisées (imperfections)
  spots: unit, // petites zones plus foncées non rouges (taches)
  unevenness: unit, // irrégularité du teint (écart-type de la luminance lissée)
  texture: unit, // micro-relief (grain, pores)
  shine: unit, // reflets brillants (sébum)
  lines: unit, // lignes horizontales fines (ridules)
});
export type ZoneMetrics = z.infer<typeof ZoneMetricsZ>;

export const OnDeviceScanZ = z.object({
  engine: z.literal(ENGINE),
  quality: z.object({ brightness: z.number(), sharpness: z.number(), faceRatio: unit, lightBalance: z.number() }),
  zones: z.object({ front: ZoneMetricsZ, joues: ZoneMetricsZ, menton: ZoneMetricsZ }),
});
export type OnDeviceScan = z.infer<typeof OnDeviceScanZ>;

export interface AnalysisResult {
  engine: string;
  zones: Record<Zone, Partial<Record<Concern, Level>>>;
  concerns: Record<Concern, Level>;
  score: number;
  /** Préoccupations estimées surtout à partir du questionnaire (non mesurables de façon fiable sur une photo) */
  fromAnswers: Concern[];
  metrics: OnDeviceScan['zones'];
}

/**
 * Seuils [moyen, marqué] par mesure. Volontairement prudents (en cas de doute : niveau le plus bas).
 * À recalibrer avec le dermatologue conseil sur un panel de photos annotées.
 */
export const THRESHOLDS: Record<keyof ZoneMetrics, [number, number]> = {
  redness: [0.1, 0.22],
  blemish: [0.012, 0.03],
  spots: [0.015, 0.04],
  unevenness: [0.07, 0.12],
  texture: [0.03, 0.05],
  shine: [0.05, 0.12],
  lines: [0.035, 0.06],
};

const RANK: Record<Level, number> = { faible: 0, moyen: 1, marque: 2 };
const LEVELS: Level[] = ['faible', 'moyen', 'marque'];
const lvl = (v: number, k: keyof ZoneMetrics): Level => (v >= THRESHOLDS[k][1] ? 'marque' : v >= THRESHOLDS[k][0] ? 'moyen' : 'faible');
const max = (...l: Level[]) => LEVELS[Math.max(...l.map((x) => RANK[x]))];

export function scoreOf(concerns: Record<Concern, Level>): number {
  const penalty = Object.values(concerns).reduce((s, l) => s + (l === 'marque' ? 12 : l === 'moyen' ? 6 : 1), 0);
  return Math.max(35, 100 - penalty);
}

export function scoreScan(scan: OnDeviceScan, answers: { skinType?: string | null; declaredConcerns: string[] }): AnalysisResult {
  const declared = new Set(answers.declaredConcerns);
  const zones = {} as AnalysisResult['zones'];
  for (const z of ZONES) {
    const m = scan.zones[z];
    const r: Partial<Record<Concern, Level>> = {
      acne: lvl(m.blemish, 'blemish'),
      rougeurs: lvl(m.redness, 'redness'),
      taches: max(lvl(m.spots, 'spots'), lvl(m.unevenness, 'unevenness') === 'marque' ? 'moyen' : 'faible'),
      pores: max(lvl(m.texture, 'texture'), lvl(m.shine, 'shine') === 'marque' ? 'moyen' : 'faible'),
    };
    if (z === 'front') r.rides = lvl(m.lines, 'lines');
    zones[z] = r;
  }
  const worst = (c: Concern) => max(...ZONES.map((z) => zones[z][c] ?? 'faible'));
  const shineAvg = ZONES.reduce((s, z) => s + scan.zones[z].shine, 0) / ZONES.length;
  // La sécheresse ne se voit pas de façon fiable sur une photo : réponses + absence de brillance
  const dry: Level = answers.skinType === 'seche' ? (shineAvg < THRESHOLDS.shine[0] / 2 ? 'marque' : 'moyen') : declared.has('secheresse') ? 'moyen' : 'faible';
  for (const z of ZONES) zones[z].secheresse = z === 'joues' ? dry : dry === 'marque' ? 'moyen' : dry;

  const concerns = {} as Record<Concern, Level>;
  const fromAnswers: Concern[] = ['secheresse'];
  for (const c of CONCERNS) {
    if (c === 'secheresse') { concerns[c] = dry; continue; }
    let v = worst(c);
    // Une préoccupation déclarée mais peu visible sur la photo reste prise en compte (niveau « moyen » au plus)
    if (declared.has(c) && v === 'faible') { v = 'moyen'; fromAnswers.push(c); }
    concerns[c] = v;
  }
  return { engine: scan.engine, zones, concerns, score: scoreOf(concerns), fromAnswers, metrics: scan.zones };
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
export function summarize(r: Pick<AnalysisResult, 'zones' | 'concerns'>, lang = 'fr'): string[] {
  const L = LABELS[lang] ?? LABELS.fr;
  const Z = ZONE_LABELS[lang] ?? ZONE_LABELS.fr;
  const sorted = [...CONCERNS].sort((a, b) => RANK[r.concerns[b]] - RANK[r.concerns[a]]);
  const zoneOf = (c: Concern) => (Object.entries(r.zones).find(([, v]) => v[c] && RANK[v[c]!] === RANK[r.concerns[c]])?.[0] ?? 'front');
  const out: string[] = [];
  const top = sorted.filter((c) => r.concerns[c] !== 'faible').slice(0, 2);
  for (const c of top) {
    const lv = r.concerns[c];
    if (lang === 'en') out.push(`${lv === 'marque' ? 'Marked' : 'Moderate'} ${L[c]}, mostly on the ${Z[zoneOf(c)]}.`);
    else if (lang === 'ar') out.push(`${L[c]} ${lv === 'marque' ? 'واضحة' : 'متوسطة'}، خاصة على ${Z[zoneOf(c)]}.`);
    else {
      // Accord : sécheresse (f. sing.), pores (m. pl.), autres (f. pl.)
      const suffix = c === 'secheresse' ? 'e' : c === 'pores' ? 's' : 'es';
      const adj = (lv === 'marque' ? 'marqué' : 'modéré') + suffix;
      out.push(`${L[c].charAt(0).toUpperCase() + L[c].slice(1)} ${adj}, surtout sur ${Z[zoneOf(c)]}.`);
    }
  }
  if (!top.length) out.push(lang === 'en' ? 'Your skin looks balanced on this photo.' : lang === 'ar' ? 'تبدو بشرتك متوازنة في هذه الصورة.' : 'Votre peau paraît équilibrée sur cette photo.');
  const best = sorted[sorted.length - 1];
  if (lang === 'en') out.push(`Good news: ${L[best]} are barely visible.`);
  else if (lang === 'ar') out.push(`خبر جيد: ${L[best]} بالكاد تظهر.`);
  else out.push(`Bonne nouvelle : très peu de ${L[best]}.`);
  return out;
}
