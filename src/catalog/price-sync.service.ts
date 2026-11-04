import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/common.module';

const UA = 'Mozilla/5.0 (compatible; DermoraPriceSync/1.0; +https://dermora.ma)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StoreProduct {
  id: number;
  permalink: string;
  is_in_stock: boolean;
  prices: { price: string; regular_price: string; currency_minor_unit: number };
  images?: Array<{ src: string }>;
}

/**
 * Relevé automatique des prix chez les marchands (API publique WooCommerce Store).
 * Lancé au démarrage puis toutes les PRICE_SYNC_HOURS heures (24 par défaut, 0 = désactivé).
 * Les offres non mises à jour depuis 30 jours sont masquées automatiquement (FRESH_DAYS).
 */
@Injectable()
export class PriceSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger('PriceSync');
  private timer?: NodeJS.Timeout;
  private running = false;
  lastRun: { at: string; updated: number; failed: number; outOfStock: number } | null = null;

  constructor(private prisma: PrismaService) {}

  onApplicationBootstrap() {
    const hours = Number(process.env.PRICE_SYNC_HOURS ?? 24);
    if (!hours) return;
    setTimeout(() => this.refreshAll().catch(() => undefined), 60_000);
    this.timer = setInterval(() => this.refreshAll().catch(() => undefined), hours * 3_600_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refreshAll() {
    if (this.running) return this.lastRun;
    this.running = true;
    let updated = 0, failed = 0, outOfStock = 0;
    try {
      const offers = await this.prisma.offer.findMany({
        where: { externalId: { not: null }, merchant: { platform: 'woocommerce', apiBase: { not: null } } },
        include: { merchant: true, product: { select: { id: true, imageUrl: true } } },
      });
      for (const o of offers) {
        try {
          const r = await fetch(`${o.merchant.apiBase}/wp-json/wc/store/v1/products/${o.externalId}`, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: AbortSignal.timeout(20_000),
          });
          if (r.status === 404) {
            await this.prisma.offer.update({ where: { id: o.id }, data: { inStock: false, updatedAt: new Date() } });
            outOfStock++;
          } else if (r.ok) {
            const p = (await r.json()) as StoreProduct;
            const minor = p.prices.currency_minor_unit ?? 2;
            const price = Number(p.prices.price) / 10 ** minor;
            const regular = Number(p.prices.regular_price) / 10 ** minor;
            if (price > 0) {
              await this.prisma.offer.update({
                where: { id: o.id },
                data: { priceMad: Math.round(price * 100) / 100, regularMad: regular ? Math.round(regular * 100) / 100 : null, inStock: p.is_in_stock, url: p.permalink || o.url, updatedAt: new Date() },
              });
              if (!o.product.imageUrl && p.images?.[0]?.src) {
                await this.prisma.product.update({ where: { id: o.product.id }, data: { imageUrl: p.images[0].src, imageSource: o.merchant.name } });
              }
              if (!p.is_in_stock) outOfStock++;
              updated++;
            }
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        await sleep(1200); // relevé poli : une requête par seconde environ
      }
      this.lastRun = { at: new Date().toISOString(), updated, failed, outOfStock };
      this.log.log(`Prix mis à jour : ${updated} · ruptures : ${outOfStock} · échecs : ${failed}`);
      return this.lastRun;
    } finally {
      this.running = false;
    }
  }
}
