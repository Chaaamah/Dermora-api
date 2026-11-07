import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limitation du nombre de requêtes (anti force brute, anti abus).
 * Render est derrière Cloudflare : l'IP réelle est dans CF-Connecting-IP (posé par Cloudflare, non falsifiable
 * depuis l'extérieur). Sur les routes avec un e-mail (connexion, inscription, mot de passe oublié), le compteur
 * est par IP + e-mail : les utilisatrices qui partagent une IP d'opérateur mobile ne se bloquent pas entre elles.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const h = (req.headers ?? {}) as Record<string, string | undefined>;
    const forwarded = String(h['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = h['cf-connecting-ip'] ?? h['true-client-ip'] ?? forwarded[0] ?? req.ip ?? 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 120) : '';
    return email ? `${ip}|${email}` : String(ip);
  }
}

/** Limites par minute pour les routes sensibles */
export const LIMIT = {
  login: { default: { limit: 10, ttl: 60_000 } },
  register: { default: { limit: 5, ttl: 60_000 } },
  email: { default: { limit: 3, ttl: 60_000 } }, // envoi d'e-mails (mot de passe oublié, renvoi d'activation)
  code: { default: { limit: 10, ttl: 60_000 } }, // saisie d'un code ou d'un lien
  lookup: { default: { limit: 30, ttl: 60_000 } }, // appels à Open Beauty Facts
} as const;
