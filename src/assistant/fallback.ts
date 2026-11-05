/**
 * Assistante de secours (sans IA) : utilisée si Claude est indisponible (clé absente, crédit épuisé, panne).
 * Répond dans la langue du message et s'appuie sur la routine réelle de la personne.
 */
export type FLang = 'fr' | 'en' | 'ar' | 'darija' | 'es';

/** Langue du message : écriture arabe, darija en lettres latines, anglais, espagnol, sinon langue du profil. */
export function detectLang(text: string, profile?: string | null): FLang {
  const t = ` ${text.toLowerCase()} `;
  // Écriture arabe (arabe ou darija) : réponse en arabe, dans la même écriture
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/\b(wach|chno|chnou|kifach|kifash|bghit|dyal|dial|3la|3lach|fin|daba|bzaf|mzyan|hboub|bach|smiti|safi|wakha|nta|nti)\b|\b\w*[3790]\w*[a-z]\w*\b/.test(t) && !/\b(the|what|how)\b/.test(t)) return 'darija';
  if (/\b(the|what|how|which|my|skin|should|can|routine for|order|please|hello|hi|thanks)\b/.test(t)) return 'en';
  if (/\b(qué|que|cómo|como|mi|piel|rutina|hola|gracias|por favor|cuál)\b/.test(t) && !/\b(je|tu|vous|ma|mon|est)\b/.test(t)) return 'es';
  if (/\b(je|tu|vous|ma|mon|mes|est|quel|quelle|comment|pourquoi|bonjour|merci|peau)\b/.test(t)) return 'fr';
  return profile === 'en' ? 'en' : profile === 'ar' ? 'ar' : 'fr';
}

type T = Record<FLang, string>;

