// Common currency between every data source (OSM, Wikidata/Wikipedia, the
// per-site scrapers) and build-dataset.ts, which is the only place that
// does entity resolution (clustering candidates that describe the same
// real-world hut) and field-level precedence. No source module talks to
// another source module directly.
import type {
  Category,
  CategoryConfidence,
  Facilities,
  Link,
  Photo,
  Price,
  ServiceLevel,
} from '../../src/lib/hut-schema.ts';

export type LangCode = 'it' | 'en' | 'no' | 'de' | 'fr';

export interface RawCandidate {
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;

  /** Present for sources with a stable external id (OSM node/way, Wikidata QID). */
  externalId?: string;
  /** OSM `wikidata` tag value, when present — lets enrich-wikidata.ts find what to enrich. */
  wikidataQid?: string;
  /** Wikidata P706 (located in/on physical feature) label, when resolvable — a mountain_group hint. */
  mountainGroupHint?: string;
  /** ISO-3166-1 alpha-2, known for certain because the source region query is country-homogeneous. */
  countryHint?: string;

  name: string;
  namesByLang?: Partial<Record<LangCode, string>>;

  category?: Category | null;
  osmType?: string | null;
  categoryConfidence?: CategoryConfidence;
  serviceLevel?: ServiceLevel;

  coords?: { lat: number; lon: number } | null;
  /** True when this candidate has no usable coordinates at all (goes to candidates-no-coords.csv, not the dataset). */
  noCoords?: boolean;

  elevationM?: number | null;
  capacity?: number | null;
  operator?: string | null;
  price?: Price | null;
  facilities?: Partial<Facilities>;
  access?: {
    opening_hours?: string | null;
    access_note_it?: string | null;
    access_note_en?: string | null;
  };
  contact?: {
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  };
  descriptionIt?: string | null;
  descriptionEn?: string | null;
  photos?: Photo[];
  links?: Link[];

  /** Facts-only source explicitly vouches this record (OSM, Wikidata always do). */
  verified?: boolean;
  /** Reasons this candidate should be looked at by a human; feeds needs-review.csv. */
  reviewReasons?: string[];
  /** Scraper-only candidate with no corroboration elsewhere; feeds unverified.csv/verified:false. */
  scraperOnly?: boolean;
}

// Higher wins when two candidates in the same cluster disagree on a field.
// Coordinates are a special case (OSM wins whenever present) per spec §2.2-bis;
// everything else uses this general ranking.
export const SOURCE_PRECEDENCE: Record<string, number> = {
  overrides: 100,
  osm: 90,
  cai: 80,
  abitarelestremo: 70,
  diska: 70,
  caibergamo: 65,
  parcorobievalt: 60,
  paesidivaltellina: 60,
  hikesoftheworld: 60,
  wikidata: 50,
  wikipedia: 40,
};

export function precedenceOf(sourceName: string): number {
  return SOURCE_PRECEDENCE[sourceName] ?? 0;
}

export function hasCoords(c: RawCandidate): c is RawCandidate & { coords: { lat: number; lon: number } } {
  return c.coords != null;
}
