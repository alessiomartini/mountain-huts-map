# Roadmap

<!--
Unico file per todo, idee, decisioni e diario, letto da Projects Overview
(https://alessiomartini.github.io/projects-overview/). Protocollo: templates/ROADMAP.md di projects-overview.
-->

## Da fare
- [x] Pipeline dei dati, mappa MapLibre con filtri, pagine dei rifugi, it/en
- [ ] Dataset completo (oggi: dataset reale con 5204 rifugi per Alpi/Appennini italiani e Bergen, non più un campione di test)
  - [x] Aggiungere regioni in `scripts/regions.config.ts` (Alpi FR/CH/AT, Pirenei, Tatra; 2026-10-31)
  - [ ] Primo refresh con le nuove regioni (workflow mensile o manuale): `huts.json` non le contiene ancora
  - [ ] Rieseguire `npm run data:refresh` da una rete con accesso a Overpass: l'ultimo `huts.json` non contiene rifugi con fonte ut.no
  - [x] Workflow mensile di refresh + PR (`data-refresh-monthly.yml`)
  - [ ] Alessio: abilitare in Settings > Actions > General "Allow GitHub Actions to create and approve pull requests" e lanciare una volta il workflow a mano
- [ ] Funzione "chi c'è stato"
- [x] Widget per note/feedback
- [x] Dati della pagina di attribuzione
- [x] Contatore dei rifugi per fonte nella pagina di attribuzione e nota sul dataset aggiornata
- [x] Attribuzione di OpenStreetMap (ODbL), Wikidata (CC0) e Wikipedia (CC BY-SA 4.0) nel registro, con licenza e contatore

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

### Dataset completo: indagine (2026-10-31)

`src/data/huts.json` è versionato e contiene già un dataset reale (5204 rifugi; fonti osm, wikidata, wikipedia, cai), non più il campione di test: il testo "Fase di test" in /about era obsoleto ed è stato sostituito con la copertura reale. Cosa manca per "completo": (1) `regions.config.ts` ha solo alps-it, apennines, bergen; (2) nessun rifugio cita ut.no, quindi l'ultimo refresh è precedente a quella fonte; (3) nessun refresh pianificato (solo `data-refresh-check.yml` manuale, che non committa nulla). Il sito non rigenera i dati in build, e non va fatto (il deploy dipenderebbe dalla rete): il dataset resta un file versionato aggiornato via PR. Non verificato `data:refresh` in locale: dalla sandbox Overpass risponde con connessione resettata.

### Refresh mensile (2026-10-31)

`.github/workflows/data-refresh-monthly.yml` (cron il 1° del mese alle 03:00 UTC + manuale): `npm ci`, `data:refresh`, `test`; se `huts.json` cambia lo pusha sul branch fisso `data/refresh` (force) e apre o aggiorna la PR con `gh`. Solo azioni ufficiali, non tocca main né il deploy. Richiede l'impostazione del repo "Allow GitHub Actions to create and approve pull requests" (da abilitare a mano). Non provato in CI da qui. Se il refresh fallisce a metà il file non viene scritto (vedi `build-dataset.ts`), quindi nessuna PR.

### Paese per poligono (2026-10-31)

Bug: il `country` di ogni rifugio OSM veniva dal `country` della regione la cui bbox lo conteneva; la bbox `alps-it` copre anche Svizzera, Francia, Austria e Slovenia, quindi ~2050 rifugi stranieri erano marcati IT. Fix: `scripts/lib/country.ts` assegna il paese per point-in-polygon su `scripts/data/countries-europe.geojson` (Natural Earth admin-0 via datasets/geo-countries, PDDL / pubblico dominio; semplificato a ~200 m, 1,2 MB, rigenerabile con `scripts/build-country-boundaries.ts`); `resolveGeoContext` usa prima il poligono, poi `countryHint`, poi il vecchio fallback a bbox. Ricalcolo su `huts.json` (solo il campo `location.country`): IT->IT 3026, IT->CH 766, IT->AT 551, IT->FR 638, IT->SI 77, IT->HR 18, IT->BA 2, NO->NO 122, NO->null 4 (mare/buco di poligono: tenuto NO). Limiti: la semplificazione a ~200 m può sbagliare paese per un rifugio a meno di ~200 m dal confine; regione/provincia/comune dei rifugi ora stranieri restano quelli già nel file (per fuori Italia erano null, non ricalcolati). Natural Earth è nel registro di attribuzione.

### Nuove regioni (2026-10-31)

Aggiunte alps-fr-w, alps-fr-s, alps-ch-n, alps-at-n, alps-at-e, pyrenees, tatra. Le Alpine sono il complemento di `alps-it` (che già arriva in CH/FR/AT/SI fino a 47,2 N): rettangoli senza sovrapposizione, quindi nessuna query doppia e la ricerca della cima più vicina (prima regione che contiene il punto) non cambia per i rifugi già presenti. Test di config: id unici, bbox valide, nessuna sovrapposizione tranne alps-it/apennines (preesistente). `fetchOsmAll` ora deduplica per `externalId`. `country` della regione è solo un suggerimento (vale il poligono). Limite: un rifugio vicino al bordo di una regione può non vedere cime della regione vicina (raggio 3 km), come già prima. `huts.json` non rigenerato (Overpass non raggiungibile da qui).

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

- **Dati della pagina di attribuzione (fatto)**: l'elenco sta in `scripts/sources/attribution.ts` (chiave = `sourceName` dello scraper), letto da `attribution.astro`; `attribution.test.ts` fallisce se uno scraper non ha voce o se una voce senza scraper non è marcata `retired`. Tre voci (CAI Bergamo, Abitare l'Estremo, Parco delle Orobie Valtellinesi) non hanno più un modulo (assorbite da `cai.ts`) ma restano visibili, marcate `retired`. Nessun campo licenza: nessun modulo ne dichiara una. Fatto poi (2026-10-31): contatore dei rifugi per fonte (calcolato in build da huts.json con `src/lib/source-counts.ts`, un rifugio conta una volta per fonte; 0 per le fonti ritirate o senza rifugi) e `seedDataNote` sostituita da `datasetNote` (numero di rifugi letto da huts.json, nessuna affermazione sulla completezza).
- **Lockfile ri-sincronizzato (2026-10-31)**: `npm ci` falliva perché `package-lock.json` non era allineato a `package.json` (mancavano `@emnapi/core` e `@emnapi/runtime`, opzionali). `npm install` senza nuove dipendenze né bump: diff di ~30 righe, `npm ci` ora funziona. Il campo `license` del registro è opzionale e valorizzato solo per osm/wikidata/wikipedia (licenze verificate); le fonti da pipeline sono elencate in `PIPELINE_SOURCES`. Attribuzione della mappa non toccata: il footer cita già OSM e lo stile OpenFreeMap porta la sua.

