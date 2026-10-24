# Roadmap

<!--
Unico file per todo, idee, decisioni e diario, letto da Projects Overview
(https://alessiomartini.github.io/projects-overview/). Protocollo: templates/ROADMAP.md di projects-overview.
-->

## Da fare
- [x] Pipeline dei dati, mappa MapLibre con filtri, pagine dei rifugi, it/en
- [ ] Dataset completo (oggi c'è un campione di test)
- [ ] Funzione "chi c'è stato"
- [x] Widget per note/feedback
- [x] Dati della pagina di attribuzione

## Idee
- [ ] Fonte "dny-hytte" per la Norvegia: dominio non trovato (dny-hytte.no/.com non risolvono), serve l'indirizzo esatto

### Planned: user note / feedback widget

- [x] Planned: user note / feedback widget

Not started. Idea: let visitors leave a short free-text note (general site
feedback, not per-hut) via a small widget, in the same spirit as the
"chi c'è stato" feature but simpler (no moderation UI, no per-hut
association needed for a first version).

**Decided (2026-10-19): use the shared `site-notes` backend** (repo
`alessiomartini/site-notes`: one Cloudflare Worker + one D1 for the notes of
all of Alessio's sites). `mountain-huts-map` is already in its `SITES` list and
its workers.dev origin is allowed, so no D1, binding or Worker route is needed
here: the widget is a small client component that POSTs
`{text, page, context, website}` to
`https://site-notes.alemarti-2001.workers.dev/mountain-huts-map/notes`
(`website` = hidden honeypot field; `context` = active filters / selected hut).
Notes always reach the server, never only localStorage. Rate limiting, if
needed, belongs in `site-notes`, not here. This no longer waits for the
visits/D1 backend (Phase 5).

## Decisioni e cose provate

This file tracks features that are planned but not implemented, so a new
session can see what's next without guessing. It reflects the actual code as
of 2026-09-21, not the (currently stale-sounding) "scaffolding only" line
that used to be in the README — the map, hut detail pages, filters, i18n,
and data pipeline are built and deployed; see README.md for what's live.

### Niente dominio di produzione (2026-10-19)

Un dominio proprio (es. rifugi.qualcosa.it) costa ~10 €/anno e serve solo per un indirizzo più bello.
Scelta la soluzione più semplice: l'indirizzo resta https://mountain-huts-map.alemarti-2001.workers.dev,
impostato in `astro.config.mjs` (prima puntava a `mountain-huts-map.workers.dev`, che non esiste).
GitHub Pages del repo spento (era un 404).

### Fonte ut.no (2026-10-18)

L'API GraphQL di ut.no risponde 403 alle query anonime sulle hytte e il sito non ha sitemap, quindi
`scripts/sources/utno.ts` parte dai rifugi OSM con `website=ut.no/hytte/<id>` (~800 in tutta la Norvegia)
e legge la pagina pubblica. Limite: le hytte che OSM non collega a ut.no restano fuori; ut.no ha precedenza
su OSM per livello di servizio e posti letto, le coordinate restano di OSM.

### Known gaps in the current code

- **Visits / "chi c'è stato" feature**: `src/pages/[lang]/hut/[slug].astro`
  already renders a `hut-detail__who-has-been-here` section with the copy
  "Presto potrai leggere e condividere qui le esperienze di chi ha visitato
  questo posto" (`hut.whoHasBeenHereComingSoon` in `src/i18n/*.json`) — the
  UI placeholder exists, the backend does not. `wrangler.jsonc` has a comment
  noting the D1 binding and secrets (`IP_SALT`, `MODERATION_TOKEN`) are
  "added when that phase lands" (Phase 5) — no D1 database, binding, or API
  route exists yet anywhere in the repo.
- **Full dataset**: `src/data/huts.json` currently holds a test sample
  (`about.testPhaseBody` in the UI says this explicitly), not the full
  European dataset described in the README's ambition. `scripts/build-dataset.ts`
  and `scripts/sources/*` are the pipeline that will produce it; the
  `data-refresh-check.yml` workflow is manual-only ("the real scheduled
  monthly-refresh-and-PR workflow lands in a later phase" per its own
  comment).
- **Attribution page data**: README says `/attribution` is "the canonical
  list" of source licenses; confirm it's kept in sync as new sources are
  added in `scripts/sources/`.

- **Dati della pagina di attribuzione (fatto)**: l'elenco sta in `scripts/sources/attribution.ts` (chiave = `sourceName` dello scraper), letto da `attribution.astro`; `attribution.test.ts` fallisce se uno scraper non ha voce o se una voce senza scraper non è marcata `retired`. Tre voci (CAI Bergamo, Abitare l'Estremo, Parco delle Orobie Valtellinesi) non hanno più un modulo (assorbite da `cai.ts`) ma restano visibili, marcate `retired`. Nessun campo licenza: nessun modulo ne dichiara una. Non fatto: contatore dei rifugi per fonte (`sources[].name` in huts.json c'è, ma i nomi sono le chiavi degli scraper e il dataset da 5204 rifugi non è più un campione: da rivedere anche `seedDataNote`, ormai obsoleta).

### Widget note/feedback (fatto 2026-10-24)

Pulsante flottante "Nota" in basso a destra (sopra la legenda) su tutte le pagine, in it/en (chiavi `notes.*` nei dizionari). Apre un pannello con textarea (max 2000 caratteri), invia con `POST` JSON `{text, page, context, website}` a `site-notes` (`/mountain-huts-map/notes`); `website` è il campo honeypot nascosto. Pulsante disabilitato durante l'invio, stati di successo/errore, Escape chiude. Codice: `src/components/NoteWidget.astro`, logica pura (payload) in `src/lib/notes.ts` con test. `context` = `lang=…; hut=<slug>` (solo nelle pagine rifugio) `; filters=<query string>`: i filtri della mappa sono già nell'URL, quindi nessun refactor. Limiti: il rifugio selezionato nella bottom sheet della mappa non è nel contesto (c'è solo lo slug nelle pagine di dettaglio); le note non passano da localStorage, quindi se l'invio fallisce il testo resta nella textarea ma non viene salvato altrove.

## Log
- 2026-10-24: 🤖 widget note/feedback verso site-notes
- 2026-10-20: 🤖 pagina di attribuzione guidata dai dati: elenco delle fonti in `scripts/sources/attribution.ts`, con test che lo confronta con gli scraper
- 2026-10-19: deciso il backend delle note: quello condiviso `site-notes`; installabile come app a sé dal telefono (manifest con nome, icona e perimetro propri)
- 2026-10-19: indirizzo del sito corretto (canonical e sitemap puntavano a un dominio inesistente); niente dominio di produzione; GitHub Pages spento
- 2026-10-18: FUTURE-ARCHITECTURE.md unito in ROADMAP.md (protocollo unico); nuova fonte ut.no (DNT) per i rifugi norvegesi: posti letto, livello di servizio, gestore, telefono, link di prenotazione
- 2026-10-15: creata la roadmap per Projects Overview