const TOPICS: Array<{ k: RegExp; a: T }> = [
  {
    k: /(solaire|spf|soleil|chams|شمس|واقي|sun|sunscreen|protector solar)/,
    a: {
      fr: "La protection solaire est l'étape la plus importante : chaque matin, l'équivalent de deux doigts pour le visage et le cou, en dernière étape. Renouvelez toutes les 2 heures au soleil, même par temps nuageux.",
      en: 'Sunscreen is the most important step: every morning, two finger-lengths for face and neck, as the last step. Reapply every 2 hours in the sun, even when it is cloudy.',
      ar: 'الواقي الشمسي هو أهم خطوة: كل صباح، كمية بطول إصبعين للوجه والرقبة، في آخر الروتين. جدديه كل ساعتين تحت الشمس، حتى في الأيام الغائمة.',
      darija: "L'écran (protection solaire) howa l'étape l'mohimma : kol sbah, 9ad jouj sbo3at l'wejh o r9ba, f lekher. 3awdih kol 2 swaye3 ila kenti f chems, 7ta ila kan ghaym.",
      es: 'El protector solar es el paso más importante: cada mañana, el equivalente a dos dedos para rostro y cuello, como último paso. Reaplica cada 2 horas al sol, incluso si está nublado.',
    },
  },
  {
    k: /(bouton|acné|acne|hboub|حبوب|حب الشباب|imperfection|pimple|spot|granos)/,
    a: {
      fr: "Pour les imperfections : un nettoyant doux matin et soir, un hydratant non comédogène et la protection solaire. Ne percez pas les boutons et laissez 6 à 8 semaines au soin ciblé. Si l'acné est douloureuse ou laisse des cicatrices, consultez un dermatologue.",
      en: 'For blemishes: a gentle cleanser morning and evening, a non-comedogenic moisturiser and sunscreen. Do not pick spots and give your targeted treatment 6 to 8 weeks. If acne is painful or scarring, see a dermatologist.',
      ar: 'للحبوب: منظف لطيف صباحاً ومساءً، ومرطب لا يسد المسام، وواقٍ شمسي. لا تعصري الحبوب وامنحي العلاج الموجّه 6 إلى 8 أسابيع. إذا كانت مؤلمة أو تترك ندوباً، استشيري طبيب جلدية.',
      darija: "L'hboub : ghassoul (nettoyant) dou9 sbah o 3chiya, crème hydratante ma katsedch l'pores, o l'écran. Ma t3ssrich l'hboub o 3tih 6 tal 8 simanat. Ila kanou kay dorrou wela kay khelliw l'atar, chofi dermatologue.",
      es: 'Para las imperfecciones: un limpiador suave mañana y noche, una hidratante no comedogénica y protector solar. No revientes los granos y da 6 a 8 semanas al tratamiento. Si el acné duele o deja marcas, consulta a un dermatólogo.',
    },
  },
  {
    k: /(tache|taches|pigment|spots|بقع|كلف|nmach|manchas)/,
    a: {
      fr: "Contre les taches, la constance compte plus que la force : protection solaire chaque matin, puis un actif comme la niacinamide, l'acide azélaïque ou la vitamine C. Évitez le citron pur sur la peau : il peut provoquer brûlures et nouvelles taches.",
      en: 'For dark spots, consistency matters more than strength: sunscreen every morning, then an active such as niacinamide, azelaic acid or vitamin C. Avoid pure lemon on the skin: it can cause burns and new spots.',
      ar: 'للبقع، الانتظام أهم من القوة: واقٍ شمسي كل صباح، ثم مكوّن فعّال مثل النياسيناميد أو حمض الأزيليك أو فيتامين C. تجنبي الليمون الخالص على البشرة: قد يسبب حروقاً وبقعاً جديدة.',
      darija: "L'taches : l'mohim howa tkouni mnadma : l'écran kol sbah, o mn ba3d niacinamide wela acide azélaïque wela vitamine C. Ma t7ettich l'hamed (citron) 3la wejhek : y9der y7r9ek o ydir taches jdad.",
      es: 'Contra las manchas, la constancia importa más que la intensidad: protector solar cada mañana y luego un activo como niacinamida, ácido azelaico o vitamina C. Evita el limón puro en la piel: puede causar quemaduras y nuevas manchas.',
    },
  },
  {
    k: /(ghassoul|henné|henne|argan|rose|غاسول|حناء|أركان|ماء الورد|rituel|ritual)/,
    a: {
      fr: "Les rituels marocains sont précieux avec quelques précautions : ghassoul à ne pas laisser sécher, henné uniquement pur (jamais de henné noir), huile d'argan cosmétique plutôt qu'alimentaire, eau de rose sans alcool. Faites toujours un test sur une petite zone 48 h avant. Retrouvez-les pas à pas dans l'onglet Rituels.",
      en: 'Moroccan rituals are wonderful with a few precautions: do not let ghassoul dry, use only pure henna (never black henna), cosmetic rather than culinary argan oil, alcohol-free rose water. Always patch-test 48 h before. Find them step by step in the Rituals tab.',
      ar: 'الطقوس المغربية رائعة مع بعض الاحتياطات: لا تتركي الغاسول يجف، استعملي الحناء الخالصة فقط (لا للحناء السوداء)، وزيت الأركان التجميلي لا الغذائي، وماء الورد دون كحول. اختبري دائماً على منطقة صغيرة قبل 48 ساعة. تجدينها خطوة بخطوة في تبويب الطقوس.',
      darija: "Rituels dyal lmghrib zwinin b chi i7tiyatat : l'ghassoul ma tkhelliheh ynchef, l'7enna khassha tkoun 7arra (machi l'7enna l'k7la), zit l'argan dyal tjmil machi dyal lmakla, o ma l'ward bla alcool. Dima jerbi f blasa sghira 48 sa3a 9bel. Kaynin b tafsil f l'onglet Rituels.",
      es: 'Los rituales marroquíes son valiosos con algunas precauciones: no dejes secar el ghassoul, usa solo henna pura (nunca henna negra), aceite de argán cosmético y agua de rosas sin alcohol. Haz siempre una prueba 48 h antes. Están paso a paso en la pestaña Rituales.',
    },
  },
  {
    k: /(budget|cher|prix|ghali|flouss|ميزانية|غالي|ثمن|price|expensive|caro|precio)/,
    a: {
      fr: "Dans l'onglet Routine, « Changer de formule » vous propose trois routines : Essentielle (la moins chère), Équilibre et Premium. Chaque étape garde nettoyant, hydratant et protection solaire, et propose une alternative plus économique.",
      en: 'In the Routine tab, “Change plan” offers three routines: Essential (the most affordable), Balanced and Premium. Each one keeps cleanser, moisturiser and sunscreen, and every step offers a cheaper alternative.',
      ar: 'في تبويب الروتين، يقترح عليك زر «تغيير الصيغة» ثلاثة روتينات: أساسية (الأقل تكلفة)، ومتوازنة، وفاخرة. كلها تحتفظ بالمنظف والمرطب والواقي الشمسي، وكل خطوة تقترح بديلاً أرخص.',
      darija: "F l'onglet Routine, « Changer de formule » kay 9tre7 3lik 3 routines : Essentielle (rkhissa), Équilibre o Premium. Kollhom fihom nettoyant, crème o l'écran, o kol étape fiha produit rkhes.",
      es: 'En la pestaña Rutina, «Cambiar fórmula» te propone tres rutinas: Esencial (la más económica), Equilibrio y Premium. Todas mantienen limpiador, hidratante y protector solar, y cada paso ofrece una alternativa más barata.',
    },
  },
  {
    k: /(enceinte|grossesse|allaite|pregnan|hamla|7amla|حامل|الحمل|رضاعة|embaraz)/,
    a: {
      fr: "Pendant la grossesse ou l'allaitement, déclarez-le dans votre profil : Dermora exclut automatiquement les ingrédients déconseillés comme les rétinoïdes. Demandez aussi l'avis de votre médecin ou sage-femme avant tout nouveau soin.",
      en: 'During pregnancy or breastfeeding, declare it in your profile: Dermora automatically excludes ingredients to avoid, such as retinoids. Also ask your doctor or midwife before any new product.',
      ar: 'أثناء الحمل أو الرضاعة، صرّحي بذلك في ملفك: تستبعد ديرمورا تلقائياً المكونات غير المستحسنة مثل الريتينويدات. واستشيري طبيبك أو القابلة قبل أي منتج جديد.',
      darija: "Ila kenti 7amla wela katred3i, gouliha f profil dyalek : Dermora katsed l'produits li ma mzyaninch b7al rétinol. O sowli tbibek 9bel ay produit jdid.",
      es: 'Durante el embarazo o la lactancia, decláralo en tu perfil: Dermora excluye automáticamente los ingredientes desaconsejados como los retinoides. Consulta también a tu médico o matrona antes de cualquier producto nuevo.',
    },
  },
  {
    k: /(cheveux|chute|cuir|cheveu|cha3r|ch3ar|شعر|تساقط|hair|pelo|cabello)/,
    a: {
      fr: "Pour les cheveux : un shampooing adapté à votre cuir chevelu, un après-shampooing à chaque lavage sur les longueurs, et un masque ou un bain d'huile une fois par semaine. Une chute soudaine ou par plaques nécessite un avis médical.",
      en: 'For hair: a shampoo suited to your scalp, conditioner on the lengths at every wash, and a mask or oil bath once a week. Sudden or patchy hair loss needs medical advice.',
      ar: 'للشعر: شامبو يناسب فروة رأسك، وبلسم على الأطوال عند كل غسل، وقناع أو حمام زيت مرة في الأسبوع. التساقط المفاجئ أو على شكل بقع يستدعي استشارة طبية.',
      darija: "L'cha3r : shampooing mnaseb l'ras dyalek, après-shampooing f kol ghsil 3la ttoul, o masque wela 7mam zit mra f simana. Ila kan tay7 bzaf fjaa wela f blayes, chofi tbib.",
      es: 'Para el cabello: un champú adaptado a tu cuero cabelludo, acondicionador en los largos en cada lavado y una mascarilla o baño de aceite una vez por semana. Una caída repentina o en placas requiere consulta médica.',
    },
  },
];

