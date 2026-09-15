// rifugi.cai.it — the official CAI shelter database. Discovered via the
// site's own OpenAPI spec at https://rifugi.cai.it/docs/api-docs.json:
// a plain, public, unauthenticated REST API at /api/v1/shelters (762
// shelters at the time of writing), far richer than anything the other
// sources provide (elevation, capacity, owner, contact info, opening
// season, and a couple dozen facility flags per shelter).
//
// Deliberately NOT pulled from this API, by explicit decision:
//   - the shelter manager's personal name/phone/email (the *_management_
//     property fields) — those belong to a private individual, not the
//     institution, and don't belong on a public map. Only `owner` (the
//     institutional operator, e.g. "CAI Sezione di Varallo") is used; the
//     CAI link in `links` covers anyone who wants the rest.
//   - shelter photos (the `media` array) — CAI's own licensing terms for
//     them aren't confirmed yet. Once that's settled, wire them in here.
//
// One list call per ~200 shelters, then one detail call per published
// shelter to get its `fields` (the actual data lives there, not on the
// list item) — roughly 700+ sequential politeFetch calls, so a first,
// uncached run takes on the order of 15-20 minutes. Every subsequent run
// hits the 30-day disk cache instead.
import { cached, THIRTY_DAYS_MS } from '../lib/cache.ts';
import { politeFetch } from '../lib/http.ts';
import { classifyByNameOnly } from '../lib/classify.ts';
import type { SiteScraper } from './types.ts';
import type { RawCandidate } from '../lib/source-record.ts';
import type { Category, CategoryConfidence, ServiceLevel } from '../../src/lib/hut-schema.ts';

const API_BASE = 'https://rifugi.cai.it/api/v1/shelters';
const PER_PAGE = 200;

interface CaiListItem {
  id: number;
  id_cai: number;
  title: string;
  slug: string;
  geo?: { type: 'Point'; coordinates: [number, number] } | null;
  published: boolean;
  deleted_at: string | null;
  altitude_geo: number | null;
}

interface CaiListResponse {
  data: CaiListItem[];
  last_page: number;
}

interface CaiField {
  name: string;
  value: string | number | null;
  data: unknown;
}

interface CaiDetailResponse extends CaiListItem {
  fields: CaiField[];
}

async function fetchListPage(page: number): Promise<CaiListResponse> {
  const url = `${API_BASE}?per_page=${PER_PAGE}&page=${page}`;
  const { data } = await cached('cai-list', url, THIRTY_DAYS_MS, async () => {
    const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`responded ${res.status}`);
    return (await res.json()) as CaiListResponse;
  });
  return data;
}

async function fetchDetail(idCai: number): Promise<CaiDetailResponse | null> {
  const url = `${API_BASE}/${idCai}`;
  try {
    const { data } = await cached('cai-detail', url, THIRTY_DAYS_MS, async () => {
      const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`responded ${res.status}`);
      return (await res.json()) as CaiDetailResponse;
    });
    return data;
  } catch (err) {
    console.warn(`[cai] Failed to fetch detail for id_cai ${idCai}: ${(err as Error).message}`);
    return null;
  }
}

/** CAI's *_service fields are sometimes a "1"/"0" flag, sometimes a count (e.g. number of toilets) — either way, >0 means "yes". */
function toBool(value: string | null): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  if (value != null && /^\d+$/.test(value)) return Number(value) > 0;
  return null;
}

const LOWERCASE_WORDS = new Set(['di', 'del', 'della', 'dei', 'delle', 'da', 'al', 'alla', 'ai', 'agli', 'alle', 'e', 'in', 'a', 'lo', 'la', 'il', 'i', 'gli', 'le']);

