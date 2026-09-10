# mountain-huts-map

A map of alpine huts and bivouacs (`bivacco` / `rifugio`), starting from the
Italian Alps and the Bergen (Norway) area, built so new regions are a
one-line config change rather than a refactor.

Status: scaffolding only (Phase 1 of the build). Data pipeline, map UI,
i18n, and the visits backend land in later phases.

## Stack

- [Astro](https://astro.build/) with the [`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) adapter, deployed to Cloudflare Workers
- Hut/bivouac detail pages are prerendered statically; only the visits API is server-rendered (`export const prerender = false`)
- [MapLibre GL JS](https://maplibre.org/) for the map (Phase 4)
- TypeScript throughout
- Cloudflare D1 for the visits log only (Phase 5) — the hut catalog itself is a static, versioned JSON file, not a database table

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
```

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
