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
  // The Alpine regions below are the complement of `alps-it` (which already reaches into
  // CH/FR/AT/SI up to 47.2 N and 6.0-13.9 E): rectangles that do not overlap it or each other,
  // so nothing is fetched twice. `country` is only a hint: the real country is assigned by
  // polygon (scripts/lib/country.ts).
  { id: 'alps-fr-w', name: 'Alpi francesi (ovest)', bbox: [44.0, 4.8, 46.6, 6.0], country: 'FR' },
  { id: 'alps-fr-s', name: 'Alpi Marittime e Mercantour', bbox: [43.5, 6.0, 44.0, 7.8], country: 'FR' },
  { id: 'alps-ch-n', name: 'Alpi svizzere (nord)', bbox: [47.2, 6.0, 47.9, 10.6], country: 'CH' },
  { id: 'alps-at-n', name: 'Alpi austriache (nord)', bbox: [47.2, 10.6, 48.0, 13.9], country: 'AT' },
  { id: 'alps-at-e', name: 'Alpi austriache (est)', bbox: [46.2, 13.9, 48.2, 16.6], country: 'AT' },
  { id: 'pyrenees', name: 'Pirenei', bbox: [42.2, -2.0, 43.3, 3.2], country: 'FR' },
  { id: 'tatra', name: 'Tatra', bbox: [49.0, 19.5, 49.4, 20.5], country: 'PL' },
];
