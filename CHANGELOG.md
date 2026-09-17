# Changelog

Alle vesentlige endringer i prosjektet dokumenteres her.
Formatet følger [Keep a Changelog](https://keepachangelog.com/no/1.1.0/),
og prosjektet bruker [SemVer](https://semver.org/lang/no/).

## [0.2.0] — 2026-09-17

### Added
- Etappe 1: `sources.json` — kilderegister med 23 kilder (13 feed, 10 lenke).
  Alle landingssider og feed-URLer verifisert med HTTP 200 den 17.09.2026.
- Feed-kilder har tittelmønster (regex) for å skille rapportslipp fra generell nyhetsstrøm.
- Lenke-kilder har `forventet_neste` (YYYY-MM) basert på historisk utgivelsesmønster.
- `notat`-felt dokumenterer avvik: NSA uten 2025-utgave, NCSC-UK rapportfeed død siden mai 2025,
  BIS bruker RDF, Dragos-feed tom, Sophos/E-tjenesten blokkerer automatiserte kall.

### Removed
- Symantec: ingen årsrapport eksisterer etter Broadcom-oppkjøpet — ikke tatt inn.

## [0.1.0] — 2026-09-17

### Added
- Etappe 0: `version.json` som eneste versjonskilde.
- `bolletest.js` — validerer SemVer, at alle versjonsstempler er identiske,
  og (når den finnes) skjemaet i `sources.json`.
- `stamp.js` — propagerer ny versjon fra `version.json` til alle stempler.
- Pre-commit-hook som kjører bolletesten og blokkerer commit ved feil (apv2.2 §5).
- `CHANGELOG.md` etter Keep a Changelog.
