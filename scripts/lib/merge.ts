// Field-level merge for one cluster of RawCandidates (i.e. one real-world
// hut, already grouped by cluster.ts). Precedence order per spec §2.2-bis:
// overrides.json > OSM (coords) > CAI > abitarelestremo/diska > Wikidata > Wikipedia,
// generalized via SOURCE_PRECEDENCE for every other field. overrides.json
// itself is applied later in build-dataset.ts, after this merge and after
// the final `id` is known.
import { precedenceOf, type RawCandidate } from './source-record.ts';
import { classifyByNameOnly } from './classify.ts';
import type {
  Category,
  CategoryConfidence,
  Facilities,
  Link,
  Photo,
  Price,
  ServiceLevel,
} from '../../src/lib/hut-schema.ts';
import type { LangCode } from './source-record.ts';

const ELEVATION_CONFLICT_THRESHOLD_M = 50;

export interface MergedFields {
  name: string;
  namesByLang: Partial<Record<LangCode, string>>;
  category: Category;
  osm_type: string | null;
  category_confidence: CategoryConfidence;
  service_level: ServiceLevel;
  coords: { lat: number; lon: number };
  elevation_m: number | null;
  capacity: number | null;
  operator: string | null;
  price: Price;
  facilities: Facilities;
  access: { opening_hours: string | null; access_note_it: string | null; access_note_en: string | null };
  contact: { phone: string | null; email: string | null; website: string | null };
  description: { it: string | null; en: string | null };
  photos: Photo[];
  links: Link[];
  sources: Array<{ name: string; url: string; fetched_at: string }>;
  verified: boolean;
  reviewReasons: string[];
  countryHint: string | null;
  mountainGroupHint: string | null;
  primaryExternalId: string | null;
  isScraperOnly: boolean;
}

export type MergeResult = { ok: true; record: MergedFields } | { ok: false; reason: string };

function sortByPrecedenceDesc(candidates: RawCandidate[]): RawCandidate[] {
  return [...candidates].sort((a, b) => precedenceOf(b.sourceName) - precedenceOf(a.sourceName));
}

/** First non-null/undefined value, scanning candidates highest-precedence first. */
function pick<T>(sorted: RawCandidate[], getter: (c: RawCandidate) => T | null | undefined): T | null {
  for (const c of sorted) {
    const v = getter(c);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.url)) seen.set(item.url, item);
  return [...seen.values()];
}

