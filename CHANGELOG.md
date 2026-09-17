# Changelog

Alle vesentlige endringer i prosjektet dokumenteres her.
Formatet følger [Keep a Changelog](https://keepachangelog.com/no/1.1.0/),
og prosjektet bruker [SemVer](https://semver.org/lang/no/).

## [0.1.0] — 2026-09-17

### Added
- Etappe 0: `version.json` som eneste versjonskilde.
- `bolletest.js` — validerer SemVer, at alle versjonsstempler er identiske,
  og (når den finnes) skjemaet i `sources.json`.
- `stamp.js` — propagerer ny versjon fra `version.json` til alle stempler.
- Pre-commit-hook som kjører bolletesten og blokkerer commit ved feil (apv2.2 §5).
- `CHANGELOG.md` etter Keep a Changelog.
