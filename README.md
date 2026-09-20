# mountain-huts-map

A map of alpine huts and bivouacs (`bivacco` / `rifugio`), covering the
Italian Alps/Apennines and the Bergen (Norway) area today, built so new
regions are a one-line config change rather than a refactor.

Status: live, with a real dataset (5204 huts/bivacchi) built by the data
pipeline and deployed to Cloudflare Workers. i18n (it/en) and the map UI
are in place. The visits backend ("chi è stato qui") is not built yet —
see `FUTURE-ARCHITECTURE.md`. That file also tracks other proposed/future
work; read it alongside this README to see what's in progress.

## Stack

- [Astro](https://astro.build/) with the [`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) adapter, deployed to Cloudflare Workers
- Hut/bivouac detail pages are prerendered statically; only the visits API is server-rendered (`export const prerender = false`)
- [MapLibre GL JS](https://maplibre.org/) for the map
- TypeScript throughout, with [Zod](https://zod.dev/) schemas as the single source of truth for the hut data shape
- Cloudflare D1 for the visits log only (not yet built) — the hut catalog itself is a static, versioned JSON file (`src/data/huts.json`), not a database table

## Local development

Requires Node.js 20+.

```sh
npm install
npm run dev
```

```sh
npm run build     # typecheck + prerender + build the Worker
npm run preview   # preview the built Worker locally
npm run deploy    # build, then `wrangler deploy`
npm test          # run the vitest suite (scripts/ and src/)
```

## Data pipeline

`src/data/huts.json` is generated, not hand-edited — it's produced by
`scripts/build-dataset.ts` (`npm run data:refresh`), which is a completely
separate concern from the website itself and never runs as part of
`npm run build`/`deploy`. It pulls from OpenStreetMap (Overpass), CAI's
API, Wikidata/Wikipedia/Commons for enrichment, and a handful of
site-specific scrapers (`scripts/sources/`), then clusters/merges
candidates for the same real-world hut and validates every record against
the Zod schema (`src/lib/hut-schema.ts`) before writing the file. See
`scripts/sources/README.md` for the scraper contract and
`FUTURE-ARCHITECTURE.md` for sources being added next.

## Licenses & attribution

This project pulls from multiple sources with different licenses; the
`/attribution` page (added when the data pipeline lands) is the canonical
list. In short:

- **OpenStreetMap** data is [ODbL](https://www.openstreetmap.org/copyright) — "© OpenStreetMap contributors" is shown on the map and on `/attribution`.
- **Wikipedia** text is CC BY-SA — any reused extract is cited with a link to the source article.
- **Wikimedia Commons** photos carry per-image licenses — each photo shown on the site displays its author, license, and source URL; unlicensed photos are not used.
- Facts (name, coordinates, elevation, capacity, opening period, phone) drawn from other hut-tracking sites are reused freely; descriptive text is rewritten in original wording and credited with a link, never copied verbatim.

## Safety disclaimer

Bivouacs and huts are in alpine terrain. Information on this site can be
inaccurate or out of date — always verify conditions and opening status
before you go. Responsibility for the trip is the visitor's.
