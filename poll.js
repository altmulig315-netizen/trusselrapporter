#!/usr/bin/env node
// @version 0.3.0
// poll.js — henter feed-kildene i sources.json, matcher titler mot tittelmønster,
// og oppdaterer siste_utgave når en nyere utgave er funnet.
// Bruk:  node poll.js               (tørrkjøring — viser hva som ville endret seg)
//        node poll.js --skriv       (skriver endringer til sources.json)
//        node poll.js --feed-dir X  (leser <X>/<id>.xml|json i stedet for nettet — for test)
'use strict';

const fs = require('fs');
const path = require('path');

// === KONFIG ===
const ROOT = __dirname;
const SOURCES = path.join(ROOT, 'sources.json');
const TIMEOUT_MS = 25000;
const USER_AGENT = 'trusselrapporter-poll/1.0 (+https://github.com/altmulig315-netizen/trusselrapporter)';

const args = process.argv.slice(2);
const SKRIV = args.includes('--skriv');
const feedDirIdx = args.indexOf('--feed-dir');
const FEED_DIR = feedDirIdx >= 0 ? path.resolve(args[feedDirIdx + 1] || '') : null;

// === STATE ===
const endringer = []; // { id, fra, til, tittel }
const feil = [];      // { id, melding }

// === HENTING ===
async function hent(kilde) {
  if (FEED_DIR) {
    const ext = kilde.feed.format === 'json' ? 'json' : 'xml';
    const p = path.join(FEED_DIR, `${kilde.id}.${ext}`);
    if (!fs.existsSync(p)) throw new Error(`testfil mangler: ${p}`);
    return fs.readFileSync(p, 'utf8');
  }
  const res = await fetch(kilde.feed.url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, application/json, text/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// === PARSING ===
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, navn) {
  // Første forekomst av <navn ...>innhold</navn>. Håndterer prefiks (dc:date) og CDATA.
  const re = new RegExp(`<${navn}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${navn}>`, 'i');
  const m = block.match(re);
  return m ? decode(m[1]) : null;
}

// RSS 2.0 og RSS 1.0/RDF: begge har <item>…</item>. RDF-items har attributter (rdf:about).
function parseXml(xml) {
  const items = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const tittel = tag(b, 'title');
    if (!tittel) continue;
    const link = tag(b, 'link') || tag(b, 'guid');
    const datoRaw = tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'dcterms:date') || tag(b, 'published') || tag(b, 'updated');
    items.push({ tittel, link, dato: tilIsoDato(datoRaw) });
  }
  return items;
}

// CISA KEV: én "utgave" per katalogversjon.
function parseKevJson(txt) {
  const j = JSON.parse(txt);
  return [{
    tittel: `${j.title || 'KEV'} ${j.catalogVersion || ''}`.trim(),
    link: null,
    dato: tilIsoDato(j.dateReleased),
  }];
}

function tilIsoDato(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// === MATCHING ===
function finnNyeste(items, monster) {
  const re = new RegExp(monster, 'i');
  const treff = items.filter((it) => re.test(it.tittel));
  // Nyeste først; poster uten dato sorteres sist.
  treff.sort((a, b) => (b.dato || '').localeCompare(a.dato || ''));
  return { treff, nyeste: treff[0] || null };
}

function erNyere(kandidat, siste) {
  if (!kandidat.dato) return false;               // uten dato kan vi ikke påstå noe
  if (!siste.dato) return true;                    // registeret har ingen dato — første observasjon
  return kandidat.dato > siste.dato;
}

// === KJØRING ===
async function behandle(kilde) {
  const txt = await hent(kilde);
  const items = kilde.feed.format === 'json' ? parseKevJson(txt) : parseXml(txt);
  if (items.length === 0) throw new Error('0 poster i feeden (tom eller ukjent format)');

  const { treff, nyeste } = finnNyeste(items, kilde.feed.monster);
  const linje = `${kilde.id.padEnd(36)} ${String(items.length).padStart(3)} poster ${String(treff.length).padStart(3)} treff`;

  if (!nyeste) { console.log(`  ${linje}  —`); return; }

  const siste = kilde.siste_utgave;
  if (erNyere(nyeste, siste)) {
    const til = { aar: Number(nyeste.dato.slice(0, 4)), dato: nyeste.dato, url: nyeste.link || siste.url };
    endringer.push({ id: kilde.id, fra: { ...siste }, til, tittel: nyeste.tittel });
    kilde.siste_utgave = til;
    console.log(`  ${linje}  NY: ${nyeste.dato}  "${nyeste.tittel}"`);
  } else {
    console.log(`  ${linje}  siste: ${siste.dato || '(ingen dato)'}  nyeste treff: ${nyeste.dato || '?'}`);
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  const feeds = data.kilder.filter((k) => k.metode === 'feed');

  console.log(`poll ${SKRIV ? '(skriver)' : '(tørrkjøring)'}${FEED_DIR ? ` — testdata fra ${FEED_DIR}` : ''}: ${feeds.length} feed-kilder\n`);

  for (const k of feeds) {
    try { await behandle(k); }
    catch (e) { feil.push({ id: k.id, melding: e.message }); console.log(`  ${k.id.padEnd(36)} FEIL: ${e.message}`); }
  }

  console.log(`\n${endringer.length} endring(er), ${feil.length} feil`);
  for (const e of endringer) {
    console.log(`  ${e.id}: ${e.fra.aar}/${e.fra.dato || '—'} -> ${e.til.aar}/${e.til.dato}`);
  }

  if (endringer.length > 0) {
    if (SKRIV) {
      fs.writeFileSync(SOURCES, JSON.stringify(data, null, 2) + '\n');
      console.log(`\nsources.json skrevet. Kjør bolletest før commit.`);
    } else {
      console.log(`\n(tørrkjøring — ingenting skrevet; bruk --skriv)`);
    }
  }

  process.exit(feil.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(`poll: uventet feil — ${e.message}`); process.exit(2); });
