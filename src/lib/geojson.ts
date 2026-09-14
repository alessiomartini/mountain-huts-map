import type { Hut } from './hut-schema.ts';

export interface HutFeatureProperties {
  id: string;
  slug: string;
  name: string;
  category: Hut['category'];
  elevation_m: number | null;
  free: boolean;
  drinking_water: boolean;
  stove: boolean;
  winter_room: boolean;
  blankets: boolean;
  country: string;
  region: string | null;
  province: string | null;
}

export type HutFeature = GeoJSON.Feature<GeoJSON.Point, HutFeatureProperties>;
export type HutFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, HutFeatureProperties>;

export function hutToFeature(hut: Hut, lang: 'it' | 'en'): HutFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [hut.coords.lon, hut.coords.lat] },
    properties: {
      id: hut.id,
      slug: hut.slug,
      name: hut.names[lang] ?? hut.name,
      category: hut.category,
      elevation_m: hut.elevation_m,
      free: hut.price.type === 'free',
      drinking_water: hut.facilities.drinking_water === true,
      stove: hut.facilities.stove === true,
      winter_room: hut.facilities.winter_room === true,
      blankets: hut.facilities.blankets === true,
      country: hut.location.country,
      region: hut.location.region,
      province: hut.location.province,
    },
  };
}

export function hutsToFeatureCollection(huts: Hut[], lang: 'it' | 'en'): HutFeatureCollection {
  return { type: 'FeatureCollection', features: huts.map((h) => hutToFeature(h, lang)) };
}
