# trusselrapporter

Oppslagsverk og utgivelseskalender for globale trusselvurderinger, med automatisk
feed-overvåking der utgiveren tilbyr RSS/JSON, og lenke + forventet neste utgave der
de ikke gjør det.

Prosjektet følger **apv2.2**.

## Filer

| Fil | Rolle |
|---|---|
| `version.json` | Eneste versjonskilde (SemVer). Alle andre stempler avledes herfra. |
| `bolletest.js` | Verifisering før embedding: SemVer, identiske stempler, skjema i `sources.json`. |
| `stamp.js` | `node stamp.js X.Y.Z` — bumper version.json, headers og CHANGELOG. |
| `sources.json` | Kilderegister (etappe 1). |
| `poll.js` | Feed-poller (etappe 2). |
| `build.js` → `index.html` | Statisk nettside (etappe 3). |
| `.github/workflows/poll.yml` | Daglig cron: poll → build → bolletest → commit. |
| `hooks/pre-commit` | Versjonert kopi av git-hooken. Installeres i `.git/hooks/`. |

## Arbeidsflyt ved endring

1. `node stamp.js <ny versjon>`
2. Fyll ut CHANGELOG (erstatt `TODO`)
3. Gjør endringen
4. `node build.js` — regenererer `index.html` med nytt stempel
5. `node bolletest.js` — må være GRØNN
6. `git commit` (hooken kjører bolletesten igjen og blokkerer ved feil)

## Daglig drift

Kjøres automatisk av GitHub Actions (`.github/workflows/poll.yml`) hver morgen. Manuelt:

```sh
node poll.js --skriv && node build.js && node bolletest.js && git commit -am "poll: $(date +%F)"
```

## Etter kloning

```sh
cp hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```
