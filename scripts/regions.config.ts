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
  // Further European mountain ranges (2026-11-07). Same rule: rectangles that overlap neither the
  // regions above nor each other. Already covered, so deliberately not added: the Dolomites and the
  // Julian Alps' western half (inside `alps-it`), the Apuan Alps, Gran Sasso and the rest of the
  // Apennine arc (inside `apennines`). Corsica stops at 9.5 E so as not to touch `apennines`.
  { id: 'alps-si', name: 'Slovenia e Alpi Giulie orientali', bbox: [45.4, 13.9, 46.2, 16.5], country: 'SI' },
  { id: 'croatia-w', name: 'Croazia occidentale (Velebit, Gorski Kotar)', bbox: [44.5, 13.9, 45.4, 16.5], country: 'HR' },
  { id: 'dinaric', name: 'Alpi Dinariche (Bosnia, Montenegro, Serbia ovest)', bbox: [42.0, 16.5, 45.4, 20.5], country: 'BA' },
  { id: 'balkans-sw', name: 'Albania, Macedonia, Pindo', bbox: [39.5, 19.5, 42.0, 22.0], country: 'AL' },
  { id: 'bulgaria', name: 'Bulgaria (Rila, Pirin, Balcani)', bbox: [41.0, 22.0, 43.6, 26.5], country: 'BG' },
  { id: 'carpathians-sk', name: 'Carpazi slovacchi (Fatra, Tatra Basse)', bbox: [48.4, 17.0, 49.4, 19.5], country: 'SK' },
  { id: 'carpathians-ro-n', name: 'Carpazi rumeni (nord)', bbox: [46.5, 22.0, 48.0, 26.5], country: 'RO' },
  { id: 'carpathians-ro-s', name: 'Carpazi meridionali (Retezat, Fagaras, Bucegi)', bbox: [44.8, 22.0, 46.5, 26.5], country: 'RO' },
  { id: 'picos', name: 'Cantabrica e Picos de Europa', bbox: [42.4, -7.0, 43.3, -4.0], country: 'ES' },
  { id: 'gredos', name: 'Gredos e Guadarrama', bbox: [40.1, -6.5, 41.1, -3.5], country: 'ES' },
  { id: 'sierra-nevada', name: 'Sierra Nevada', bbox: [36.7, -3.8, 37.4, -2.4], country: 'ES' },
  { id: 'corsica', name: 'Corsica', bbox: [41.3, 8.5, 43.1, 9.5], country: 'FR' },
  { id: 'norway-c', name: 'Norvegia centrale (Jotunheimen est, Rondane, Hardangervidda est)', bbox: [59.5, 8.5, 62.0, 12.5], country: 'NO' },
  { id: 'norway-m', name: 'Norvegia (Romsdal, Trollheimen, Dovrefjell)', bbox: [62.0, 5.0, 63.5, 12.5], country: 'NO' },
  { id: 'norway-arctic', name: 'Norvegia artica (Narvik, Lofoten, Lyngen)', bbox: [67.0, 12.0, 70.0, 16.0], country: 'NO' },
  { id: 'sweden-w', name: 'Svezia (Jämtland, Åre)', bbox: [62.5, 12.5, 64.5, 14.8], country: 'SE' },
  { id: 'sweden-n', name: 'Svezia settentrionale (Kebnekaise, Sarek, Kungsleden)', bbox: [66.5, 16.0, 68.7, 19.5], country: 'SE' },
  { id: 'scotland', name: 'Highlands scozzesi', bbox: [56.0, -6.5, 58.7, -3.0], country: 'GB' },
];
