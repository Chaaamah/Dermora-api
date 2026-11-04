// Relève des offres réelles sur des parapharmacies marocaines (API publique WooCommerce Store).
// Usage : node prisma/research/collect.mjs  → écrit prisma/research/candidates.json
import fs from 'node:fs';

const SITES = [
  { id: 'monpara', name: 'MonPara', base: 'https://monpara.ma' },
  { id: 'atelierpara', name: 'Atelier Para', base: 'https://atelierpara.ma' },
  { id: 'parachezvous', name: 'Para Chez Vous', base: 'https://parachezvous.ma' },
  { id: 'paramedic', name: 'Paramedic', base: 'https://paramedic.ma' },
];
const UA = 'Mozilla/5.0 (compatible; DermoraCatalog/1.0; catalogue research)';
const norm = (s) => ` ${s}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&#[0-9]+;|&[a-z]+;/g, ' ').replace(/[^a-z0-9+]+/g, ' ') + ' ';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = JSON.parse(fs.readFileSync(new URL('./targets.json', import.meta.url)));

async function search(site, q) {
  const url = `${site.base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=20`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

const out = {};
for (const t of targets) {
  out[t.key] = [];
  for (const site of SITES) {
    // Recherche principale, puis recherche plus courte (2 premiers mots) si rien
    let items = await search(site, t.q);
    if (!items.length) items = await search(site, t.q.split(' ').slice(0, 2).join(' '));
    for (const p of items) {
      const n = norm(p.name);
      if (!t.must.every((m) => n.includes(norm(m).trim()))) continue;
      if (t.not.some((m) => n.includes(norm(m)))) continue;
      const minor = p.prices?.currency_minor_unit ?? 2;
      const price = Number(p.prices?.price) / 10 ** minor;
      const regular = Number(p.prices?.regular_price) / 10 ** minor;
      out[t.key].push({
        site: site.id, merchant: site.name, name: p.name.replace(/&#8217;/g, "'").replace(/&amp;/g, '&'), url: p.permalink,
        price, regular, currency: p.prices?.currency_code, inStock: p.is_in_stock, image: p.images?.[0]?.src ?? null, sku: p.sku,
      });
    }
    await sleep(400);
  }
  const best = out[t.key].map((o) => `${o.site}:${o.price}${o.inStock ? '' : '(rupture)'} ${o.name}`).slice(0, 6);
  console.log(`\n■ ${t.key} — ${out[t.key].length} offre(s)\n  ${best.join('\n  ')}`);
}
fs.writeFileSync(new URL('./candidates.json', import.meta.url), JSON.stringify({ collectedAt: new Date().toISOString(), sites: SITES, offers: out }, null, 2));
