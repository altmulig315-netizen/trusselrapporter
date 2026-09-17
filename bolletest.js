#!/usr/bin/env node
// @version 0.4.0
// bolletest.js — apv2.2 §3: Node-verifisering før embedding.
// Sjekker (1) SemVer i version.json, (2) at alle versjonsstempler er identiske,
// (3) skjemaet i sources.json når den finnes. Avslutter med kode 1 ved feil.
'use strict';

const fs = require('fs');
const path = require('path');

// === KONFIG ===
const ROOT = __dirname;
const VERSION_FILE = 'version.json';
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Filer som skal ha `@version X.Y.Z` i de første linjene (sjekkes hvis de finnes).
const HEADER_FILES = ['bolletest.js', 'stamp.js', 'poll.js', 'build.js', 'index.html'];
const HEADER_RE = /@version\s+(\d+\.\d+\.\d+)/;
const HEADER_MAX_LINES = 6;

// Stempler i index.html (etappe 3). Attributtene settes av build.js.
const FOOTER_RE = /<footer[^>]*\sdata-version="(\d+\.\d+\.\d+)"/;
const DOCS_ROW_RE = /data-docs-version="(\d+\.\d+\.\d+)"/;

// CHANGELOG: første overskrift på nivå 2 må være gjeldende versjon.
const CHANGELOG_RE = /^## \[(\d+\.\d+\.\d+)\]/m;

// sources.json
const KADENS = new Set(['årlig', 'halvårlig', 'kvartalsvis', 'løpende', 'hvert-4-år']);
const METODE = new Set(['feed', 'lenke']);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HTTPS_RE = /^https:\/\/\S+$/;

// === STATE ===
const errors = [];
const warnings = [];
const passed = [];

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const ok = (m) => passed.push(m);

const readIfExists = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

// === VERSJON ===
function readVersion() {
  const raw = readIfExists(VERSION_FILE);
  if (raw === null) { err(`${VERSION_FILE} mangler`); return null; }
  let v;
  try { v = JSON.parse(raw).version; } catch (e) { err(`${VERSION_FILE}: ugyldig JSON — ${e.message}`); return null; }
  if (typeof v !== 'string' || !SEMVER_RE.test(v)) { err(`${VERSION_FILE}: "${v}" er ikke gyldig SemVer (MAJOR.MINOR.PATCH)`); return null; }
  ok(`version.json = ${v} (gyldig SemVer)`);
  return v;
}

// === STEMPLER ===
function collectStamps(version) {
  const stamps = []; // { felt, kilde, verdi }

  // (1) Versjonerte headers
  for (const f of HEADER_FILES) {
    const raw = readIfExists(f);
    if (raw === null) continue;
    const head = raw.split(/\r?\n/).slice(0, HEADER_MAX_LINES).join('\n');
    const m = head.match(HEADER_RE);
    if (!m) err(`${f}: mangler "@version X.Y.Z" i de første ${HEADER_MAX_LINES} linjene`);
    else stamps.push({ felt: 'header', kilde: f, verdi: m[1] });
  }

  // (2) Footer og (4) docs-panel-rad — begge i index.html
  const html = readIfExists('index.html');
  if (html === null) {
    warn('index.html finnes ikke ennå — footer og docs-panel-rad kan ikke sjekkes (ventes fra etappe 3)');
  } else {
    const f = html.match(FOOTER_RE);
    if (!f) err('index.html: <footer> mangler data-version="X.Y.Z"');
    else stamps.push({ felt: 'footer', kilde: 'index.html', verdi: f[1] });

    const d = html.match(DOCS_ROW_RE);
    if (!d) err('index.html: docs-panel mangler rad med data-docs-version="X.Y.Z"');
    else stamps.push({ felt: 'docs-panel', kilde: 'index.html', verdi: d[1] });
  }

  // (3) Changelog
  const cl = readIfExists('CHANGELOG.md');
  if (cl === null) err('CHANGELOG.md mangler');
  else {
    const m = cl.match(CHANGELOG_RE);
    if (!m) err('CHANGELOG.md: fant ingen "## [X.Y.Z]"-overskrift');
    else stamps.push({ felt: 'changelog', kilde: 'CHANGELOG.md', verdi: m[1] });
    if (/\bTODO\b/.test(cl)) err('CHANGELOG.md: inneholder "TODO" — fyll inn endringslinjen før commit');
  }

  // Alle stempler må være nøyaktig ett unikt tall, lik version.json
  const unike = [...new Set(stamps.map((s) => s.verdi))];
  if (unike.length === 1 && unike[0] === version) {
    ok(`${stamps.length} versjonsstempler er identiske (${version}): ` +
       stamps.map((s) => `${s.felt}@${s.kilde}`).join(', '));
  } else {
    for (const s of stamps) {
      if (s.verdi !== version) err(`stempel ute av synk: ${s.felt} i ${s.kilde} = ${s.verdi}, version.json = ${version}`);
    }
    if (unike.length !== 1) err(`stemplene har ${unike.length} ulike verdier: ${unike.join(', ')}`);
  }
}

