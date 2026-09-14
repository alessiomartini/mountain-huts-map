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
silently mis-scrape, but **the first real `npm run data:refresh` run
against the live internet will very likely need some selector adjustments**
— check the console warnings after that run for which scrapers came back
empty and why, then fix the selector in that file. `cai.ts` and
`caibergamo.ts` are the most exploratory (they try to detect a JSON/GeoJSON
API endpoint rather than parse HTML) and most likely to need a manual look
at the live page's network tab to find the real data URL.
