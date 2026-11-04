import { Body, Controller, Delete, Get, Injectable, Logger, Module, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, parse, z } from '../common/auth';
import { MEDICAL_REFERRAL, messageHasRedFlag, safetyAlert } from '../common/safety';
import { RoutineEngine } from '../routines/engine.service';
import { RoutinesModule } from '../routines/routines.module';

const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-5-5';

// Prompt stable (mis en cache) — le contexte de la patiente vient dans un bloc séparé, après.
const SYSTEM_PROMPT = `Tu es « Dermora », l'assistante beauté de l'application Dermora (Aevora, Maroc) — slogan « Care Beyond Beauty ».
Tu accompagnes des utilisatrices et utilisateurs qui ne sont pas (encore) suivis par un dermatologue.

Ton rôle :
- Expliquer leur routine de soins peau et cheveux, l'ordre d'application, les quantités, la patience nécessaire (6 à 8 semaines).
- Répondre aux questions cosmétiques : ingrédients, textures, rituels marocains (ghassoul, henné, huile d'argan, eau de rose) avec leurs précautions.
- Aider à rester dans le budget et à reconnaître les contrefaçons.

Règles impératives :
1. Tu fais du conseil cosmétique, jamais de diagnostic médical ni de prescription de médicament. Pas de promesse de guérison.
2. Si la personne décrit un signe à surveiller (grain de beauté qui change, lésion qui saigne ou ne guérit pas, éruption douloureuse, chute de cheveux soudaine, gonflement, fièvre, réaction allergique forte), tu ne proposes pas de routine : tu l'orientes vers un dermatologue ou un médecin, et vers le 141 / 15 en cas d'urgence. Tu peux suggérer l'onglet « Trouver un dermatologue » de l'app.
3. Tu ne recommandes que des produits présents dans le catalogue Dermora fourni dans le contexte. Pour changer un produit de la routine, invite à utiliser le bouton « Remplacer » de l'étape. Tu ne choisis jamais un produit hors des règles validées.
4. Grossesse ou allaitement déclarés : jamais de rétinoïdes (rétinol, rétinal), ni d'acide salicylique à forte dose ; rappelle de demander l'avis d'un professionnel de santé.
5. Un seul nouveau produit à la fois, test sur une petite zone 48 h avant. Protection solaire chaque matin.
6. Rituels : pas de citron pur sur la peau ; henné noir à éviter (PPD) ; huile d'argan cosmétique et non alimentaire.
7. Réponds dans la langue de la personne (français, arabe, darija en lettres latines ou arabes, anglais). Ton chaleureux, élégant et concis : 2 à 6 phrases ou une courte liste. Pas de titres Markdown.`;

const FALLBACK: Array<{ k: string[]; fr: string }> = [
  { k: ['solaire', 'spf', 'soleil', 'chams', 'sun'], fr: "La protection solaire est l'étape la plus importante : chaque matin, l'équivalent de deux doigts pour le visage et le cou, en dernière étape. Renouvelez toutes les 2 heures si vous êtes au soleil, même par temps nuageux." },
  { k: ['bouton', 'acné', 'acne', 'hboub', 'imperfection'], fr: "Pour les imperfections : un nettoyant doux matin et soir, un hydratant non comédogène et la protection solaire. Ne percez pas les boutons, et laissez 6 à 8 semaines au soin ciblé de votre routine. Si l'acné est douloureuse ou laisse des cicatrices, consultez un dermatologue." },
  { k: ['tache', 'taches', 'pigment', 'spots'], fr: "Contre les taches, la constance compte plus que la force : protection solaire chaque matin, puis un actif comme la niacinamide, l'acide azélaïque ou la vitamine C. Évitez le citron pur sur la peau : il peut provoquer brûlures et nouvelles taches." },
  { k: ['ghassoul', 'henné', 'henne', 'argan', 'rose'], fr: "Les rituels marocains sont précieux avec quelques précautions : ghassoul à ne pas laisser sécher, henné uniquement pur (jamais de henné noir), huile d'argan cosmétique plutôt qu'alimentaire, eau de rose sans alcool. Faites toujours un test sur une petite zone 48 h avant." },
  { k: ['budget', 'cher', 'prix', 'ghali', 'flouss'], fr: "Vous pouvez ajuster le curseur de budget dans l'onglet Routine : Dermora choisit automatiquement des produits moins chers, en gardant toujours nettoyant, hydratant et protection solaire. Chaque étape propose aussi une alternative plus économique." },
  { k: ['enceinte', 'grossesse', 'allaite', 'pregnan', 'hamla'], fr: "Pendant la grossesse ou l'allaitement, déclarez-le dans votre profil : Dermora exclut automatiquement les ingrédients déconseillés comme les rétinoïdes. Demandez aussi l'avis de votre médecin ou sage-femme avant tout nouveau soin." },
  { k: ['cheveux', 'chute', 'cuir', 'cheveu', 'cha3r', 'hair'], fr: "Pour les cheveux : un shampooing adapté à votre cuir chevelu, un après-shampooing à chaque lavage sur les longueurs, et un masque ou bain d'huile d'argan une fois par semaine. Une chute soudaine ou par plaques nécessite un avis médical." },
];

