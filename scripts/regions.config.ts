// Geographic areas covered by the data pipeline. Adding a region should be
// exactly this: one more entry. Nothing else in the pipeline branches on
// region id, only on the bbox and (for classification/service_level) on the
// raw OSM tags, which is why Norway's DNT betjent/selvbetjent/ubetjent
// distinction lives in `service_level` rather than a country-specific code path.
import type { BBox } from './lib/geo.ts';

export interface Region {
  id: string;
  name: string;
  /** [south, west, north, east] — same order Overpass expects for a bbox filter. */
  bbox: BBox;
  /** ISO-3166-1 alpha-2. Every hut found in this bbox is assumed to be in this country. */
  country: string;
}

export const REGIONS: Region[] = [
  { id: 'alps-it', name: 'Alpi italiane', bbox: [44.0, 6.0, 47.2, 13.9], country: 'IT' },
  { id: 'apennines', name: 'Appennini', bbox: [37.9, 9.5, 44.5, 16.5], country: 'IT' },
  { id: 'bergen', name: 'Bergen / Vestland', bbox: [59.5, 4.5, 62.0, 8.5], country: 'NO' },
  // future: alps-fr, alps-ch, alps-at, pyrenees, tatra, ...
];
