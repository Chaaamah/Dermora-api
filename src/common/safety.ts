/**
 * RG-02 — signes à surveiller : une réponse à risque bloque la routine
 * et oriente vers un médecin.
 */
export interface SafetyFlags {
  moleChanging?: boolean;
  lesionNotHealing?: boolean;
  painfulRash?: boolean;
  suddenHairLoss?: boolean;
}

export function safetyAlert(skin?: SafetyFlags | null, hair?: SafetyFlags | null): string | null {
  if (skin?.moleChanging) return 'Un grain de beauté qui change (taille, couleur, forme) doit être examiné par un médecin.';
  if (skin?.lesionNotHealing) return 'Une lésion qui saigne ou ne guérit pas doit être examinée par un médecin.';
  if (skin?.painfulRash) return 'Une éruption douloureuse nécessite un avis médical.';
  if (hair?.suddenHairLoss) return 'Une chute de cheveux soudaine ou importante nécessite un avis médical.';
  return null;
}

// Mots-clés à risque pour les messages libres (fr / darija / ar / en)
const RED_FLAGS = [
  'grain de beauté', 'grain de beaute', 'naevus', 'mélanome', 'melanome', 'saigne', 'saignement', 'ne guérit pas', 'ne guerit pas',
  'plaie ouverte', 'brûlure', 'brulure', 'gonfle', 'gonflement', 'difficulté à respirer', 'difficulte a respirer', 'fièvre', 'fievre',
  'pus', 'chute brutale', 'plaques sans cheveux', 'douleur intense',
  'changing mole', 'bleeding', 'not healing', 'swelling', 'fever', "can't breathe",
  'شامة', 'نزيف', 'حمى', 'تورم', 'chama kat kber', 'kaysil dem', 'makatbrach',
];

export function messageHasRedFlag(text: string): boolean {
  const t = text.toLowerCase();
  return RED_FLAGS.some((k) => t.includes(k));
}

export const MEDICAL_REFERRAL: Record<string, string> = {
  fr: "Ce que vous décrivez peut nécessiter un examen médical. Dermora fait une analyse cosmétique et ne peut pas poser de diagnostic : je vous conseille de consulter rapidement un dermatologue ou un médecin. En cas d'urgence (difficulté à respirer, gonflement du visage), appelez le 141 ou le 15.",
  ar: 'ما تصفينه قد يحتاج إلى فحص طبي. ديرمورا تقدم تحليلاً تجميلياً فقط ولا تضع تشخيصاً طبياً: ننصحك باستشارة طبيب جلدية في أقرب وقت. في حالة الطوارئ اتصلي بالرقم 141 أو 15.',
  en: 'What you describe may need a medical examination. Dermora provides cosmetic analysis only and cannot diagnose: please see a dermatologist or doctor soon. In an emergency (difficulty breathing, facial swelling), call 141 or 15.',
};
