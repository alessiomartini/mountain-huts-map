# Roadmap

<!--
Single file for todos, ideas, decisions and diary, read by Projects Overview
(https://alessiomartini.github.io/projects-overview/). Protocol: templates/ROADMAP.md of projects-overview.
-->

## To do
- [x] Data pipeline, MapLibre map with filters, hut pages, it/en
- [ ] Complete dataset (today: a real dataset with 5204 huts for the Italian Alps/Apennines and Bergen, no longer a test sample)
  - [x] Add regions in `scripts/regions.config.ts` (Alps FR/CH/AT, Pyrenees, Tatra; 2026-10-31); 2026-11-07: Slovenia, western Croatia, Dinaric Alps, Albania/Macedonia/Pindus, Bulgaria (Rila, Pirin), Carpathians SK/RO, Picos de Europa, Gredos, Sierra Nevada, Corsica, central Norway/Romsdal/Arctic Norway, Sweden, Scottish Highlands; the Dolomites, western Julian Alps and Apuan Alps were already covered by `alps-it`/`apennines`; the data arrives at the next refresh)
  - [ ] First refresh with the new regions (monthly or manual workflow): `huts.json` does not contain them yet. The 2026-11-01 run produced 7864 huts (10 regions) and is already on the `data/refresh` branch (only the 10 regions of that time, without the 18 of 2026-11-07); rerun on 2026-11-21 after the fix
  - [ ] Alessio: enable Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests" (without it, the PR is not created; the workflow no longer fails and now warns)
  - [ ] After the run: check the `data/refresh` PR (diff of `huts.json`, 91 discarded by validation, ~4369 to review) and merge by hand
  - [ ] Rerun `npm run data:refresh` from a network with access to Overpass: the latest `huts.json` contains no huts from the ut.no source
  - [x] Monthly refresh workflow + PR (`data-refresh-monthly.yml`)
  - [ ] Alessio: enable "Allow GitHub Actions to create and approve pull requests" in Settings > Actions > General and run the workflow once by hand
- [ ] "Who has been there" feature
  - [x] Code (D1 migration, API, UI, tests)
  - [ ] Alessio: create the D1, apply the migration, set the secrets IP_SALT and MODERATION_TOKEN, deploy
- [x] Notes/feedback widget
- [x] Attribution page data
- [x] Hut counter per source on the attribution page and updated dataset note
- [x] Attribution of OpenStreetMap (ODbL), Wikidata (CC0) and Wikipedia (CC BY-SA 4.0) in the registry, with license and counter

## Ideas
- [ ] "dny-hytte" source for Norway: domain not found (dny-hytte.no/.com do not resolve), the exact address is needed

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

## Decisions and things tried

This file tracks features that are planned but not implemented, so a new
session can see what's next without guessing. It reflects the actual code as
of 2026-09-21, not the (currently stale-sounding) "scaffolding only" line
that used to be in the README — the map, hut detail pages, filters, i18n,
and data pipeline are built and deployed; see README.md for what's live.

### No production domain (2026-10-19)

A custom domain (e.g. rifugi.something.it) costs ~10 €/year and only buys a nicer address.
The simplest solution was chosen: the address stays https://mountain-huts-map.alemarti-2001.workers.dev,
set in `astro.config.mjs` (it used to point to `mountain-huts-map.workers.dev`, which does not exist).
The repo's GitHub Pages was turned off (it was a 404).

### ut.no source (2026-10-18)

The ut.no GraphQL API answers 403 to anonymous queries on the huts and the site has no sitemap, so
`scripts/sources/utno.ts` starts from the OSM huts with `website=ut.no/hytte/<id>` (~800 in all of Norway)
and reads the public page. Limit: huts that OSM does not link to ut.no stay out; ut.no takes precedence
over OSM for service level and number of beds, while coordinates stay from OSM.

### Complete dataset: investigation (2026-10-31)

`src/data/huts.json` is versioned and already contains a real dataset (5204 huts; sources osm, wikidata, wikipedia, cai), no longer the test sample: the "Test phase" text in /about was obsolete and has been replaced with the real coverage. What is missing for "complete": (1) `regions.config.ts` has only alps-it, apennines, bergen; (2) no hut cites ut.no, so the last refresh predates that source; (3) no scheduled refresh (only the manual `data-refresh-check.yml`, which commits nothing). The site does not regenerate the data at build time, and it should not (the deploy would depend on the network): the dataset stays a versioned file updated via PR. `data:refresh` not verified locally: from the sandbox Overpass answers with a connection reset.

### Monthly refresh: first run failed (2026-11-21)

Run 41295398039 (2026-11-01, 1h44m): `data:refresh` and `test` succeeded (7864 huts), the failure was only in the last step: `gh pr create` -> "GitHub Actions is not permitted to create or approve pull requests" (a repo setting, not touched). The data had been pushed to `data/refresh` anyway. Second problem: Overpass answered 502/429 to many peak and mountain-range queries in `geocode-admin.ts` (no retry), so `nearest_peak`/`mountain_group` are missing for several regions. Fixes: retry with backoff + mirror (`overpassWithRetry`), non-fatal PR step (warning), `timeout-minutes: 300`.

