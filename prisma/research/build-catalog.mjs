// Construit prisma/catalog.json à partir des fiches produits (specs.mjs) et des offres RÉELLES
// relevées sur les parapharmacies marocaines (API publique WooCommerce Store).
// Usage : node prisma/research/build-catalog.mjs
import fs from 'node:fs';
import { SPECS } from './specs.mjs';

export const SITES = [
  { id: 'monpara', name: 'MonPara', base: 'https://monpara.ma', city: 'Livraison au Maroc' },
  { id: 'atelierpara', name: 'Atelier Para', base: 'https://atelierpara.ma', city: 'Casablanca · livraison au Maroc' },
  { id: 'parachezvous', name: 'Para Chez Vous', base: 'https://parachezvous.ma', city: 'Casablanca · livraison au Maroc' },
  { id: 'paramedic', name: 'Paramedic', base: 'https://paramedic.ma', city: 'Rabat · livraison au Maroc' },
];
const UA = 'Mozilla/5.0 (compatible; DermoraCatalog/1.0)';
const norm = (s) => ` ${s} `.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&#[0-9]+;|&[a-z]+;/g, ' ').replace(/[^a-z0-9+]+/g, ' ');
const clean = (s) => s.replace(/&#8211;/g, '–').replace(/&#8217;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD = ['pack', 'black friday', 'gift', 'coffret', 'offert', 'trousse', 'mini '];

async function search(site, q, attempt = 0) {
  try {
    const r = await fetch(`${site.base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=100`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
    if (r.status === 429 || r.status >= 500) throw new Error(String(r.status));
    return r.ok ? await r.json() : [];
  } catch {
    if (attempt < 2) { await sleep(5000 * (attempt + 1)); return search(site, q, attempt + 1); }
    return [];
  }
}

const has = (n, term) => {
  const t = norm(term).trim();
  if (/^\d+$/.test(t)) return new RegExp(` ${t} ?(ml|g|gr) `).test(n);
  return n.includes(` ${t} `) || (t.length > 4 && n.includes(` ${t}`));
};
const matches = (spec, name) => {
  const n = norm(name).replace(/(\d+)(ml|g|gr) /g, '$1 $2 ');
  return spec.must.every((m) => has(n, m)) && ![...spec.not, ...BAD].some((m) => m && has(n, m));
};

const args = process.argv.slice(2);
const origin = args.find((a) => a.startsWith('--origin='))?.slice(9);
const only = args.filter((a) => !a.startsWith('--'));
const out = [];
for (const spec of SPECS.filter((x) => (!only.length || only.includes(x.key)) && (!origin || x.origin === origin))) {
  const words = spec.must.filter((m) => !/^\d+$/.test(m));
  // Ces sites cherchent la phrase exacte : on interroge un seul mot (le plus distinctif), puis la marque.
  const single = words.flatMap((w) => w.split(' ')).filter((w) => w.length > 2);
  const distinctive = [...single].sort((x, y) => y.length - x.length)[0];
  const queries = [...new Set([distinctive, single[0]])];
  const offers = [];
  for (const site of SITES) {
    let found = [];
    for (const q of queries) {
      found = (await search(site, q)).filter((p) => matches(spec, p.name));
      await sleep(1200);
      if (found.length) break;
    }
    if (!found.length) continue;
    // Meilleure offre du site : en stock d'abord, puis la moins chère
    found.sort((a, b) => Number(b.is_in_stock) - Number(a.is_in_stock) || Number(a.prices.price) - Number(b.prices.price));
    const p = found[0];
    const minor = p.prices.currency_minor_unit ?? 2;
    offers.push({
      site: site.id, externalId: p.id, title: clean(p.name), url: p.permalink,
      priceMad: Math.round((Number(p.prices.price) / 10 ** minor) * 100) / 100,
      regularMad: Math.round((Number(p.prices.regular_price) / 10 ** minor) * 100) / 100,
      currency: p.prices.currency_code, inStock: !!p.is_in_stock, image: p.images?.[0]?.src ?? null,
    });
  }
  const image = offers.find((o) => o.image && o.inStock)?.image ?? offers.find((o) => o.image)?.image ?? null;
  out.push({ ...spec, image, offers });
  console.log(`${offers.length ? '✓' : '✗'} ${spec.key.padEnd(44)} ${offers.map((o) => `${o.site}:${o.priceMad}${o.inStock ? '' : 'R'}`).join('  ')}${offers.length ? `\n    ↳ ${offers[0].title}` : ''}`);
}
let products = out;
const target = new URL('../catalog.json', import.meta.url);
if ((only.length || origin) && fs.existsSync(target)) {
  const prev = JSON.parse(fs.readFileSync(target, 'utf8'));
  products = prev.products.map((p) => out.find((o) => o.key === p.key) ?? p);
  for (const o of out) if (!products.some((p) => p.key === o.key)) products.push(o);
}
fs.writeFileSync(target, JSON.stringify({ collectedAt: new Date().toISOString(), sites: SITES, products }, null, 2));
console.log(`\n${out.filter((p) => p.offers.length).length}/${out.length} produits avec au moins une offre réelle.`);
