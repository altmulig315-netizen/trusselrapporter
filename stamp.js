#!/usr/bin/env node
// @version 0.1.0
// stamp.js — apv2.2 §4: propagerer ny versjon fra ett sted til alle stempler.
// Bruk: node stamp.js 0.2.0
// Oppdaterer version.json, @version i alle headers, og legger inn ny CHANGELOG-seksjon
// med TODO-plassholder (bolletesten blokkerer commit til den er fylt ut).
'use strict';

const fs = require('fs');
const path = require('path');

// === KONFIG ===
const ROOT = __dirname;
const VERSION_FILE = 'version.json';
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HEADER_FILES = ['bolletest.js', 'stamp.js', 'poll.js', 'build.js'];
const HEADER_RE = /(@version\s+)\d+\.\d+\.\d+/;
const CHANGELOG_ANCHOR = /^## \[/m;

// === HJELPERE ===
const p = (rel) => path.join(ROOT, rel);
const cmp = (a, b) => {
  const [a1, a2, a3] = a.split('.').map(Number);
  const [b1, b2, b3] = b.split('.').map(Number);
  return a1 - b1 || a2 - b2 || a3 - b3;
};
const today = () => new Date().toISOString().slice(0, 10);

// === KJØRING ===
function main() {
  const ny = process.argv[2];
  if (!ny || !SEMVER_RE.test(ny)) {
    console.error('Bruk: node stamp.js MAJOR.MINOR.PATCH');
    process.exit(2);
  }

  const gammel = JSON.parse(fs.readFileSync(p(VERSION_FILE), 'utf8')).version;
  if (cmp(ny, gammel) <= 0) {
    console.error(`stamp: ${ny} er ikke høyere enn gjeldende ${gammel}`);
    process.exit(2);
  }

  // 1) version.json — eneste kilde
  fs.writeFileSync(p(VERSION_FILE), JSON.stringify({ version: ny }, null, 2) + '\n');
  console.log(`  ${VERSION_FILE}: ${gammel} -> ${ny}`);

  // 2) headers
  for (const f of HEADER_FILES) {
    if (!fs.existsSync(p(f))) continue;
    const src = fs.readFileSync(p(f), 'utf8');
    const ut = src.replace(HEADER_RE, `$1${ny}`);
    if (ut === src) { console.error(`  ${f}: fant ingen @version-linje`); process.exit(1); }
    fs.writeFileSync(p(f), ut);
    console.log(`  ${f}: header stemplet`);
  }

  // 3) CHANGELOG — ny seksjon øverst, med TODO som bolletesten nekter å slippe gjennom
  const cl = fs.readFileSync(p('CHANGELOG.md'), 'utf8');
  const seksjon = `## [${ny}] — ${today()}\n\n### Changed\n- TODO\n\n`;
  const idx = cl.search(CHANGELOG_ANCHOR);
  if (idx < 0) { console.error('  CHANGELOG.md: fant ingen eksisterende "## ["-seksjon'); process.exit(1); }
  fs.writeFileSync(p('CHANGELOG.md'), cl.slice(0, idx) + seksjon + cl.slice(idx));
  console.log('  CHANGELOG.md: ny seksjon lagt inn — fyll ut TODO');

  // index.html stemples av build.js (footer + docs-panel) ut fra version.json.
  if (fs.existsSync(p('index.html'))) console.log('  index.html: kjør `node build.js` for å stemple footer og docs-panel');

  console.log(`\nstamp: ${ny}. Neste: fyll CHANGELOG, kjør bolletest, commit.`);
}

main();