### Monthly refresh (2026-10-31)

`.github/workflows/data-refresh-monthly.yml` (cron on the 1st of the month at 03:00 UTC + manual): `npm ci`, `data:refresh`, `test`; if `huts.json` changes it pushes it to the fixed branch `data/refresh` (force) and opens or updates the PR with `gh`. Official actions only, it touches neither main nor the deploy. It requires the repo setting "Allow GitHub Actions to create and approve pull requests" (to be enabled by hand). Not tried in CI from here. If the refresh fails halfway the file is not written (see `build-dataset.ts`), so no PR.

### Country by polygon (2026-10-31)

Bug: the `country` of each OSM hut came from the `country` of the region whose bbox contained it; the `alps-it` bbox also covers Switzerland, France, Austria and Slovenia, so ~2050 foreign huts were marked IT. Fix: `scripts/lib/country.ts` assigns the country by point-in-polygon on `scripts/data/countries-europe.geojson` (Natural Earth admin-0 via datasets/geo-countries, PDDL / public domain; simplified to ~200 m, 1.2 MB, regenerable with `scripts/build-country-boundaries.ts`); `resolveGeoContext` uses the polygon first, then `countryHint`, then the old bbox fallback. Recomputation on `huts.json` (only the `location.country` field): IT->IT 3026, IT->CH 766, IT->AT 551, IT->FR 638, IT->SI 77, IT->HR 18, IT->BA 2, NO->NO 122, NO->null 4 (sea/polygon hole: kept NO). Limits: the ~200 m simplification can get the country wrong for a hut less than ~200 m from the border; region/province/municipality of the now-foreign huts stay those already in the file (for outside Italy they were null, not recomputed). Natural Earth is in the attribution registry.

### New regions (2026-10-31)

Added alps-fr-w, alps-fr-s, alps-ch-n, alps-at-n, alps-at-e, pyrenees, tatra. The Alpine ones complement `alps-it` (which already reaches into CH/FR/AT/SI up to 47.2 N): non-overlapping rectangles, so no duplicate queries and the nearest-peak search (first region containing the point) does not change for the huts already present. Config test: unique ids, valid bboxes, no overlap except alps-it/apennines (pre-existing). `fetchOsmAll` now deduplicates by `externalId`. The region's `country` is only a hint (the polygon wins). Limit: a hut near the edge of a region may not see peaks of the neighbouring region (3 km radius), as before. `huts.json` not regenerated (Overpass not reachable from here).

### Known gaps in the current code

- **Visits / "chi c'è stato" feature**: the code is there (migration `migrations/0001_visits.sql`,
  API `src/pages/api/visits.ts` and `api/moderation/visits.ts`, logic in `src/lib/visits.ts`, form and
  list in the hut page), but it is not active: the D1 database is missing, as are the binding in `wrangler.jsonc`
  (today only in a comment) and the secrets `IP_SALT` and `MODERATION_TOKEN`. Without the binding the API answers
  `{enabled:false}` and the page still shows the placeholder "Presto potrai…". Steps in the README, "Visits" section.
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

- **Attribution page data (done)**: the list lives in `scripts/sources/attribution.ts` (key = the scraper's `sourceName`), read by `attribution.astro`; `attribution.test.ts` fails if a scraper has no entry or if an entry without a scraper is not marked `retired`. Three entries (CAI Bergamo, Abitare l'Estremo, Parco delle Orobie Valtellinesi) no longer have a module (absorbed by `cai.ts`) but stay visible, marked `retired`. No license field: no module declares one. Done afterwards (2026-10-31): hut counter per source (computed at build time from huts.json with `src/lib/source-counts.ts`, a hut counts once per source; 0 for retired sources or sources without huts) and `seedDataNote` replaced by `datasetNote` (number of huts read from huts.json, no claim about completeness).
- **Lockfile re-synced (2026-10-31)**: `npm ci` was failing because `package-lock.json` was not aligned with `package.json` (the optional `@emnapi/core` and `@emnapi/runtime` were missing). `npm install` with no new dependencies or bumps: ~30-line diff, `npm ci` now works. The registry's `license` field is optional and set only for osm/wikidata/wikipedia (verified licenses); pipeline sources are listed in `PIPELINE_SOURCES`. Map attribution not touched: the footer already cites OSM and the OpenFreeMap style carries its own.

### Notes/feedback widget (done 2026-10-24)