const GREET: T = {
  fr: 'Bonjour ! Je suis l’assistante Dermora. Posez-moi une question sur votre routine, un produit, un rituel marocain ou votre budget.',
  en: 'Hello! I am the Dermora assistant. Ask me about your routine, a product, a Moroccan ritual or your budget.',
  ar: 'مرحباً! أنا مساعدة ديرمورا. اسأليني عن روتينك، أو منتج، أو طقس مغربي، أو ميزانيتك.',
  darija: 'Salam ! Ana l’assistante dyal Dermora. Sowlini 3la routine dyalek, chi produit, chi rituel mghribi wela l’budget.',
  es: '¡Hola! Soy la asistente de Dermora. Pregúntame sobre tu rutina, un producto, un ritual marroquí o tu presupuesto.',
};

const DEFAULTS: T[] = [
  {
    fr: "Je n'ai pas toutes les réponses en mode simplifié, mais je peux vous aider sur : l'ordre de votre routine, la protection solaire, les imperfections, les taches, les rituels marocains, le budget, la grossesse ou les cheveux. Pour tout signe inhabituel sur la peau, consultez un dermatologue.",
    en: 'In simplified mode I can help with: the order of your routine, sunscreen, blemishes, dark spots, Moroccan rituals, budget, pregnancy or hair. For any unusual sign on your skin, see a dermatologist.',
    ar: 'في الوضع المبسط يمكنني مساعدتك في: ترتيب روتينك، الواقي الشمسي، الحبوب، البقع، الطقوس المغربية، الميزانية، الحمل أو الشعر. لأي علامة غير معتادة على البشرة، استشيري طبيب جلدية.',
    darija: "F had l'mode, n9der n3awnek f : tartib dyal routine, l'écran, l'hboub, l'taches, rituels mghribiya, l'budget, l'7aml wela l'cha3r. Ila chefti chi 7aja ghriba f jeldek, chofi dermatologue.",
    es: 'En modo simplificado puedo ayudarte con: el orden de tu rutina, protector solar, imperfecciones, manchas, rituales marroquíes, presupuesto, embarazo o cabello. Ante cualquier signo inusual en la piel, consulta a un dermatólogo.',
  },
  {
    fr: "Pouvez-vous préciser votre question ? Par exemple : « Dans quel ordre appliquer mes soins ? », « Comment réduire les taches ? » ou « Puis-je utiliser du ghassoul sur le visage ? »",
    en: 'Could you be more specific? For example: “In what order should I apply my products?”, “How can I reduce dark spots?” or “Can I use ghassoul on my face?”',
    ar: 'هل يمكنك توضيح سؤالك؟ مثلاً: «بأي ترتيب أضع منتجاتي؟» أو «كيف أخفف البقع؟» أو «هل يمكنني استعمال الغاسول على الوجه؟»',
    darija: "Wach t9edri twed7i so2al dyalek ? Matalan : « b ach nbda f routine ? », « kifach n9ess l'taches ? » wela « wach n9der n7et l'ghassoul f wejhi ? »",
    es: '¿Puedes precisar tu pregunta? Por ejemplo: «¿En qué orden aplico mis productos?», «¿Cómo reducir las manchas?» o «¿Puedo usar ghassoul en la cara?»',
  },
];

