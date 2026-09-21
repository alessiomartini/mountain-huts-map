# Future architecture / roadmap

This file tracks features that are planned but not implemented, so a new
session can see what's next without guessing. It reflects the actual code as
of 2026-09-21, not the (currently stale-sounding) "scaffolding only" line
that used to be in the README — the map, hut detail pages, filters, i18n,
and data pipeline are built and deployed; see README.md for what's live.

## Known gaps in the current code

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
- **Production domain**: `astro.config.mjs` has a `TODO: replace with the
  real production domain once one exists` — the site currently only has the
  `mountain-huts-map.workers.dev` default.
- **Attribution page data**: README says `/attribution` is "the canonical
  list" of source licenses; confirm it's kept in sync as new sources are
  added in `scripts/sources/`.

## Planned: user note / feedback widget

Not started. Idea: let visitors leave a short free-text note (general site
feedback, not per-hut) via a small widget, in the same spirit as the
"chi c'è stato" feature but simpler (no moderation UI, no per-hut
association needed for a first version).

**Ground rule: notes must never be stored only in the visitor's browser
(localStorage) — they need to reach Alessio.** They must be persisted in
Cloudflare D1 from the start, written through a Cloudflare Worker API route
(this project deploys to Cloudflare Workers already, so no new hosting is
needed — see `astro.config.mjs` / `wrangler.jsonc`).

**When to build this**: after the visits/D1 backend (Phase 5) lands, or
alongside it — not now. Building the note-storage plumbing twice (once for
notes, once for visits) is wasted work; if both are needed around the same
time, design one D1 schema/worker that serves both.

**Open decision: dedicated D1 vs. shared D1 across Alessio's sites.**

- **Option A — dedicated D1 for mountain-huts-map.** Same pattern Alessio
  already uses in `ear-training`, `geopolitics-atlas`, `eating-amsterdam`,
  and `markets-first-principles`: one D1 database bound to this Worker only.
  Simplest schema (`notes(id, text, created_at, ...)`, no `site` column
  needed), and a bug in this site's worker/schema can't affect any other
  site. Slightly more Cloudflare resources to manage (one more D1 database,
  one more binding) as the number of sites grows.

- **Option B — one shared D1 across all of Alessio's sites.** A single
  `notes` table with a `site` column
  (`notes(id, site, page, text, created_at, ...)`) used by every site's
  Worker. Less infrastructure to provision per new site, but couples sites
  together: a bug or migration mistake in the shared worker/schema risks
  breaking note-taking for every site at once, not just this one.

No decision has been made yet — pick whichever pattern Alessio is leaning
toward for his other sites at the time this is built, and stay consistent.

Either way, the rough shape is:

1. D1 table (see schema sketch above, either variant).
2. A Worker route (or Astro server-rendered endpoint, `export const
   prerender = false`, same technique already used by `src/pages/index.astro`
   for its own server logic) that accepts a POST with the note text and
   inserts a row.
3. A small client widget (new Astro/TS component) that POSTs to that route.
   No localStorage involved at any point.
4. Basic abuse mitigation (rate limiting / simple validation) before this is
   public — not designed yet.