Floating "Nota" button at the bottom right (above the legend) on all pages, in it/en (`notes.*` keys in the dictionaries). It opens a panel with a textarea (max 2000 characters), sends a JSON `POST` `{text, page, context, website}` to `site-notes` (`/mountain-huts-map/notes`); `website` is the hidden honeypot field. Button disabled while sending, success/error states, Escape closes. Code: `src/components/NoteWidget.astro`, pure logic (payload) in `src/lib/notes.ts` with tests. `context` = `lang=…; hut=<slug>` (only on hut pages) `; filters=<query string>`: the map filters are already in the URL, so no refactor. Limits: the hut selected in the map's bottom sheet is not in the context (only the slug on detail pages); notes do not go through localStorage, so if sending fails the text stays in the textarea but is not saved elsewhere.

### Who has been there: design choices (2026-11-07)

No design document in `docs/` (it does not exist): choices are mine. Astro API routes with `prerender = false` on the same Worker (no separate Worker); the hut pages stay static and load visits client-side from `/api/visits?hut=<slug>`. The hut is identified by its slug (there is no stable numeric id) and is not checked against `huts.json` to avoid loading 5000 huts into the Worker: visits on nonexistent slugs stay `pending` and are discarded in moderation. The GET always answers 200 with `{enabled:false}` if the binding is missing, so the browser logs no network errors. The POST without binding answers 503. Honeypot `website` with fake success; limit of 3 submissions per hashed IP (SHA-256 of `IP_SALT:ip`) every 24 h, counted in D1 on the table itself (no extra KV/Durable Object); month with `YYYY-MM` precision; text 10-1000 characters, name max 40; user text is always inserted with `textContent`. Moderation with a bearer token (constant-time comparison, rejects secrets < 16 characters), curl only, no UI. The D1 binding is not active in `wrangler.jsonc` because it requires a real `database_id`: it sits in a comment. The `cloudflare:workers` type is declared by hand in `src/env.d.ts` because `wrangler types` does not generate types here. Not tried on a real D1 (no remote wrangler command run): only the pure logic (vitest) and the page without backend and with a simulated API (Playwright) were tested. In dev, a `POST` from curl without an `Origin` header gets 403 from Astro's CSRF check (it does not happen from the browser).

## Log
- 2026-11-21: 🤖 ROADMAP translated to English (language rule: projects in English or bilingual EN/IT). 🤖 diagnosis of the failed monthly refresh (PR not creatable because of the Actions setting; Overpass 502/429 on peaks and mountain ranges): retry+mirror in `geocode-admin.ts`, non-fatal PR step, timeout; workflow rerun
- 2026-11-07: 🤖 "who has been there" feature (code): D1 migration, submit/read/moderation API, form and list in the hut page, and tests; the D1 still has to be created and the secrets set 🤖 another 18 European regions in `regions.config.ts` (Balkans, Carpathians, Spain, Corsica, Scandinavia, Scotland) without overlaps, with tests; data at the next refresh
- 2026-11-06: notes widget with local queue: if site-notes does not answer, the note stays in localStorage (`site-notes.pending`) and is resent at the next load. canonical notes widget v2 (public/notes-widget.js, language it/en) in place of NoteWidget.astro and notes.ts (migrates site-notes.pending); removed the notes.* dictionary keys.
- 2026-10-31: 🤖 new regions (Alps FR/CH/AT, Pyrenees, Tatra) in `regions.config.ts` with config test and dedup by OSM id; data to regenerate with the refresh
- 2026-10-31: 🤖 fixed the country of the huts (assigned by Natural Earth polygon instead of the region's bbox): ~2050 foreign huts are no longer marked IT; `huts.json` updated only in the country field
- 2026-10-31: 🤖 monthly workflow `data-refresh-monthly.yml` (refresh + test + PR on `data/refresh`); the Actions setting is needed to create PRs
- 2026-10-31: 🤖 investigation of the complete dataset: `huts.json` is already real (5204 huts, IT + Bergen); fixed the obsolete "test phase" text in /about and README; subtasks for regions, refresh with ut.no and monthly workflow
- 2026-10-31: 🤖 attribution page: hut counter per source computed at build time and updated dataset note (the old note about the test set was obsolete); added the osm/wikidata/wikipedia entries (with license) and a test that every source in huts.json has an entry; restored `package-lock.json` (`@emnapi/*` were missing, `npm ci` was failing)
- 2026-10-24: 🤖 notes/feedback widget towards site-notes
- 2026-10-20: 🤖 data-driven attribution page: list of sources in `scripts/sources/attribution.ts`, with a test comparing it to the scrapers
- 2026-10-19: decided the notes backend: the shared `site-notes`; installable as a standalone app from the phone (manifest with its own name, icon and scope)
- 2026-10-19: fixed the site address (canonical and sitemap pointed to a nonexistent domain); no production domain; GitHub Pages turned off
- 2026-10-18: FUTURE-ARCHITECTURE.md merged into ROADMAP.md (single protocol); new ut.no (DNT) source for Norwegian huts: beds, service level, operator, phone, booking link
- 2026-10-15: created the roadmap for Projects Overview
