import type { Merchant, Offer } from '@prisma/client';

/** Masquage des prix après 30 jours sans mise à jour (risque « prix périmés »). */
export const FRESH_DAYS = 30;

export type OfferWithMerchant = Offer & { merchant: Merchant };

export function freshOffers(offers: OfferWithMerchant[]): OfferWithMerchant[] {
  const limit = Date.now() - FRESH_DAYS * 86_400_000;
  return offers
    .filter((o) => o.inStock && o.merchant.verified && o.updatedAt.getTime() >= limit)
    .sort((a, b) => a.priceMad - b.priceMad);
}

export function bestPrice(offers: OfferWithMerchant[]): number | null {
  const f = freshOffers(offers);
  return f.length ? f[0].priceMad : null;
}

export function monthlyCost(price: number, monthsSupply: number): number {
  return Math.round((price / Math.max(monthsSupply, 0.5)) * 10) / 10;
}