// === SKJEMA: sources.json ===
function checkSources() {
  const raw = readIfExists('sources.json');
  if (raw === null) { warn('sources.json finnes ikke ennå (ventes fra etappe 1)'); return; }

  let data;
  try { data = JSON.parse(raw); } catch (e) { err(`sources.json: ugyldig JSON — ${e.message}`); return; }
  if (!Array.isArray(data.kilder)) { err('sources.json: mangler toppnivå-array "kilder"'); return; }

  const ids = new Set();
  let feeds = 0, lenker = 0;
  const before = errors.length;

  data.kilder.forEach((k, i) => {
    const hvor = `sources.json kilder[${i}]${k && k.id ? ` (${k.id})` : ''}`;
    const str = (v) => typeof v === 'string' && v.trim().length > 0;
    const req = (felt, test, hint) => {
      if (!(felt in k)) return err(`${hvor}: mangler "${felt}"`);
      if (!test(k[felt])) err(`${hvor}: "${felt}" er ugyldig${hint ? ` — ${hint}` : ''}`);
    };

    req('id', (v) => str(v) && ID_RE.test(v), 'kebab-case a-z0-9');
    if (k.id) { if (ids.has(k.id)) err(`${hvor}: duplikat id`); ids.add(k.id); }
    req('utgiver', str);
    req('navn', str);
    req('kategori', str);
    req('land', str);
    req('kadens', (v) => KADENS.has(v), [...KADENS].join('|'));
    req('landingsside', (v) => str(v) && HTTPS_RE.test(v), 'må være https-URL');
    req('metode', (v) => METODE.has(v), 'feed|lenke');

    // siste_utgave: { aar, dato|null, url|null }
    req('siste_utgave', (v) => v !== null && typeof v === 'object');
    if (k.siste_utgave && typeof k.siste_utgave === 'object') {
      const s = k.siste_utgave;
      if (!Number.isInteger(s.aar) || s.aar < 2000 || s.aar > 2100) err(`${hvor}: siste_utgave.aar må være heltall 2000–2100`);
      if (s.dato !== null && !(str(s.dato) && YMD_RE.test(s.dato))) err(`${hvor}: siste_utgave.dato må være YYYY-MM-DD eller null`);
      if (s.url !== null && !(str(s.url) && HTTPS_RE.test(s.url))) err(`${hvor}: siste_utgave.url må være https-URL eller null`);
    }

    // forventet_neste: YYYY-MM — påkrevd for alt unntatt kadens=løpende
    if (k.kadens === 'løpende') {
      if (k.forventet_neste !== null) err(`${hvor}: kadens=løpende skal ha forventet_neste: null`);
    } else {
      req('forventet_neste', (v) => str(v) && YM_RE.test(v), 'YYYY-MM');
    }

    // feed: { url, monster } — kun ved metode=feed
    if (k.metode === 'feed') {
      feeds++;
      if (!k.feed || typeof k.feed !== 'object') err(`${hvor}: metode=feed krever objektet "feed"`);
      else {
        if (!(str(k.feed.url) && HTTPS_RE.test(k.feed.url))) err(`${hvor}: feed.url må være https-URL`);
        if (!str(k.feed.monster)) err(`${hvor}: feed.monster mangler`);
        else { try { new RegExp(k.feed.monster, 'i'); } catch (e) { err(`${hvor}: feed.monster er ugyldig regex — ${e.message}`); } }
      }
    } else {
      lenker++;
      if ('feed' in k) err(`${hvor}: metode=lenke skal ikke ha "feed"`);
    }
  });

  if (errors.length === before) ok(`sources.json: ${data.kilder.length} kilder validert (${feeds} feed, ${lenker} lenke)`);
}

// === RAPPORT ===
function main() {
  const version = readVersion();
  if (version) collectStamps(version);
  checkSources();

  for (const m of passed) console.log(`  OK    ${m}`);
  for (const m of warnings) console.log(`  ADV   ${m}`);
  for (const m of errors) console.log(`  FEIL  ${m}`);

  const status = errors.length === 0 ? 'GRØNN' : 'RØD';
  console.log(`\nbolletest: ${status} — ${passed.length} ok, ${warnings.length} advarsler, ${errors.length} feil`);
  process.exit(errors.length === 0 ? 0 : 1);
}

main();
