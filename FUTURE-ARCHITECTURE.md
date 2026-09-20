# FUTURE-ARCHITECTURE.md

Running log of proposed future work and in-progress threads that don't
belong in the README. The goal is to let a new session (after `/init` has
read `CLAUDE.md` for how the codebase works) get up to speed on **what's
being worked on and what's been discussed but not decided**, without
scrolling back through old conversations.

When starting a new session on this project, read this file plus the
README. When a feature described here actually gets implemented, delete
its section (the code + tests + README are the record at that point). When
a new idea comes up in conversation, add a section here instead of letting
it live only in chat history.

## In progress / next up

### New data sources: refuges.info and UK/Scotland bothies

Both approved by the user as good candidates, not yet implemented as
`SiteScraper`s. Order between them not yet decided.

- **refuges.info** (French Alps + beyond) — has a real API, confirmed
  working from a live test this session:
  - Default response (no `format` param) is clean GeoJSON — use this for
    listing.
  - `format=xml` works for hut detail (`/api/point?id=X`).
  - `format=json` is **not** supported — returns an empty 0-byte body.
    Don't waste time debugging this if it's tried again; just use the
    default GeoJSON or `format=xml`.
  - Next step: write `scripts/sources/refuges-info.ts` implementing
    `SiteScraper` per the pattern in `scripts/sources/cai.ts`.
- **UK / Scotland — Mountain Bothies Association** — no official API, needs
  unofficial scraping. Approved by the user. Not started.
- **Finnish source evaluated and rejected**: the Finnish server checked
  this session does not have bivacco/rifugio-equivalent data — not worth a
  scraper.

Both should follow the existing contract: never throw, return `[]` with a
console warning on any failure (see `scripts/lib/scraper-base.ts` and
`scripts/sources/README.md`).

## Proposed features (discussed, not decided, not started)

### "Chi è stato qui" (who's-been-here / visit log)

Currently an intentional "coming soon" placeholder in the UI — not a bug.
Two implementation directions were discussed, no decision made:

1. **localStorage-only**: per-device, no backend, no accounts. Simple, but
   doesn't sync across devices and doesn't let a user see who *else* has
   been there (defeats part of the point of the feature).
2. **Full account-based**: real auth + a backend table (the existing
   Cloudflare D1 binding, currently reserved for the Phase 5 visits log,
   could carry this). Cross-device, supports the "who else" angle, but is
   a much bigger build (auth, moderation, abuse prevention).

Needs a decision from the user before either is started.

### Wild / free-camping zones (bivacco libero, campeggio libero)

Flagged as a good future feature, explicitly deferred by the user
("non è il momento" — do not start this without being asked again).

Important: this is **not** just another hut source. Huts/bivacchi are
points; camping zones are areas. This needs:
- A new schema (polygon/area geometry, not `lat`/`lon`), separate from
  `HutSchema` — likely a new top-level data file, not a new `category` in
  `hut-schema.ts`.
- A new map layer (MapLibre fill/line layer, not the existing marker/
  clustering layer).
- [campcompass.eu](https://campcompass.eu) was identified as the most
  relevant candidate data source when this is picked up.

### Scaling to worldwide coverage

Not urgent, just a noted tripwire: hut detail pages are statically
prerendered (`src/pages/[lang]/hut/[slug].astro`, no
`export const prerender = false`). This is fine at the current scale
(5204 records × 2 languages). If the dataset ever expands to global
coverage, prerendering every hut page in every language may become slow
enough at build time that switching that route to on-demand SSR
(`export const prerender = false`, same opt-out already used for the
visits API) becomes worth it. Revisit if `npm run build` times start
climbing, not before.

### More regions

`scripts/regions.config.ts` is deliberately built so adding a region is
one array entry (bbox + country code), nothing else in the pipeline should
need to branch on region id. Candidates noted in that file's comment but
not scheduled: `alps-fr`, `alps-ch`, `alps-at`, `pyrenees`, `tatra`.

## Resolved (kept here briefly as decision record, remove once stale)

- Markers vanishing on the topo map style — was a real bug (MapLibre's
  `map.setStyle()` wipes runtime-added images/sources/layers), fixed by
  reloading icons and recreating layers on every style switch.
- Peaks ("vette") already show on the topo map style natively — no extra
  data/layer needed for that; the ask that prompted this was really about
  huts/bivacchi disappearing on that style (see above), not missing peaks.
- Cluster radius and marker size/color tuning (visibility, click precision
  on overlapping pins) — settled at a single tunable constant
  (`CLUSTER_RADIUS_PX` in the map client), current value 9px, blue/red
  marker colors for rifugio/bivacco.
- Overpass 429/504 reliability — fixed with retry-with-backoff plus a
  delayed second pass over failed tiles.
- Wikidata/Wikipedia enrichment slowness — fixed by batching requests
  (~50 items/request instead of one at a time), cut a ~51-minute pipeline
  step down to a few minutes.