const ORDER_INTRO: T = {
  fr: 'Voici l’ordre de votre routine :', en: 'Here is the order of your routine:', ar: 'إليك ترتيب روتينك:', darija: 'Hada tartib dyal routine dyalek :', es: 'Este es el orden de tu rutina:',
};
const MOMENT: Record<string, T> = {
  AM: { fr: 'Matin', en: 'Morning', ar: 'الصباح', darija: 'Sbah', es: 'Mañana' },
  PM: { fr: 'Soir', en: 'Evening', ar: 'المساء', darija: '3chiya', es: 'Noche' },
  HAIR: { fr: 'Cheveux', en: 'Hair', ar: 'الشعر', darija: "L'cha3r", es: 'Cabello' },
};
const ORDER_RULE: T = {
  fr: 'Règle simple : du plus léger au plus riche, et la protection solaire toujours en dernier le matin. Introduisez un seul nouveau produit à la fois.',
  en: 'Simple rule: from lightest to richest, and sunscreen always last in the morning. Introduce one new product at a time.',
  ar: 'قاعدة بسيطة: من الأخف إلى الأغنى، والواقي الشمسي دائماً في الأخير صباحاً. أدخلي منتجاً جديداً واحداً في كل مرة.',
  darija: "9a3ida sahla : mn l'khfif l'te9il, o l'écran dima f lekher f sbah. Dkhli produit jdid wa7ed f kol mra.",
  es: 'Regla sencilla: de lo más ligero a lo más rico, y el protector solar siempre al final por la mañana. Introduce un solo producto nuevo a la vez.',
};
const NO_ROUTINE: T = {
  fr: "L'ordre classique : nettoyant, sérum, hydratant, puis protection solaire le matin ; nettoyant, soin ciblé et hydratant le soir. Choisissez votre formule dans l'onglet Routine pour obtenir une routine personnalisée.",
  en: 'The classic order: cleanser, serum, moisturiser, then sunscreen in the morning; cleanser, targeted treatment and moisturiser in the evening. Choose your plan in the Routine tab to get a personalised routine.',
  ar: 'الترتيب الكلاسيكي: منظف، سيروم، مرطب، ثم واقٍ شمسي صباحاً؛ ومنظف، وعلاج موجّه، ومرطب مساءً. اختاري صيغتك في تبويب الروتين للحصول على روتين مخصص.',
  darija: "Tartib l3adi : nettoyant, sérum, crème, o l'écran f sbah ; nettoyant, soin ciblé o crème f l3chiya. Khtari formule dyalek f l'onglet Routine bach takhdi routine khassa bik.",
  es: 'El orden clásico: limpiador, sérum, hidratante y luego protector solar por la mañana; limpiador, tratamiento y hidratante por la noche. Elige tu fórmula en la pestaña Rutina para obtener una rutina personalizada.',
};

