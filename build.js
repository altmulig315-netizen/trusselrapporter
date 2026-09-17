#!/usr/bin/env node
// @version 0.5.0
// build.js — genererer index.html fra sources.json + version.json + CHANGELOG.md.
// Nettsiden er helt statisk: all data rendres her, browser-JS gjør kun filtrering.
// Stempler versjon i header-kommentar, footer (data-version) og docs-panel (data-docs-version).
'use strict';

const fs = require('fs');
const path = require('path');

// === KONFIG ===
const ROOT = __dirname;
const UT = path.join(ROOT, 'index.html');
const REPO_URL = 'https://github.com/altmulig315-netizen/trusselrapporter';

const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MND_LANG = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];

const KATEGORI = { nasjonal: 'Nasjonal (NO)', eu: 'EU', 'five-eyes': 'Five Eyes', leverandor: 'Leverandør', finans: 'Finans', ot: 'OT/ICS' };
const LAND = { NO: 'Norge', UK: 'Storbritannia', US: 'USA', EU: 'EU', INT: 'Internasjonal' };
const METODE = { feed: 'Feed', lenke: 'Lenke' };
const KADENS = { 'årlig': 'Årlig', 'halvårlig': 'Halvårlig', kvartalsvis: 'Kvartalsvis', 'løpende': 'Løpende', 'hvert-4-år': 'Hvert 4. år' };