/** CAI's `title` is frequently ALL CAPS ("CAPANNA OSSERVATORIO RIFUGIO MARGHERITA"); this is a display-only re-casing, not a data change. */
function titleCaseItalian(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

interface CaiClassification {
  category: Category | null;
  category_confidence: CategoryConfidence;
  service_level: ServiceLevel;
  reviewReason: string | null;
}

/** CAI's free-text `type` field (e.g. "Rifugio custodito") is the primary signal; name-only classification is the same last-resort spec §2.1 already uses elsewhere. */
function classifyCaiShelter(typeValue: string | null, name: string): CaiClassification {
  const t = (typeValue ?? '').toLowerCase();
  let category: Category | null = null;
  if (t.includes('bivacco')) category = 'bivacco';
  else if (t.includes('rifugio') || t.includes('capanna')) category = 'rifugio';

  let service_level: ServiceLevel = 'unknown';
  if (t.includes('non custodito') || t.includes('incustodito')) service_level = 'unstaffed';
  else if (t.includes('custodito')) service_level = 'staffed';
  else if (t.includes('semi')) service_level = 'self_service';
  else if (category === 'bivacco') service_level = 'unstaffed'; // a bivacco with no explicit staffing text is unstaffed by definition

  if (category) return { category, category_confidence: 'high', service_level, reviewReason: null };

  const fallback = classifyByNameOnly(name);
  return {
    category: fallback,
    category_confidence: 'low',
    service_level,
    reviewReason: fallback
      ? `CAI type "${typeValue ?? '(none)'}" unrecognized; category inferred from name only ("${fallback}")`
      : `CAI type "${typeValue ?? '(none)'}" unrecognized and name "${name}" gives no clue either`,
  };
}

interface CaiOpeningAttrs {
  type?: string;
  startDate?: string | null;
  endDate?: string | null;
}

/** openingTime_contact's `data` is a small array of {attributes: {type: '["estiva"]', startDate, endDate}} blobs — best-effort formatting, never throws. */
function formatOpeningHours(field: CaiField | undefined): string | null {
  if (!field || !Array.isArray(field.data)) return null;
  const parts: string[] = [];
  for (const entry of field.data as Array<{ attributes?: CaiOpeningAttrs }>) {
    const attrs = entry?.attributes;
    if (!attrs) continue;
    let seasons: string[] = [];
    try {
      seasons = JSON.parse(attrs.type ?? '[]');
    } catch {
      seasons = [];
    }
    const label = seasons.join('/');
    if (!label) continue;
    parts.push(attrs.startDate && attrs.endDate ? `${label}: dal ${attrs.startDate} al ${attrs.endDate}` : label);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

export const cai: SiteScraper = {
  sourceName: 'cai',
  async run() {
    const fetchedAt = new Date().toISOString();

    let firstPage: CaiListResponse;
    try {
      firstPage = await fetchListPage(1);
    } catch (err) {
      console.warn(`[cai] Failed to fetch the shelter list: ${(err as Error).message}`);
      return [];
    }
    if (!Array.isArray(firstPage.data)) {
      console.warn('[cai] Shelter list response had no `data` array — API shape may have changed.');
      return [];
    }

    const items: CaiListItem[] = [...firstPage.data];
    for (let page = 2; page <= firstPage.last_page; page++) {
      try {
        const next = await fetchListPage(page);
        items.push(...next.data);
      } catch (err) {
        console.warn(`[cai] Failed to fetch shelter list page ${page}/${firstPage.last_page}: ${(err as Error).message}`);
      }
    }

    let published = items.filter((item) => item.published && !item.deleted_at && item.geo?.coordinates);
    if (process.env.CAI_DEBUG_LIMIT) published = published.slice(0, Number(process.env.CAI_DEBUG_LIMIT));
    console.log(`[cai] ${published.length}/${items.length} published shelters with coordinates; fetching details (this takes a while, first run only)...`);

    const candidates: RawCandidate[] = [];
    let detailFailures = 0;

    for (const item of published) {
      const detail = await fetchDetail(item.id_cai);
      if (!detail) {
        detailFailures++;
        continue;
      }

      const fieldsMap = new Map<string, CaiField>();
      for (const f of detail.fields ?? []) fieldsMap.set(f.name, f);
      const val = (key: string): string | null => {
        const v = fieldsMap.get(key)?.value;
        return v == null ? null : String(v);
      };

      const rawName = val('alias') ?? item.title;
      const name = rawName === rawName.toUpperCase() ? titleCaseItalian(rawName) : rawName;

      const classification = classifyCaiShelter(val('type'), name);
      if (!classification.category) continue; // no tag basis and no name clue — same exclusion rule as every other source

      const [lon, lat] = item.geo!.coordinates;
      const capacityRaw = val('posti_totali_service') ?? val('posti_letto_service') ?? val('posti_letto_commerciali_service');
      const capacity = capacityRaw && /^\d+$/.test(capacityRaw) ? Number.parseInt(capacityRaw, 10) : null;

      candidates.push({
        sourceName: 'cai',
        sourceUrl: `https://rifugi.cai.it/shelters/${item.id_cai}`,
        fetchedAt,
        externalId: `cai-${item.id_cai}`,
        name,
        namesByLang: { it: name },
        category: classification.category,
        categoryConfidence: classification.category_confidence,
        serviceLevel: classification.service_level,
        countryHint: 'IT',
        coords: { lat, lon },
        elevationM: item.altitude_geo ?? null,
        capacity,
        operator: val('owner'),
        facilities: {
          drinking_water: toBool(val('acqua_in_rifugio_service')),
          electricity: toBool(val('elettricita_service')),
          restaurant: toBool(val('ristorante_service')),
          shower: toBool(val('docce_service')),
          wifi: toBool(val('wifi_service')),
          defibrillator: toBool(val('defibrillatore_service')),
          wheelchair_accessible: toBool(val('accessibilita_ai_disabili_service')),
          pets_allowed: toBool(val('ammissibilita_animali_domestici_service')),
          credit_card: toBool(val('pagamento_pos_service')),
          toilet: toBool(val('wc_uso_comune_service')),
          winter_room: toBool(val('posti_letto_invernali_service')),
        },
        access: {
          opening_hours: formatOpeningHours(fieldsMap.get('openingTime_contact')),
        },
        contact: {
          phone: val('fixedPhone_contact'),
          email: val('emailAddress'),
          website: val('webAddress_contact'),
        },
        descriptionIt: val('description_geo'),
        links: [{ label: 'CAI', url: `https://rifugi.cai.it/shelters/${item.id_cai}`, kind: 'cai' }],
        verified: true,
        reviewReasons: classification.reviewReason ? [classification.reviewReason] : [],
      });
    }

    if (detailFailures > 0) {
      console.warn(`[cai] ${detailFailures} shelter detail fetch(es) failed and were skipped.`);
    }
    console.log(`[cai] ${candidates.length} candidates`);
    return candidates;
  },
};
