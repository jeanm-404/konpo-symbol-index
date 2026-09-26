#!/usr/bin/env node
// Symbol Shelter share layer: per-mark OG images, crawler stubs, RSS/JSON feeds.
// Run after any catalogue change:  node scripts/build-meta.mjs
// Also keeps the mark count in index.html's share tags in step with the catalogue.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://symbols.konpo.co';
const src = fs.readFileSync(path.join(ROOT, 'symbol-index.html'), 'utf8');

// ---- data ------------------------------------------------------------------
const sMatch = src.match(/const S = (\[[\s\S]*?\n\]);/);
if (!sMatch) throw new Error('S array not found');
const S = JSON.parse(sMatch[1]);
const KONPO_MARK = src.match(/const KONPO_MARK = '([^']+)'/)[1];

// intake-dates ledger: new ids get stamped on first run and keep that date
const datesPath = path.join(ROOT, 'meta-dates.json');
const dates = fs.existsSync(datesPath) ? JSON.parse(fs.readFileSync(datesPath, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const DEFAULTS = { '2026-07-21': /^SYM-0(0|1|2|3|4|5|6|7|8[0-6])/ }; // originals
for (const s of S) {
  if (!dates[s.id]) {
    dates[s.id] = ['SYM-089', 'SYM-090', 'SYM-093', 'SYM-094', 'SYM-095', 'SYM-096'].includes(s.id)
      ? '2026-07-22'
      : (Object.entries(DEFAULTS).find(([, re]) => re.test(s.id))?.[0] || today);
  }
}
fs.writeFileSync(datesPath, JSON.stringify(dates, null, 2));

// ---- helpers ---------------------------------------------------------------
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = id => id.toLowerCase();
fs.mkdirSync(path.join(ROOT, 'og'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 's'), { recursive: true });

const MARK_CSS = `
  .mark path, .mark circle, .mark rect, .mark ellipse, .mark line { fill: #fff; stroke: none; }
  .mark .stroked { fill: none; stroke: #fff; stroke-width: 2; }`;

function statusLine(s) {
  if (s.status === 'Adopted') {
    return { text: `ADOPTED${s.adopterDate ? ' · ' + s.adopterDate : ''}`, color: '#4ade80' };
  }
  const reason = s.reason ? ' · ' + s.reason.toUpperCase() : '';
  return { text: `REJECTED${reason}`, color: '#f87171' };
}

// The share card is the mark alone, centered and large on the tile color: no text,
// so it reads at any size and survives any crop
function ogSvg(s) {
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <style>${MARK_CSS}</style>
  <rect width="1200" height="630" fill="#141414"/>
  <svg x="285" y="0" width="630" height="630" viewBox="10 10 180 180"><g class="mark">${s.mark}</g></svg>
</svg>`;
}

// the home card: the Konpo mark alone, in the same family
const konpoK = 119 / 61.1;
const rootSvg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#141414"/>
  <g transform="translate(${600 - 30.55 * konpoK} ${315 - 30.54 * konpoK}) scale(${konpoK})" fill="#ad9cff"><path d="${KONPO_MARK.match(/d="([^"]+)"/)[1]}"/></g>
</svg>`;

function stubHtml(s) {
  const url = `${SITE}/s/${slug(s.id)}`;
  const img = `${SITE}/og/${slug(s.id)}.png`;
  const st = statusLine(s);
  const desc = `${st.text.charAt(0) + st.text.slice(1).toLowerCase()}. ${s.blurb}`;
  const name = `${s.name} (${s.id})`, alt = `${s.name}, ${s.id}: ${st.text.charAt(0) + st.text.slice(1).toLowerCase()}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(name)} | Symbol Shelter</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#000000">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="${esc(name)} | Symbol Shelter">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(alt)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Symbol Shelter">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)} | Symbol Shelter">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${esc(alt)}">
<noscript><meta http-equiv="refresh" content="0;url=/#${s.id}"></noscript>
<script>location.replace('/#${s.id}')</script>
</head>
<body></body>
</html>
`;
}

// ---- feeds -----------------------------------------------------------------
const entries = [...S].sort((a, b) => (dates[b.id] + b.id).localeCompare(dates[a.id] + a.id));
const rssItems = entries.map(s => {
  const st = statusLine(s);
  return `    <item>
      <title>${esc(s.name)} (${esc(s.id)})</title>
      <link>${SITE}/s/${slug(s.id)}</link>
      <guid isPermaLink="true">${SITE}/s/${slug(s.id)}</guid>
      <pubDate>${new Date(dates[s.id] + 'T12:00:00Z').toUTCString()}</pubDate>
      <description>${esc(`${s.cat} · ${st.text}. ${s.blurb}`)}</description>
    </item>`;
}).join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Symbol Shelter | Konpo Studio</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Rejected logo marks by Konpo Studio, catalogued and up for adoption. New intakes as they arrive.</description>
    <language>en</language>
${rssItems}
  </channel>
</rss>
`;

const jsonFeed = {
  version: 'https://jsonfeed.org/version/1.1',
  title: 'Symbol Shelter | Konpo Studio',
  home_page_url: `${SITE}/`,
  feed_url: `${SITE}/feed.json`,
  description: 'Rejected logo marks by Konpo Studio, catalogued and up for adoption.',
  items: entries.map(s => {
    const st = statusLine(s);
    return {
      id: `${SITE}/s/${slug(s.id)}`,
      url: `${SITE}/s/${slug(s.id)}`,
      title: `${s.name} (${s.id})`,
      content_text: `${s.cat} · ${st.text}. ${s.blurb}`,
      image: `${SITE}/og/${slug(s.id)}.png`,
      date_published: `${dates[s.id]}T12:00:00Z`,
    };
  }),
};

// ---- crawlers ----------------------------------------------------------------
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
const lastmod = Object.values(dates).sort().pop();
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${lastmod}</lastmod></url>
${S.map(s => `  <url><loc>${SITE}/s/${slug(s.id)}</loc><lastmod>${dates[s.id]}</lastmod></url>`).join('\n')}
</urlset>
`;

// the home page's share tags quote the catalogue size: keep them honest
const syncCount = file => {
  const p = path.join(ROOT, file), html = fs.readFileSync(p, 'utf8');
  const next = html.replace(/\b\d+ rejected logo(s| marks)\b/g, (m, tail) => `${S.length} rejected logo${tail}`);
  if (next !== html) fs.writeFileSync(p, next);
};
['index.html', 'symbol-index.html'].forEach(syncCount);

// ---- write everything ------------------------------------------------------
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(ROOT, 'feed.xml'), rss);
fs.writeFileSync(path.join(ROOT, 'feed.json'), JSON.stringify(jsonFeed, null, 2));
for (const s of S) fs.writeFileSync(path.join(ROOT, 's', `${slug(s.id)}.html`), stubHtml(s));

const jobs = S.map(s => sharp(Buffer.from(ogSvg(s))).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'og', `${slug(s.id)}.png`)));
jobs.push(sharp(Buffer.from(rootSvg)).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'og', 'root.png')));
await Promise.all(jobs);

console.log(`ok: ${S.length} stubs + og images, root.png, feed.xml, feed.json, robots.txt, sitemap.xml`);