### Widget note/feedback (fatto 2026-10-24)

Pulsante flottante "Nota" in basso a destra (sopra la legenda) su tutte le pagine, in it/en (chiavi `notes.*` nei dizionari). Apre un pannello con textarea (max 2000 caratteri), invia con `POST` JSON `{text, page, context, website}` a `site-notes` (`/mountain-huts-map/notes`); `website` è il campo honeypot nascosto. Pulsante disabilitato durante l'invio, stati di successo/errore, Escape chiude. Codice: `src/components/NoteWidget.astro`, logica pura (payload) in `src/lib/notes.ts` con test. `context` = `lang=…; hut=<slug>` (solo nelle pagine rifugio) `; filters=<query string>`: i filtri della mappa sono già nell'URL, quindi nessun refactor. Limiti: il rifugio selezionato nella bottom sheet della mappa non è nel contesto (c'è solo lo slug nelle pagine di dettaglio); le note non passano da localStorage, quindi se l'invio fallisce il testo resta nella textarea ma non viene salvato altrove.

## Log
- 2026-10-31: 🤖 nuove regioni (Alpi FR/CH/AT, Pirenei, Tatra) in `regions.config.ts` con test di config e dedup per id OSM; dati da rigenerare col refresh
- 2026-10-31: 🤖 corretto il paese dei rifugi (assegnato per poligono Natural Earth invece che dalla bbox della regione): ~2050 rifugi stranieri non sono più marcati IT; `huts.json` aggiornato solo nel campo country
- 2026-10-31: 🤖 workflow mensile `data-refresh-monthly.yml` (refresh + test + PR su `data/refresh`); serve l'impostazione Actions per creare PR
- 2026-10-31: 🤖 indagine sul dataset completo: `huts.json` è già reale (5204 rifugi, IT + Bergen); corretto il testo obsoleto "fase di test" in /about e README; sotto-compiti per regioni, refresh con ut.no e workflow mensile
- 2026-10-31: 🤖 pagina di attribuzione: contatore dei rifugi per fonte calcolato in build e nota sul dataset aggiornata (la vecchia nota sul set di prova era obsoleta); aggiunte le voci osm/wikidata/wikipedia (con licenza) e test che ogni fonte di huts.json abbia una voce; ripristinato `package-lock.json` (mancavano `@emnapi/*`, `npm ci` falliva)
- 2026-10-24: 🤖 widget note/feedback verso site-notes
- 2026-10-20: 🤖 pagina di attribuzione guidata dai dati: elenco delle fonti in `scripts/sources/attribution.ts`, con test che lo confronta con gli scraper
- 2026-10-19: deciso il backend delle note: quello condiviso `site-notes`; installabile come app a sé dal telefono (manifest con nome, icona e perimetro propri)
- 2026-10-19: indirizzo del sito corretto (canonical e sitemap puntavano a un dominio inesistente); niente dominio di produzione; GitHub Pages spento
- 2026-10-18: FUTURE-ARCHITECTURE.md unito in ROADMAP.md (protocollo unico); nuova fonte ut.no (DNT) per i rifugi norvegesi: posti letto, livello di servizio, gestore, telefono, link di prenotazione
- 2026-10-15: creata la roadmap per Projects Overview