// === HJELPERE ===
const les = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "2026-10" -> "okt 2026"
const ymKort = (ym) => ym ? `${MND[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '—';
// "2026-09-16" -> "16. sep 2026"
const datoKort = (d) => d ? `${Number(d.slice(8, 10))}. ${MND[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : null;

const naaYM = () => new Date().toISOString().slice(0, 7);
const naaDato = () => new Date().toISOString().slice(0, 10);

// Rullerende 12 måneder fra og med inneværende: ["2026-09", "2026-10", ...]
function rullerende12(fraYM) {
  let [y, m] = fraYM.split('-').map(Number);
  const ut = [];
  for (let i = 0; i < 12; i++) {
    ut.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return ut;
}

// === DATA ===
function lastData() {
  const version = JSON.parse(les('version.json')).version;
  const sources = JSON.parse(les('sources.json'));
  const changelog = les('CHANGELOG.md');
  // Siste changelog-seksjon (til docs-panelet)
  const m = changelog.match(/^## \[(\d+\.\d+\.\d+)\][^\n]*\n([\s\S]*?)(?=^## \[|\s*$)/m);
  const sisteLogg = m ? m[2].trim() : '';
  return { version, kilder: sources.kilder, verifisert: sources._verifisert || '', sisteLogg };
}

// === RENDERING: tabell ===
function radStatus(k, ym) {
  if (k.kadens === 'løpende') return { kl: 'ok', tekst: 'løpende' };
  if (!k.forventet_neste) return { kl: '', tekst: '' };
  if (k.forventet_neste < ym) return { kl: 'forfalt', tekst: 'forfalt' };
  if (k.forventet_neste === ym) return { kl: 'naa', tekst: 'denne måneden' };
  return { kl: 'ok', tekst: '' };
}

function rad(k, ym) {
  const s = k.siste_utgave;
  const status = radStatus(k, ym);
  const sisteTxt = s.dato ? datoKort(s.dato) : String(s.aar);
  const sisteHtml = s.url ? `<a href="${esc(s.url)}" rel="noopener">${esc(sisteTxt)}</a>` : esc(sisteTxt);
  const forventet = k.kadens === 'løpende' ? '<span class="dim">løpende</span>' : esc(ymKort(k.forventet_neste));
  const metodeTitle = k.metode === 'feed' ? `Overvåkes automatisk: ${k.feed.url}` : 'Ingen feed — sjekkes manuelt mot forventet dato';
  return `<tr data-kategori="${esc(k.kategori)}" data-land="${esc(k.land)}" data-metode="${esc(k.metode)}" data-sok="${esc((k.utgiver + ' ' + k.navn + ' ' + k.id).toLowerCase())}">
  <td class="utgiver">${esc(k.utgiver)}</td>
  <td class="navn"><a href="${esc(k.landingsside)}" rel="noopener">${esc(k.navn)}</a>${k.notat ? `<span class="notat" title="${esc(k.notat)}">i</span>` : ''}</td>
  <td><span class="tag tag-${esc(k.kategori)}">${esc(KATEGORI[k.kategori] || k.kategori)}</span></td>
  <td>${esc(LAND[k.land] || k.land)}</td>
  <td>${esc(KADENS[k.kadens] || k.kadens)}</td>
  <td class="siste">${sisteHtml}</td>
  <td class="forventet ${status.kl}">${forventet}${status.tekst ? `<span class="status">${esc(status.tekst)}</span>` : ''}</td>
  <td><span class="metode metode-${esc(k.metode)}" title="${esc(metodeTitle)}">${esc(METODE[k.metode])}</span></td>
</tr>`;
}

function tabell(kilder, ym) {
  const sortert = [...kilder].sort((a, b) => (a.kategori + a.utgiver + a.navn).localeCompare(b.kategori + b.utgiver + b.navn, 'nb'));
  return `<table id="tabell">
<thead><tr>
  <th>Utgiver</th><th>Rapport</th><th>Kategori</th><th>Land</th><th>Kadens</th><th>Siste utgave</th><th>Forventet neste</th><th>Metode</th>
</tr></thead>
<tbody>
${sortert.map((k) => rad(k, ym)).join('\n')}
</tbody>
</table>`;
}

// === RENDERING: filter ===
function filterBar(kilder) {
  const unike = (felt) => [...new Set(kilder.map((k) => k[felt]))].sort();
  const opts = (felt, labels) => unike(felt).map((v) => `<option value="${esc(v)}">${esc(labels[v] || v)}</option>`).join('');
  return `<div class="filter" id="filter">
  <input type="search" id="sok" placeholder="Søk utgiver eller rapport…" aria-label="Søk">
  <select id="f-kategori" aria-label="Kategori"><option value="">Alle kategorier</option>${opts('kategori', KATEGORI)}</select>
  <select id="f-land" aria-label="Land"><option value="">Alle land</option>${opts('land', LAND)}</select>
  <select id="f-metode" aria-label="Metode"><option value="">Feed og lenke</option>${opts('metode', METODE)}</select>
  <span id="antall" class="dim"></span>
</div>`;
}

// === RENDERING: årshjul ===
function aarshjul(kilder, ym) {
  const mnd = rullerende12(ym);
  const perMnd = Object.fromEntries(mnd.map((m) => [m, []]));
  const forfalt = [];
  for (const k of kilder) {
    if (k.kadens === 'løpende' || !k.forventet_neste) continue;
    if (k.forventet_neste < ym) forfalt.push(k);
    else if (perMnd[k.forventet_neste]) perMnd[k.forventet_neste].push(k);
    // Utenfor 12-månedersvinduet (f.eks. SOCTA 2029) vises ikke i hjulet, men står i tabellen.
  }
  const celle = (m) => {
    const [y, mm] = m.split('-');
    const liste = perMnd[m].sort((a, b) => a.utgiver.localeCompare(b.utgiver, 'nb'));
    return `<div class="mnd${m === ym ? ' naa' : ''}">
  <h3>${MND_LANG[Number(mm) - 1]} <span class="dim">${y}</span></h3>
  ${liste.length ? `<ul>${liste.map((k) => `<li><a href="${esc(k.landingsside)}" rel="noopener">${esc(k.utgiver)}</a> — ${esc(k.navn)}<span class="m ${k.metode}">${k.metode === 'feed' ? '⟳' : '↗'}</span></li>`).join('')}</ul>` : '<p class="dim">—</p>'}
</div>`;
  };
  const forfaltHtml = forfalt.length ? `<div class="forfalt-boks">
  <h3>Forventet, men ikke observert</h3>
  <ul>${forfalt.sort((a, b) => a.forventet_neste.localeCompare(b.forventet_neste)).map((k) => `<li><a href="${esc(k.landingsside)}" rel="noopener">${esc(k.utgiver)}</a> — ${esc(k.navn)} <span class="dim">(ventet ${esc(ymKort(k.forventet_neste))}, siste ${k.siste_utgave.aar})</span></li>`).join('')}</ul>
</div>` : '';
  return `${forfaltHtml}<div class="hjul">${mnd.map(celle).join('\n')}</div>`;
}

// === RENDERING: docs-panel ===
function docsPanel(d, ym, bygget) {
  const feeds = d.kilder.filter((k) => k.metode === 'feed').length;
  const lenker = d.kilder.length - feeds;
  return `<details id="docs">
<summary>Om denne siden</summary>
<div class="docs-inner">
<table class="docs-tabell">
<tr data-docs-version="${esc(d.version)}"><th>Versjon</th><td>${esc(d.version)}</td></tr>
<tr><th>Bygget</th><td>${esc(bygget)}</td></tr>
<tr><th>Kilder</th><td>${d.kilder.length} (${feeds} feed, ${lenker} lenke)</td></tr>
<tr><th>Kilderegister</th><td><a href="${REPO_URL}/blob/main/sources.json" rel="noopener">sources.json</a></td></tr>
<tr><th>Verifisering</th><td>${esc(d.verifisert)}</td></tr>
<tr><th>Protokoll</th><td>apv2.2</td></tr>
</table>
<h4>Hva betyr kolonnene</h4>
<dl>
<dt>Metode: Feed ⟳</dt><dd>Utgiveren har RSS/JSON. En poller sjekker daglig og oppdaterer «Siste utgave» automatisk når en post matcher rapportens tittelmønster.</dd>
<dt>Metode: Lenke ↗</dt><dd>Ingen maskinlesbar feed. Siden viser lenke og forventet neste utgave; «Siste utgave» oppdateres manuelt.</dd>
<dt>Forventet neste</dt><dd>Måned basert på historisk utgivelsesmønster. <span class="forfalt-inline">Forfalt</span> betyr at måneden har passert uten at ny utgave er observert.</dd>
<dt>Løpende</dt><dd>Kilden har ingen «utgave» — den oppdateres kontinuerlig. «Siste utgave» viser sist observerte post.</dd>
</dl>
<h4>Siste endring (${esc(d.version)})</h4>
<pre class="logg">${esc(d.sisteLogg)}</pre>
<p><a href="${REPO_URL}/blob/main/CHANGELOG.md" rel="noopener">Full changelog</a> · <a href="${REPO_URL}" rel="noopener">Kildekode</a></p>
</div>
</details>`;
}

// === RENDERING: side ===
function side(d) {
  const ym = naaYM();
  const bygget = naaDato();
  return `<!doctype html>
<!-- @version ${d.version} — generert av build.js ${bygget}. Ikke rediger for hånd; endre sources.json og kjør node build.js -->
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trusselrapporter</title>
<meta name="description" content="Oppslagsverk og utgivelseskalender for globale trusselvurderinger og sikkerhetsrapporter.">
<style>
${css()}
</style>
</head>
<body>
<header>
  <div class="wrap">
    <h1>Trusselrapporter <span class="ver" title="Versjon">v${esc(d.version)}</span></h1>
    <p class="under">Hvem utgir hva, når det kommer, og hvor du finner det. ${d.kilder.length} kilder · oppdatert ${esc(bygget)}</p>
  </div>
</header>

<main class="wrap">
  <section id="kalender">
    <h2>Neste 12 måneder</h2>
    ${aarshjul(d.kilder, ym)}
  </section>

  <section id="oppslag">
    <h2>Alle kilder</h2>
    ${filterBar(d.kilder)}
    <div class="tabell-wrap">
    ${tabell(d.kilder, ym)}
    </div>
  </section>

  ${docsPanel(d, ym, bygget)}
</main>

<footer data-version="${esc(d.version)}">
  <div class="wrap">v${esc(d.version)} · bygget ${esc(bygget)} · apv2.2 · <a href="${REPO_URL}" rel="noopener">GitHub</a></div>
</footer>

<script>
${js()}
</script>
</body>
</html>
`;
}

// === CSS ===
function css() {
  return `:root {
  --bg: #f6f7f9; --fg: #1a1d21; --muted: #6b7280; --line: #e2e5ea; --card: #ffffff;
  --accent: #1f5fbf; --ok: #1f7a4d; --naa: #b45309; --forfalt: #b42318; --forfalt-bg: #fdf1f0;
  --tag-nasjonal: #dbeafe; --tag-eu: #ede9fe; --tag-five-eyes: #dcfce7; --tag-leverandor: #fef3c7; --tag-finans: #fce7f3; --tag-ot: #e0f2fe;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #0f1216; --fg: #e6e8eb; --muted: #9aa3ad; --line: #262b33; --card: #171b21;
  --accent: #7aa7ff; --ok: #5cc48a; --naa: #f0a44b; --forfalt: #ff7b6b; --forfalt-bg: #2a1614;
  --tag-nasjonal: #1e3a5f; --tag-eu: #3b2f66; --tag-five-eyes: #1d4a30; --tag-leverandor: #5a4212; --tag-finans: #5a1f3c; --tag-ot: #143d55;
} }
* { box-sizing: border-box; }
html { color-scheme: light dark; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
.dim { color: var(--muted); }
header { border-bottom: 1px solid var(--line); background: var(--card); padding: 28px 0 20px; }
h1 { margin: 0; font-size: 26px; letter-spacing: -0.01em; display: flex; align-items: baseline; gap: 12px; }
.ver { font-size: 12px; font-weight: 500; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; font-variant-numeric: tabular-nums; }
.under { margin: 6px 0 0; color: var(--muted); }
h2 { font-size: 18px; margin: 36px 0 14px; }
h3 { font-size: 14px; margin: 0 0 6px; }
h4 { font-size: 14px; margin: 18px 0 6px; }

/* Årshjul */
.hjul { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.mnd { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.mnd.naa { border-color: var(--naa); box-shadow: inset 3px 0 0 var(--naa); }
.mnd ul { margin: 0; padding: 0; list-style: none; } .mnd li { padding: 3px 0; font-size: 14px; }
.mnd .m { margin-left: 6px; color: var(--muted); font-size: 12px; }
.forfalt-boks { background: var(--forfalt-bg); border: 1px solid var(--forfalt); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.forfalt-boks h3 { color: var(--forfalt); }
.forfalt-boks ul { margin: 0; padding: 0; list-style: none; } .forfalt-boks li { padding: 3px 0; font-size: 14px; }

/* Filter */
.filter { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.filter input, .filter select { font: inherit; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); }
.filter input { flex: 1 1 220px; min-width: 180px; }
#antall { margin-left: auto; font-size: 13px; }

/* Tabell */
.tabell-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
tr[hidden] { display: none; }
td.utgiver { white-space: nowrap; font-weight: 500; }
td.navn { min-width: 240px; }
td.siste, td.forventet { white-space: nowrap; font-variant-numeric: tabular-nums; }
.status { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.forfalt { color: var(--forfalt); } .naa { color: var(--naa); }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.tag-nasjonal { background: var(--tag-nasjonal); } .tag-eu { background: var(--tag-eu); } .tag-five-eyes { background: var(--tag-five-eyes); }
.tag-leverandor { background: var(--tag-leverandor); } .tag-finans { background: var(--tag-finans); } .tag-ot { background: var(--tag-ot); }
.metode { font-size: 12px; padding: 1px 8px; border-radius: 4px; border: 1px solid var(--line); white-space: nowrap; }
.metode-feed { color: var(--ok); border-color: var(--ok); }
.notat { display: inline-block; margin-left: 6px; width: 16px; height: 16px; line-height: 16px; text-align: center; border-radius: 50%; background: var(--line); color: var(--muted); font-size: 11px; font-style: italic; cursor: help; }

/* Docs */
details { margin: 36px 0; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
summary { cursor: pointer; padding: 12px 16px; font-weight: 600; }
.docs-inner { padding: 4px 16px 16px; }
.docs-tabell { width: auto; } .docs-tabell th { text-transform: none; letter-spacing: 0; font-size: 14px; padding-left: 0; }
dl { margin: 0; } dt { font-weight: 600; margin-top: 8px; } dd { margin: 2px 0 0; color: var(--muted); }
.forfalt-inline { color: var(--forfalt); font-weight: 600; }
pre.logg { white-space: pre-wrap; font-size: 13px; background: var(--bg); padding: 10px 12px; border-radius: 6px; margin: 0; }

footer { border-top: 1px solid var(--line); margin-top: 20px; padding: 18px 0 28px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { h1 { font-size: 22px; } th, td { padding: 8px; } }`;
}

// === JS (browser) ===
function js() {
  return `(function () {
  var rader = Array.prototype.slice.call(document.querySelectorAll('#tabell tbody tr'));
  var sok = document.getElementById('sok'), fk = document.getElementById('f-kategori'), fl = document.getElementById('f-land'), fm = document.getElementById('f-metode');
  var antall = document.getElementById('antall');
  function filtrer() {
    var q = sok.value.trim().toLowerCase(), k = fk.value, l = fl.value, m = fm.value, n = 0;
    rader.forEach(function (r) {
      var vis = (!k || r.dataset.kategori === k) && (!l || r.dataset.land === l) && (!m || r.dataset.metode === m) && (!q || r.dataset.sok.indexOf(q) !== -1);
      r.hidden = !vis; if (vis) n++;
    });
    antall.textContent = n + ' av ' + rader.length;
  }
  [sok, fk, fl, fm].forEach(function (el) { el.addEventListener('input', filtrer); el.addEventListener('change', filtrer); });
  filtrer();
})();`;
}

// === KJØRING ===
function main() {
  const d = lastData();
  const html = side(d);
  fs.writeFileSync(UT, html);
  const feeds = d.kilder.filter((k) => k.metode === 'feed').length;
  console.log(`build: index.html skrevet — v${d.version}, ${d.kilder.length} kilder (${feeds} feed, ${d.kilder.length - feeds} lenke), ${(html.length / 1024).toFixed(1)} kB`);
}

main();