export interface FallbackRoutine { blocked?: boolean; steps: Array<{ moment: string; order: number; step: string; product?: { brand: string; name: string } | null }> }

/** Réponse de secours ; `seed` varie la formulation par défaut d'un message à l'autre. */
export function fallbackAnswer(text: string, lang: FLang, routine: FallbackRoutine | null, seed = 0): string {
  const t = text.toLowerCase();
  if (/(ordre|order|ترتيب|tartib|orden|routine|روتين|rutina)/.test(t)) {
    if (routine && !routine.blocked && routine.steps.length) {
      const lines: string[] = [ORDER_INTRO[lang]];
      for (const m of ['AM', 'PM', 'HAIR']) {
        const st = routine.steps.filter((s) => s.moment === m).sort((a, b) => a.order - b.order);
        if (st.length) lines.push(`${MOMENT[m][lang]} : ${st.map((s, i) => `${i + 1}. ${s.product ? `${s.product.brand} ${s.product.name}` : s.step}`).join(' → ')}`);
      }
      lines.push(ORDER_RULE[lang]);
      return lines.join('\n');
    }
    return NO_ROUTINE[lang];
  }
  const hit = TOPICS.find((x) => x.k.test(t));
  if (hit) return hit.a[lang];
  if (/^(\s*)(salam|slm|bonjour|bonsoir|hello|hi|hey|hola|مرحبا|السلام)/.test(t)) return GREET[lang];
  return DEFAULTS[seed % DEFAULTS.length][lang];
}