export function mergeCluster(candidates: RawCandidate[]): MergeResult {
  const sorted = sortByPrecedenceDesc(candidates);
  const reviewReasons = new Set<string>();
  for (const c of candidates) for (const r of c.reviewReasons ?? []) reviewReasons.add(r);

  const name = pick(sorted, (c) => c.name) ?? candidates[0].name;

  let category = pick(sorted, (c) => c.category);
  let category_confidence = pick(sorted, (c) => c.categoryConfidence) ?? 'low';
  if (!category) {
    const fallback = classifyByNameOnly(name);
    if (!fallback) return { ok: false, reason: `no source provided a category and the name "${name}" gives no clue either` };
    category = fallback;
    category_confidence = 'low';
    reviewReasons.add(`category inferred from name only ("${fallback}"), no OSM tag or Wikipedia category backed it`);
  }

  // Coordinates: OSM wins whenever present (spec §2.2-bis), otherwise highest precedence.
  const osmCoords = candidates.find((c) => c.sourceName === 'osm' && c.coords)?.coords;
  const coords = osmCoords ?? pick(sorted, (c) => c.coords);
  if (!coords) return { ok: false, reason: 'cluster has no candidate with coordinates (should not happen post-filter)' };

  const elevationCandidates = candidates
    .map((c) => ({ sourceName: c.sourceName, value: c.elevationM }))
    .filter((c): c is { sourceName: string; value: number } => c.value != null);
  const elevation_m = pick(sorted, (c) => c.elevationM);
  if (elevation_m != null) {
    for (const ec of elevationCandidates) {
      if (Math.abs(ec.value - elevation_m) > ELEVATION_CONFLICT_THRESHOLD_M) {
        reviewReasons.add(
          `elevation conflict: chosen ${elevation_m}m, "${ec.sourceName}" says ${ec.value}m (diff > ${ELEVATION_CONFLICT_THRESHOLD_M}m)`,
        );
      }
    }
  }

  const namesByLang: Partial<Record<LangCode, string>> = {};
  const ascendingPrecedence = [...candidates].sort((a, b) => precedenceOf(a.sourceName) - precedenceOf(b.sourceName));
  for (const c of ascendingPrecedence) {
    // Lowest precedence first so a higher-precedence source overwrites, same rule as scalar fields.
    Object.assign(namesByLang, c.namesByLang);
  }

  const facilityKeys: Array<keyof Facilities> = ['fireplace', 'stove', 'drinking_water', 'blankets', 'toilet', 'winter_room'];
  const facilities = Object.fromEntries(
    facilityKeys.map((key) => [key, pick(sorted, (c) => c.facilities?.[key])]),
  ) as Facilities;

  const pickedPrice = pick(sorted, (c) => c.price);
  const UNKNOWN_PAID_PRICE: Price = {
    type: 'paid',
    currency: null,
    night_from: null,
    night_to: null,
    half_board_from: null,
    cai_member_discount: null,
    source_url: null,
    checked_on: null,
  };
  let price: Price;
  if (category === 'bivacco') {
    // Bivacchi default free; an explicit fee=yes is respected, not overridden, but flagged (spec §2.4).
    if (pickedPrice?.type === 'paid') {
      price = pickedPrice;
      reviewReasons.add('bivacco with a paid price (OSM fee=yes) — verify, bivacchi default to free');
    } else {
      price = { type: 'free' };
    }
  } else {
    // Rifugi are assumed staffed/paid by default (the UI just shows "a pagamento" with
    // no numbers) unless a source explicitly says otherwise; never invent actual figures.
    price = pickedPrice ?? UNKNOWN_PAID_PRICE;
  }

  const photos = dedupeByUrl(candidates.flatMap((c) => c.photos ?? []));
  const links = dedupeByUrl(candidates.flatMap((c) => c.links ?? []));

  const sourcesByUrl = new Map<string, { name: string; url: string; fetched_at: string }>();
  for (const c of candidates) {
    if (!sourcesByUrl.has(c.sourceUrl)) sourcesByUrl.set(c.sourceUrl, { name: c.sourceName, url: c.sourceUrl, fetched_at: c.fetchedAt });
  }
  const sources = [...sourcesByUrl.values()];

  const distinctSourceNames = new Set(candidates.map((c) => c.sourceName));
  const hasAuthoritativeSource = candidates.some((c) => c.sourceName === 'osm' || c.sourceName === 'wikidata' || c.verified === true);
  const verified = hasAuthoritativeSource || distinctSourceNames.size >= 2;
  const isScraperOnly = !hasAuthoritativeSource && [...distinctSourceNames].every((s) => s !== 'osm' && s !== 'wikidata' && s !== 'wikipedia');

  const primaryExternalId = pick(sorted, (c) => (c.sourceName === 'osm' ? c.externalId : null)) ?? pick(sorted, (c) => c.externalId);

  return {
    ok: true,
    record: {
      name,
      namesByLang,
      category,
      osm_type: pick(sorted, (c) => c.osmType),
      category_confidence,
      service_level: pick(sorted, (c) => c.serviceLevel) ?? 'unknown',
      coords,
      elevation_m,
      capacity: pick(sorted, (c) => c.capacity),
      operator: pick(sorted, (c) => c.operator),
      price,
      facilities,
      access: {
        opening_hours: pick(sorted, (c) => c.access?.opening_hours),
        access_note_it: pick(sorted, (c) => c.access?.access_note_it),
        access_note_en: pick(sorted, (c) => c.access?.access_note_en),
      },
      contact: {
        phone: pick(sorted, (c) => c.contact?.phone),
        email: pick(sorted, (c) => c.contact?.email),
        website: pick(sorted, (c) => c.contact?.website),
      },
      description: {
        it: pick(sorted, (c) => c.descriptionIt),
        en: pick(sorted, (c) => c.descriptionEn),
      },
      photos,
      links,
      sources,
      verified,
      reviewReasons: [...reviewReasons],
      countryHint: pick(sorted, (c) => c.countryHint),
      mountainGroupHint: pick(sorted, (c) => c.mountainGroupHint),
      primaryExternalId,
      isScraperOnly,
    },
  };
}