@Injectable()
export class AssistantService {
  private log = new Logger('Assistant');
  private client: Anthropic | null = null;

  constructor(private prisma: PrismaService, private engine: RoutineEngine) {
    try {
      this.client = new Anthropic();
    } catch {
      this.client = null; // pas d'identifiants : assistant de secours
    }
  }

  private async context(userId: string): Promise<string> {
    const [user, routine, catalog] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { skinProfile: true, hairProfile: true, scans: { orderBy: { createdAt: 'desc' }, take: 1 }, notes: { orderBy: { createdAt: 'desc' }, take: 3 } } }),
      this.engine.current(userId),
      this.prisma.product.findMany({ where: { status: 'ACTIVE' }, select: { brand: true, name: true, category: true, domain: true } }),
    ]);
    const s = user.skinProfile;
    const h = user.hairProfile;
    const lines = [
      `Prénom : ${user.firstName ?? 'non renseigné'} · Ville : ${user.city ?? '—'} · Langue préférée : ${user.lang}`,
      s ? `Peau : ${s.skinType}${s.sensitive ? ', sensible' : ''}, phototype ${s.phototype}, préoccupations : ${s.concerns.join(', ') || 'aucune'}${s.pregnant ? ', ENCEINTE' : ''}${s.breastfeeding ? ', ALLAITE' : ''}${s.allergies.length ? `, allergies : ${s.allergies.join(', ')}` : ''}` : 'Questionnaire peau non rempli.',
      h ? `Cheveux : ${h.curlType}, porosité ${h.porosity}, cuir chevelu ${h.scalp}, chute ${h.hairLoss}${h.colored ? ', colorés' : ''}` : '',
      user.scans[0] ? `Dernière analyse cosmétique : ${user.scans[0].summary.join(' ')}` : '',
      routine && !routine.blocked
        ? `Routine actuelle (budget ${routine.budgetMad} MAD, coût ${routine.totalMad} MAD/mois) : ${routine.steps.map((st) => `[${st.moment}] ${st.step} → ${st.product ? `${st.product.brand} ${st.product.name}` : '—'} (semaine ${st.introWeek})`).join(' ; ')}`
        : routine?.blocked ? `ROUTINE BLOQUÉE : ${routine.blockReason}` : 'Pas encore de routine générée.',
      user.notes.length ? `Journal de peau récent : ${user.notes.map((n) => `${n.kind}: ${n.text}`).join(' | ')}` : '',
      `Catalogue disponible au Maroc : ${catalog.map((p) => `${p.brand} ${p.name} (${p.category})`).join(' ; ')}`,
    ];
    return `Contexte de la personne (données confidentielles, à utiliser uniquement pour personnaliser la réponse) :\n${lines.filter(Boolean).join('\n')}`;
  }

  private fallback(text: string, lang: string): string {
    const t = text.toLowerCase();
    const hit = FALLBACK.find((f) => f.k.some((k) => t.includes(k)));
    const base = hit?.fr ?? "Je suis là pour vous aider avec votre routine, vos produits et les rituels de soin. Posez-moi une question précise (par exemple : « dans quel ordre appliquer mes soins ? ») — et pour tout signe inhabituel sur la peau, consultez un dermatologue.";
    if (lang === 'en') return `${base}\n\n(The full AI assistant is not configured yet — this is a standard answer.)`;
    return base;
  }

  async reply(userId: string, content: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { skinProfile: true, hairProfile: true } });
    await this.prisma.message.create({ data: { patientId: userId, channel: 'AI', senderRole: 'PATIENT', senderId: userId, content } });

    let answer: string;
    let mode: 'safety' | 'claude' | 'fallback';
    if (messageHasRedFlag(content) || safetyAlert(user.skinProfile, user.hairProfile)) {
      answer = MEDICAL_REFERRAL[user.lang] ?? MEDICAL_REFERRAL.fr;
      mode = 'safety';
    } else if (this.client) {
      try {
        const history = await this.prisma.message.findMany({ where: { patientId: userId, channel: 'AI' }, orderBy: { createdAt: 'desc' }, take: 20 });
        const messages: Anthropic.Beta.BetaMessageParam[] = [];
        for (const m of history.reverse()) {
          const role = m.senderRole === 'PATIENT' ? 'user' : 'assistant';
          const last = messages[messages.length - 1];
          if (last && last.role === role) last.content = `${last.content as string}\n\n${m.content}`;
          else messages.push({ role, content: m.content });
        }
        while (messages.length && messages[0].role !== 'user') messages.shift();

        const params = {
          model: MODEL,
          max_tokens: 16000,
          system: [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: await this.context(userId) },
          ],
          messages,
          output_config: { effort: 'low' },
          // Refus éventuel d'un classifieur : relance automatique sur le modèle de repli recommandé
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
        const res = await this.client.beta.messages.create(params);
        if (res.stop_reason === 'refusal') {
          answer = this.fallback(content, user.lang);
          mode = 'fallback';
        } else {
          answer = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim() || this.fallback(content, user.lang);
          mode = 'claude';
        }
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) this.log.warn('Identifiants Anthropic absents ou invalides — assistant de secours.');
        else if (e instanceof Anthropic.RateLimitError) this.log.warn('Limite de débit atteinte — assistant de secours.');
        else if (e instanceof Anthropic.APIError) this.log.error(`Erreur API Claude ${e.status}: ${e.message}`);
        else this.log.error(`Assistant indisponible: ${(e as Error).message}`);
        answer = this.fallback(content, user.lang);
        mode = 'fallback';
      }
    } else {
      answer = this.fallback(content, user.lang);
      mode = 'fallback';
    }

    const msg = await this.prisma.message.create({ data: { patientId: userId, channel: 'AI', senderRole: 'ASSISTANT', content: answer } });
    return { message: msg, mode };
  }
}

@ApiTags('Assistant IA')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles('CLIENT')
@Controller('assistant')
export class AssistantController {
  constructor(private prisma: PrismaService, private svc: AssistantService) {}

  @Get('messages')
  list(@CurrentUser() u: AuthUser) {
    return this.prisma.message.findMany({ where: { patientId: u.id, channel: 'AI' }, orderBy: { createdAt: 'asc' } });
  }

  @Post('messages')
  send(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ content: z.string().trim().min(1).max(2000) }), body);
    return this.svc.reply(u.id, b.content);
  }

  @Delete('messages')
  async clear(@CurrentUser() u: AuthUser) {
    await this.prisma.message.deleteMany({ where: { patientId: u.id, channel: 'AI' } });
    return { cleared: true };
  }
}

@Module({ imports: [RoutinesModule], controllers: [AssistantController], providers: [AssistantService] })
export class AssistantModule {}
