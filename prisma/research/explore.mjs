// Exploration libre : node prisma/research/explore.mjs "requête 1" "requête 2" …
const SITES = ['https://monpara.ma', 'https://atelierpara.ma', 'https://parachezvous.ma', 'https://paramedic.ma'];
const UA = 'Mozilla/5.0 (compatible; DermoraCatalog/1.0; catalogue research)';
for (const q of process.argv.slice(2)) {
  console.log(`\n=== ${q}`);
  for (const base of SITES) {
    try {
      const r = await fetch(`${base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=8`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      const a = r.ok ? await r.json() : [];
      for (const p of a) {
        const m = p.prices.currency_minor_unit;
        console.log(`  ${base.replace('https://', '').padEnd(16)} ${(Number(p.prices.price) / 10 ** m).toFixed(0).padStart(4)} ${p.is_in_stock ? ' ' : 'R'} ${p.name.replace(/&#8211;/g, '-').replace(/&#8217;|&rsquo;/g, "'").slice(0, 95)}`);
      }
      if (!r.ok) console.log(`  ${base} HTTP ${r.status}`);
    } catch (e) { console.log(`  ${base} ERR ${e.message}`); }
  }
}
