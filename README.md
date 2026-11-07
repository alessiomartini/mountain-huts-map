# mountain-huts-map

A map of alpine huts and bivouacs (`bivacco` / `rifugio`), starting from the
Italian Alps and the Bergen (Norway) area, built so new regions are a
one-line config change rather than a refactor.

Status: test phase, deployed at <https://mountain-huts-map.alemarti-2001.workers.dev>. The data
pipeline, map UI (MapLibre, filters, hut detail pages), and i18n (it/en) are
built and live with a real dataset (OSM, Wikidata, CAI) covering the Italian
Alps and Apennines and the Bergen area; other European regions are still to be added. The "chi c'è stato" (visits) feature is coded but
not live until the D1 database is created — see "Visits" below and `ROADMAP.md`.

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

## Visits (chi c'è stato)

Visitors can share a short experience on a hut page. Submissions are stored as
`pending` in Cloudflare D1 and only shown once approved. Until the D1 binding
exists the API answers `{"enabled":false}` and the hut page keeps the
"coming soon" note (no errors).

Code: `migrations/0001_visits.sql`, `src/lib/visits.ts` (validation, IP hash, rate limit, token check; tests in `visits.test.ts`),
`src/pages/api/visits.ts` (public), `src/pages/api/moderation/visits.ts` (bearer token).

Rules: text 10-1000 chars, optional month (`YYYY-MM`, not in the future) and display name (max 40),
hidden honeypot field `website`, max 3 submissions per hashed IP per 24 h. The IP is stored only as
SHA-256(`IP_SALT`:ip). User text is rendered with `textContent` (never as HTML).

### Setup (to do once, by the owner)

```sh
npx wrangler d1 create mountain-huts-visits          # prints a database_id
# add the d1_databases block (see the comment in wrangler.jsonc) with that id
npx wrangler d1 migrations apply mountain-huts-visits --remote
npx wrangler secret put IP_SALT                      # any long random string
npx wrangler secret put MODERATION_TOKEN             # any long random string (>= 16 chars)
npm run deploy
```

Local dev: `npx wrangler d1 migrations apply mountain-huts-visits --local`, and put `IP_SALT=...` and
`MODERATION_TOKEN=...` (fake values) in `.dev.vars`.

### Moderation (curl)

```sh
BASE=https://mountain-huts-map.alemarti-2001.workers.dev
TOKEN=...   # the MODERATION_TOKEN secret
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/moderation/visits"                 # list pending (?status=approved|rejected)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"id":1,"status":"approved"}' "$BASE/api/moderation/visits"                   # or "rejected"
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

## Monthly data refresh

`.github/workflows/data-refresh-monthly.yml` runs `npm run data:refresh` and the tests on the 1st of each month (or manually) and opens/updates a PR from `data/refresh` when `src/data/huts.json` changes. The repo setting "Allow GitHub Actions to create and approve pull requests" must be enabled by the owner.
