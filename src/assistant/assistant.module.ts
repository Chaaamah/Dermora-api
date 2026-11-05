import { Body, Controller, Delete, Get, Injectable, Logger, Module, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../common/common.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, parse, z } from '../common/auth';
import { MEDICAL_REFERRAL, messageHasRedFlag, safetyAlert } from '../common/safety';
import { RoutineEngine } from '../routines/engine.service';
import { RoutinesModule } from '../routines/routines.module';
import { detectLang, fallbackAnswer } from './fallback';

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
7. LANGUE : réponds TOUJOURS dans la langue et l'écriture du DERNIER message de la personne, quelle qu'elle soit (français, arabe, darija en lettres arabes ou latines — y compris avec chiffres 3, 7, 9 —, anglais, espagnol, amazighe, etc.), même si son profil indique une autre langue. Ton chaleureux, élégant et concis : 2 à 6 phrases ou une courte liste. Pas de titres Markdown.`;


@Injectable()
export class AssistantService {
  private log = new Logger('Assistant');
  private client: Anthropic | null = null;

  constructor(private prisma: PrismaService, private engine: RoutineEngine) {
    try {
      this.client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic({ timeout: 45_000, maxRetries: 1 }) : null;
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

  /** Réponse de secours dans la langue du message, appuyée sur la routine réelle. */
  private async fallback(userId: string, text: string, profileLang: string): Promise<string> {
    const routine = await this.engine.current(userId).catch(() => null);
    const seed = await this.prisma.message.count({ where: { patientId: userId, channel: 'AI', senderRole: 'ASSISTANT' } });
    return fallbackAnswer(text, detectLang(text, profileLang), routine, seed);
  }

  /** Historique de conversation (20 derniers messages), rôles alternés, commençant par la personne. */
  private async history(userId: string) {
    const history = await this.prisma.message.findMany({ where: { patientId: userId, channel: 'AI' }, orderBy: { createdAt: 'desc' }, take: 20 });
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of history.reverse()) {
      const role = m.senderRole === 'PATIENT' ? 'user' : 'assistant';
      const last = messages[messages.length - 1];
      if (last && last.role === role) last.content = `${last.content}\n\n${m.content}`;
      else messages.push({ role, content: m.content });
    }
    while (messages.length && messages[0].role !== 'user') messages.shift();
    return messages;
  }

  /** Claude (Anthropic). Renvoie null si indisponible (pas de clé, crédit épuisé, refus, panne). */
  private async askClaude(userId: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string | null> {
    if (!this.client) return null;
    try {
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
      if (res.stop_reason === 'refusal') return null;
      return res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim() || null;
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) this.log.warn('Clé Anthropic invalide.');
      else if (e instanceof Anthropic.RateLimitError) this.log.warn('Limite de débit Anthropic atteinte.');
      else if (e instanceof Anthropic.APIError && /credit balance/i.test(e.message)) this.log.error('Crédit Anthropic épuisé : ajoutez du crédit sur console.anthropic.com > Plans & Billing.');
      else if (e instanceof Anthropic.APIError) this.log.error(`Erreur API Claude ${e.status}: ${e.message}`);
      else this.log.error(`Claude indisponible : ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Fournisseur compatible OpenAI (offre gratuite : Groq, Google Gemini…) :
   * AI_API_KEY, AI_BASE_URL (défaut Groq), AI_MODEL. Renvoie null si non configuré ou en échec.
   */
  private async askOpenAICompatible(userId: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string | null> {
    const key = process.env.AI_API_KEY?.trim();
    if (!key) return null;
    const base = (process.env.AI_BASE_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
    const model = process.env.AI_MODEL?.trim() || 'llama-3.3-70b-versatile';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.4, max_tokens: 900,
          messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n\n${await this.context(userId)}` }, ...messages],
        }),
      });
      if (!res.ok) { this.log.error(`Fournisseur IA ${res.status} : ${(await res.text()).slice(0, 300)}`); return null; }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
      this.log.error(`Fournisseur IA indisponible : ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async reply(userId: string, content: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { skinProfile: true, hairProfile: true } });
    await this.prisma.message.create({ data: { patientId: userId, channel: 'AI', senderRole: 'PATIENT', senderId: userId, content } });

    let answer: string | null = null;
    let mode: 'safety' | 'claude' | 'ai' | 'fallback';
    if (messageHasRedFlag(content) || safetyAlert(user.skinProfile, user.hairProfile)) {
      answer = MEDICAL_REFERRAL[user.lang] ?? MEDICAL_REFERRAL.fr;
      mode = 'safety';
    } else {
      const messages = await this.history(userId);
      // 1. Claude  2. fournisseur gratuit compatible OpenAI  3. assistante de secours (sans IA)
      answer = await this.askClaude(userId, messages);
      mode = 'claude';
      if (!answer) { answer = await this.askOpenAICompatible(userId, messages); mode = 'ai'; }
      if (!answer) { answer = await this.fallback(userId, content, user.lang); mode = 'fallback'; }
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
