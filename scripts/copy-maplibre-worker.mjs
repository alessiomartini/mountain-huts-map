// MapLibre's worker.mjs does a plain relative import of its own
// maplibre-gl-shared.mjs sibling at runtime. Vite has no way to see that
// (it's inside a pre-built file, not source it parses), so copying just the
// worker via a `?url` import leaves the shared chunk missing and the worker
//404s in the browser. Serving both, unhashed, side by side from public/ —
// exactly as they ship in the package — keeps that relative import intact.
// Runs on `npm install` so this stays in sync with the installed version
// automatically; the copies themselves are gitignored, not committed.
import { copyFileSync, mkdirSync } from 'node:fs';

const SRC_DIR = 'node_modules/maplibre-gl/dist';
const OUT_DIR = 'public/vendor/maplibre-gl';
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

mkdirSync(OUT_DIR, { recursive: true });
for (const file of FILES) {
  copyFileSync(`${SRC_DIR}/${file}`, `${OUT_DIR}/${file}`);
}
console.log(`Copied ${FILES.join(', ')} to ${OUT_DIR}/`);
