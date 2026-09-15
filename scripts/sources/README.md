# scripts/sources/

One scraper per site (spec §2.2-bis), all implementing `SiteScraper` from
`types.ts`. Every scraper is wrapped in `run()` and never throws — a broken
selector logs a warning and yields 0 candidates for that source, it never
fails the pipeline (see `scripts/lib/scraper-base.ts` and the per-file
warnings for exactly what "0 candidates" means in each case: page
unreachable, robots.txt disallowed, or reached the page but found nothing
matching the expected structure).

**Important caveat:** this session's network egress is restricted to an
allowlist (npm/GitHub/etc.) and cannot reach any of these sites, so the
selectors and API-detection heuristics here were written from the site
descriptions in the project spec, not from live markup. They're built to
degrade safely (return `[]` with a clear warning) rather than crash or
silently mis-scrape, but **a live `npm run data:refresh` run against the
real internet may still need selector adjustments** — check the console
warnings for which scrapers came back empty and why, then fix the selector
in that file.

`abitarelestremo.ts`, `caibergamo.ts` and `parcorobievalt.ts` were removed
after the first live run confirmed all three either 404'd or no longer
matched any expected page structure, and their coverage is already
superseded by `cai.ts`'s real API (`https://rifugi.cai.it/api/v1/shelters`,
discovered via `https://rifugi.cai.it/docs/api-docs.json`'s OpenAPI spec —
762 shelters, no auth required).
