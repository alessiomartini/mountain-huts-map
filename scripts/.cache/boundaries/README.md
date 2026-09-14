# Admin boundary files (manual, one-time download)

`geocode-admin.ts` does region/province/municipality lookups by local
point-in-polygon against these files. They're too large and slow-changing
to fetch per-run, so they're not part of `npm run data:refresh` — download
them once and place them here (gitignored, like the rest of `scripts/.cache/`):

| File | Source | Level |
|---|---|---|
| `istat-regioni.geojson` | ISTAT administrative boundaries (Confini delle unità amministrative) | Italian regions |
| `istat-province.geojson` | same ISTAT dataset | Italian provinces |
| `istat-comuni.geojson` | same ISTAT dataset | Italian municipalities |
| `kartverket-fylker.geojson` | Kartverket (Norwegian Mapping Authority) administrative boundaries | Norwegian fylker |
| `kartverket-kommuner.geojson` | same Kartverket dataset | Norwegian kommuner |

Each must be a GeoJSON `FeatureCollection` of `Polygon`/`MultiPolygon`
features with a `properties` field holding a human-readable name — see the
`nameProperty` per source in `scripts/geocode-admin.ts` (`BOUNDARY_SOURCES`).
If a provider uses different property keys, update that constant to match
rather than renaming the file.

Missing a file is not an error: that admin level just comes back `null` for
every hut until you add it, which is why `npm run data:refresh` never fails
on its absence.
