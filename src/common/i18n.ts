/** Textes générés par le serveur (rappels, notifications), traduits selon la langue de l'utilisatrice. */
const T: Record<string, [en: string, ar: string]> = {
  "Nettoyant": ["Cleanser", "منظف"],
  "Sérum ciblé": ["Targeted serum", "سيروم موجّه"],
  "Hydratant": ["Moisturiser", "مرطب"],
  "Protection solaire SPF50": ["Sunscreen SPF50", "واقي شمسي SPF50"],
  "Soin ciblé": ["Targeted treatment", "علاج موجّه"],
  "Shampooing": ["Shampoo", "شامبو"],
  "Après-shampooing": ["Conditioner", "بلسم"],
  "Masque": ["Mask", "قناع"],
  "Huile / bain d'huile": ["Oil / oil bath", "زيت / حمام زيت"],
  "chaque jour": ["every day", "كل يوم"],
  "une noisette": ["a hazelnut-sized amount", "بحجم حبة بندق"],
  "3 gouttes": ["3 drops", "3 قطرات"],
  "un petit pois": ["a pea-sized amount", "بحجم حبة بازلاء"],
  "2 doigts (visage + cou)": ["2 finger lengths (face + neck)", "طول إصبعين (الوجه + الرقبة)"],
  "3 soirs par semaine au début": ["3 evenings a week at first", "3 أمسيات في الأسبوع في البداية"],
  "1 fois par semaine": ["once a week", "مرة في الأسبوع"],
  "à chaque lavage": ["at every wash", "عند كل غسل"],
  "selon le lavage": ["depending on washes", "حسب الغسل"],
  "Essentielle": ["Essential", "أساسية"],
  "Équilibre": ["Balanced", "متوازنة"],
  "Premium": ["Premium", "فاخرة"],
  "Sur mesure": ["Custom", "حسب الطلب"],
  "Routine du matin": ["Morning routine", "روتين الصباح"],
  "Routine du soir": ["Evening routine", "روتين المساء"],
  "Soin des cheveux": ["Hair care", "العناية بالشعر"],
  "étape": ["step", "الخطوة"],
  "Routine {name} activée": ["{name} routine activated", "تم تفعيل روتين {name}"],
  "Rappels de chaque étape à {am} le matin et {pm} le soir. Modifiables dans votre profil.": ["Reminders for each step at {am} in the morning and {pm} in the evening. You can change them in your profile.", "تذكيرات لكل خطوة على الساعة {am} صباحاً و{pm} مساءً. يمكنك تعديلها من ملفك الشخصي."],
  "Activez les rappels dans votre profil pour être guidée à chaque étape.": ["Turn on reminders in your profile to be guided at each step.", "فعّلي التذكيرات من ملفك الشخصي لمرافقتك في كل خطوة."],
};

export function trs(fr: string, lang?: string | null, vars?: Record<string, string | number>): string {
  let out = lang === 'en' ? T[fr]?.[0] ?? fr : lang === 'ar' ? T[fr]?.[1] ?? fr : fr;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split('{' + k + '}').join(String(v));
  return out;
}

/** Adresse publique du site, tolérante aux erreurs de saisie (<https://…>, guillemets, / final). */
export const publicWebUrl = () => (process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100').trim().replace(/^[<"'\s]+|[>"'\s]+$/g, '').replace(/\/+$/, '');
