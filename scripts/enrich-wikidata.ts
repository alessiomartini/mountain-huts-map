// Enrichment source #2: Wikidata + Wikipedia + Wikimedia Commons.
//
// Two jobs (spec §2.2):
//  1. For every OSM candidate carrying a `wikidata`/`wikipedia` tag, pull
//     structured facts (elevation, image, sitelinks) and the Wikipedia
//     incipit as a description, with photo author/license from Commons.
//  2. Crawl a fixed list of Wikipedia categories as a safety net for huts
//     that OSM is missing entirely; those become their own candidates and
//     get merged into (or added alongside) the OSM set by build-dataset.ts's
//     usual proximity+name clustering — no special-casing needed here.
//
// Every fetch is cached and every failure is caught per-item: one broken
// entity or missing image never aborts the run (spec §5-bis).
//
// Perf note: the first live run of this file fetched every entity/label/
// extract/image one at a time (politeFetch's 1.5s pacing × ~1 candidate),
// which alone took ~51 minutes. Wikidata's and Wikipedia's own APIs support
// fetching up to 50 items per call (wbgetentities `ids=Q1|Q2|...`, the query
// API's `titles=A|B|...`), so every phase below first collects all the QIDs/
// titles it needs, then fetches them in chunks of 50 — same per-item disk
// cache as before (so a warm cache still skips network entirely), but up to
// ~50x fewer round trips on a cold one.
import { cached, readCache, writeCache, THIRTY_DAYS_MS } from './lib/cache.ts';
import { politeFetch } from './lib/http.ts';
import type { RawCandidate } from './lib/source-record.ts';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = (lang: string) => `https://${lang}.wikipedia.org/w/api.php`;
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const BATCH_SIZE = 50; // MediaWiki/Wikibase action-API limit for anonymous/bot requests
const BATCH_DELAY_MS = 500; // still polite, but these are now ~50x fewer calls than before

// Safety-net categories per spec §2.2. Extend this list to cover more
// regions/languages; nothing else needs to change.
const SAFETY_NET_CATEGORIES: Array<{ lang: 'it'; title: string }> = [
  { lang: 'it', title: "Categoria:Bivacchi d'Italia" },
  { lang: 'it', title: "Categoria:Rifugi d'Italia per regione" },
  { lang: 'it', title: 'Categoria:Bivacchi della Lombardia' },
  { lang: 'it', title: 'Categoria:Rifugi della Lombardia' },
  { lang: 'it', title: 'Categoria:Rifugi per stato' },
];

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface WikidataClaimValue {
  mainsnak?: {
    datavalue?: { value: unknown };
  };
}

interface WikidataEntity {
  claims?: Record<string, WikidataClaimValue[]>;
  sitelinks?: Record<string, { title: string }>;
}

interface WikidataFacts {
  qid: string;
  lat: number | null;
  lon: number | null;
  elevationM: number | null;
  imageFilename: string | null;
  physicalFeatureQid: string | null;
  countryQid: string | null;
  sitelinks: { it?: string; en?: string; no?: string };
}

function claimNumeric(entity: WikidataEntity, prop: string): number | null {
  const value = entity.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value as { amount?: string } | undefined;
  if (!value?.amount) return null;
  return Number.parseFloat(value.amount);
}

function claimEntityId(entity: WikidataEntity, prop: string): string | null {
  const value = entity.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return value?.id ?? null;
}

function parseEntityFacts(qid: string, data: WikidataEntity): WikidataFacts {
  const coordValue = data.claims?.['P625']?.[0]?.mainsnak?.datavalue?.value as
    | { latitude?: number; longitude?: number }
    | undefined;
  return {
    qid,
    lat: coordValue?.latitude ?? null,
    lon: coordValue?.longitude ?? null,
    elevationM: claimNumeric(data, 'P2044'),
    imageFilename: (data.claims?.['P18']?.[0]?.mainsnak?.datavalue?.value as string | undefined) ?? null,
    physicalFeatureQid: claimEntityId(data, 'P706'),
    countryQid: claimEntityId(data, 'P17'),
    sitelinks: {
      it: data.sitelinks?.['itwiki']?.title,
      en: data.sitelinks?.['enwiki']?.title,
      no: data.sitelinks?.['nowiki']?.title,
    },
  };
}

/** Fetches Wikidata entities (claims+sitelinks) for many QIDs at once, skipping ones already on disk. */
async function fetchWikidataEntitiesBatch(qids: string[]): Promise<Map<string, WikidataEntity | null>> {
  const results = new Map<string, WikidataEntity | null>();
  const toFetch: string[] = [];
  for (const qid of qids) {
    const hit = readCache<WikidataEntity>('wikidata', qid, THIRTY_DAYS_MS);
    if (hit) results.set(qid, hit);
    else toFetch.push(qid);
  }
  for (const batch of chunk(toFetch, BATCH_SIZE)) {
    try {
      const url = new URL(WIKIDATA_API);
      url.search = new URLSearchParams({
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'claims|sitelinks',
        format: 'json',
      }).toString();
      const res = await politeFetch(url.toString(), { minDelayMs: BATCH_DELAY_MS });
      if (!res.ok) throw new Error(`wbgetentities responded ${res.status}`);
      const json = (await res.json()) as { entities: Record<string, WikidataEntity> };
      for (const qid of batch) {
        const entity = json.entities[qid] ?? null;
        if (entity) writeCache('wikidata', qid, entity);
        results.set(qid, entity);
      }
    } catch (err) {
      console.warn(`[enrich-wikidata] Batch entity fetch failed for ${batch.length} QIDs: ${(err as Error).message}`);
      for (const qid of batch) results.set(qid, null);
    }
  }
  return results;
}

/** Fetches Wikidata labels (for mountain-group hints) for many QIDs at once. */
async function fetchWikidataLabelsBatch(qids: string[], lang: string): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const toFetch: string[] = [];
  for (const qid of qids) {
    const hit = readCache<string>('wikidata-label', `${qid}:${lang}`, THIRTY_DAYS_MS);
    if (hit) results.set(qid, hit);
    else toFetch.push(qid);
  }
  for (const batch of chunk(toFetch, BATCH_SIZE)) {
    try {
      const url = new URL(WIKIDATA_API);
      url.search = new URLSearchParams({
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'labels',
        languages: `${lang}|en`,
        format: 'json',
      }).toString();
      const res = await politeFetch(url.toString(), { minDelayMs: BATCH_DELAY_MS });
      if (!res.ok) throw new Error(`wbgetentities labels responded ${res.status}`);
      const json = (await res.json()) as {
        entities: Record<string, { labels?: Record<string, { value: string }> }>;
      };
      for (const qid of batch) {
        const label = json.entities[qid]?.labels?.[lang]?.value ?? json.entities[qid]?.labels?.en?.value ?? null;
        if (label) writeCache('wikidata-label', `${qid}:${lang}`, label);
        results.set(qid, label);
      }
    } catch (err) {
      console.warn(`[enrich-wikidata] Batch label fetch failed for ${batch.length} QIDs: ${(err as Error).message}`);
      for (const qid of batch) results.set(qid, null);
    }
  }
  return results;
}

interface WikipediaExtract {
  extract: string | null;
  imageUrl: string | null;
  lat: number | null;
  lon: number | null;
}

/** Fetches Wikipedia extracts+images+coords for many titles (same language) at once. */
async function fetchWikipediaExtractsBatch(lang: string, titles: string[]): Promise<Map<string, WikipediaExtract | null>> {
  const results = new Map<string, WikipediaExtract | null>();
  const toFetch: string[] = [];
  for (const title of titles) {
    const hit = readCache<WikipediaExtract>('wikipedia', `${lang}:${title}`, THIRTY_DAYS_MS);
    if (hit) results.set(title, hit);
    else toFetch.push(title);
  }
  for (const batch of chunk(toFetch, BATCH_SIZE)) {
    try {
      const url = new URL(WIKIPEDIA_API(lang));
      url.search = new URLSearchParams({
        action: 'query',
        prop: 'extracts|pageimages|coordinates',
        exintro: '1',
        explaintext: '1',
        piprop: 'original',
        titles: batch.join('|'),
        redirects: '1',
        format: 'json',
        formatversion: '2',
      }).toString();
      const res = await politeFetch(url.toString(), { minDelayMs: BATCH_DELAY_MS });
      if (!res.ok) throw new Error(`Wikipedia batch (${lang}) responded ${res.status}`);
      const json = (await res.json()) as {
        query?: {
          normalized?: Array<{ from: string; to: string }>;
          redirects?: Array<{ from: string; to: string }>;
          pages?: Array<{
            title?: string;
            extract?: string;
            original?: { source: string };
            coordinates?: Array<{ lat: number; lon: number }>;
            missing?: boolean;
          }>;
        };
      };

      // MediaWiki may return a normalized/redirected title different from what
      // was requested; walk from -> to chains back to the originally-requested title.
      const requestedFor = new Map<string, string>();
      for (const t of batch) requestedFor.set(t, t);
      for (const n of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) {
        const orig = requestedFor.get(n.from) ?? n.from;
        requestedFor.set(n.to, orig);
      }

      const byOriginalTitle = new Map<string, WikipediaExtract | null>();
      for (const page of json.query?.pages ?? []) {
        if (!page.title) continue;
        const origTitle = requestedFor.get(page.title) ?? page.title;
        byOriginalTitle.set(
          origTitle,
          page.missing
            ? null
            : {
                extract: page.extract ?? null,
                imageUrl: page.original?.source ?? null,
                lat: page.coordinates?.[0]?.lat ?? null,
                lon: page.coordinates?.[0]?.lon ?? null,
              },
        );
      }
      for (const title of batch) {
        const val = byOriginalTitle.get(title) ?? null;
        writeCache('wikipedia', `${lang}:${title}`, val);
        results.set(title, val);
      }
    } catch (err) {
      console.warn(`[enrich-wikidata] Batch Wikipedia fetch failed for ${lang} (${batch.length} titles): ${(err as Error).message}`);
      for (const title of batch) results.set(title, null);
    }
  }
  return results;
}

export interface CommonsPhoto {
  url: string;
  thumb_url: string;
  author: string;
  license: string;
  source_url: string;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

/** Fetches Commons imageinfo (url/author/license) for many filenames at once. */
async function fetchCommonsImageInfoBatch(filenames: string[]): Promise<Map<string, CommonsPhoto | null>> {
  const results = new Map<string, CommonsPhoto | null>();
  const toFetch: string[] = [];
  for (const filename of filenames) {
    const hit = readCache<CommonsPhoto>('commons', filename, THIRTY_DAYS_MS);
    if (hit) results.set(filename, hit);
    else toFetch.push(filename);
  }
  for (const batch of chunk(toFetch, BATCH_SIZE)) {
    try {
      const url = new URL(COMMONS_API);
      url.search = new URLSearchParams({
        action: 'query',
        titles: batch.map((f) => `File:${f}`).join('|'),
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        iiurlwidth: '640',
        format: 'json',
        formatversion: '2',
      }).toString();
      const res = await politeFetch(url.toString(), { minDelayMs: BATCH_DELAY_MS });
      if (!res.ok) throw new Error(`Commons imageinfo batch responded ${res.status}`);
      const json = (await res.json()) as {
        query?: {
          pages?: Array<{
            title?: string;
            imageinfo?: Array<{
              url: string;
              thumburl?: string;
              descriptionurl: string;
              extmetadata?: {
                Artist?: { value: string };
                LicenseShortName?: { value: string };
              };
            }>;
          }>;
        };
      };
      const byFileTitle = new Map<string, CommonsPhoto | null>();
      for (const page of json.query?.pages ?? []) {
        if (!page.title) continue;
        const info = page.imageinfo?.[0];
        if (!info) {
          byFileTitle.set(page.title, null);
          continue;
        }
        const license = info.extmetadata?.LicenseShortName?.value ?? 'unknown';
        byFileTitle.set(
          page.title,
          license === 'unknown' // spec §0.2: never use an unlicensed photo
            ? null
            : {
                url: info.url,
                thumb_url: info.thumburl ?? info.url,
                author: stripHtml(info.extmetadata?.Artist?.value ?? 'unknown'),
                license,
                source_url: info.descriptionurl,
              },
        );
      }
      for (const filename of batch) {
        const val = byFileTitle.get(`File:${filename}`) ?? null;
        writeCache('commons', filename, val);
        results.set(filename, val);
      }
    } catch (err) {
      console.warn(`[enrich-wikidata] Batch Commons fetch failed for ${batch.length} files: ${(err as Error).message}`);
      for (const filename of batch) results.set(filename, null);
    }
  }
  return results;
}

/** Enriches OSM candidates that carry a `wikidata` tag with facts + description + photo. */
async function enrichFromWikidataTags(osmCandidates: RawCandidate[]): Promise<RawCandidate[]> {
  const extra: RawCandidate[] = [];
  const withQid = osmCandidates.filter((c) => c.wikidataQid);
  if (withQid.length === 0) return extra;

  const qids = [...new Set(withQid.map((c) => c.wikidataQid!))];
  const rawEntities = await fetchWikidataEntitiesBatch(qids);

  const factsByQid = new Map<string, WikidataFacts | null>();
  for (const qid of qids) {
    const raw = rawEntities.get(qid);
    factsByQid.set(qid, raw ? parseEntityFacts(qid, raw) : null);
  }

  const physicalFeatureQids = [
    ...new Set([...factsByQid.values()].filter((f): f is WikidataFacts => f?.physicalFeatureQid != null).map((f) => f.physicalFeatureQid!)),
  ];
  const labels = physicalFeatureQids.length > 0 ? await fetchWikidataLabelsBatch(physicalFeatureQids, 'it') : new Map<string, string | null>();

  const titlesByLang = new Map<string, Set<string>>();
  for (const facts of factsByQid.values()) {
    if (!facts) continue;
    for (const [lang, title] of Object.entries(facts.sitelinks)) {
      if (!title) continue;
      if (!titlesByLang.has(lang)) titlesByLang.set(lang, new Set());
      titlesByLang.get(lang)!.add(title);
    }
  }
  const extractsByLang = new Map<string, Map<string, WikipediaExtract | null>>();
  for (const [lang, titleSet] of titlesByLang) {
    extractsByLang.set(lang, await fetchWikipediaExtractsBatch(lang, [...titleSet]));
  }

  const imageFilenames = [
    ...new Set([...factsByQid.values()].filter((f): f is WikidataFacts => f?.imageFilename != null).map((f) => f.imageFilename!)),
  ];
  const photosByFilename = imageFilenames.length > 0 ? await fetchCommonsImageInfoBatch(imageFilenames) : new Map<string, CommonsPhoto | null>();

  for (const osmCandidate of withQid) {
    const qid = osmCandidate.wikidataQid!;
    const facts = factsByQid.get(qid);
    if (!facts) continue;

    const fetchedAt = new Date().toISOString();
    const coords = osmCandidate.coords ?? (facts.lat != null && facts.lon != null ? { lat: facts.lat, lon: facts.lon } : null);
    const mountainGroupHint = facts.physicalFeatureQid ? (labels.get(facts.physicalFeatureQid) ?? undefined) : undefined;

    extra.push({
      sourceName: 'wikidata',
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      fetchedAt,
      externalId: `wd-${qid}`,
      name: osmCandidate.name,
      coords,
      elevationM: facts.elevationM,
      mountainGroupHint,
      verified: true,
    });

    for (const [lang, title] of Object.entries(facts.sitelinks)) {
      if (!title) continue;
      const wp = extractsByLang.get(lang)?.get(title);
      if (!wp) continue;
      const wpCoords = coords ?? (wp.lat != null && wp.lon != null ? { lat: wp.lat, lon: wp.lon } : null);
      const photos: RawCandidate['photos'] = [];
      if (facts.imageFilename) {
        const photo = photosByFilename.get(facts.imageFilename);
        if (photo) photos.push(photo);
      }
      extra.push({
        sourceName: 'wikipedia',
        sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        fetchedAt,
        name: osmCandidate.name,
        coords: wpCoords,
        descriptionIt: lang === 'it' ? wp.extract : undefined,
        descriptionEn: lang === 'en' ? wp.extract : undefined,
        photos,
        links: [
          {
            label: `Wikipedia (${lang})`,
            url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
            kind: 'wikipedia',
          },
        ],
        verified: true,
      });
    }
  }
  return extra;
}

interface CategoryMember {
  title: string;
}

async function fetchCategoryMembers(lang: string, categoryTitle: string): Promise<CategoryMember[]> {
  const members: CategoryMember[] = [];
  let cmcontinue: string | undefined;
  let page = 0;
  try {
    do {
      const cacheKey = `${lang}:${categoryTitle}:${cmcontinue ?? 'start'}`;
      const { data } = await cached('wikipedia-category', cacheKey, THIRTY_DAYS_MS, async () => {
        const url = new URL(WIKIPEDIA_API(lang));
        const params: Record<string, string> = {
          action: 'query',
          list: 'categorymembers',
          cmtitle: categoryTitle,
          cmlimit: '500',
          format: 'json',
          formatversion: '2',
        };
        if (cmcontinue) params.cmcontinue = cmcontinue;
        url.search = new URLSearchParams(params).toString();
        const res = await politeFetch(url.toString());
        if (!res.ok) throw new Error(`Category members for ${categoryTitle} responded ${res.status}`);
        return (await res.json()) as {
          query?: { categorymembers?: CategoryMember[] };
          continue?: { cmcontinue?: string };
        };
      });
      members.push(...(data.query?.categorymembers ?? []));
      cmcontinue = data.continue?.cmcontinue;
      page += 1;
    } while (cmcontinue && page < 20); // hard cap so a mis-scoped category can't loop forever
  } catch (err) {
    console.warn(`[enrich-wikidata] Failed to crawl category "${categoryTitle}": ${(err as Error).message}`);
  }
  return members;
}

/** Wikipedia-category safety net: huts with a Wikipedia article but no OSM tag pointing at it. */
function categoryImpliesCategory(categoryTitle: string): 'bivacco' | 'rifugio' | null {
  if (/bivacch/i.test(categoryTitle)) return 'bivacco';
  if (/rifug/i.test(categoryTitle)) return 'rifugio';
  return null;
}

async function crawlSafetyNetCategories(): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const categoryMembers: Array<{ lang: string; title: string; members: CategoryMember[] }> = [];
  for (const { lang, title } of SAFETY_NET_CATEGORIES) {
    const members = await fetchCategoryMembers(lang, title);
    console.log(`[enrich-wikidata] ${title}: ${members.length} members`);
    categoryMembers.push({ lang, title, members });
  }

  const titlesByLang = new Map<string, Set<string>>();
  for (const { lang, members } of categoryMembers) {
    for (const member of members) {
      if (member.title.startsWith('Categoria:') || member.title.startsWith('Category:')) continue; // sub-category, not an article
      if (!titlesByLang.has(lang)) titlesByLang.set(lang, new Set());
      titlesByLang.get(lang)!.add(member.title);
    }
  }
  const extractsByLang = new Map<string, Map<string, WikipediaExtract | null>>();
  for (const [lang, titleSet] of titlesByLang) {
    extractsByLang.set(lang, await fetchWikipediaExtractsBatch(lang, [...titleSet]));
  }

  for (const { lang, title, members } of categoryMembers) {
    // NOTE: a "per regione"/"per stato" umbrella category's direct members are
    // sub-categories (e.g. "Categoria:Rifugi della Lombardia"), which are
    // skipped below as not-an-article. Reaching their articles needs one more
    // level of category-member traversal; not implemented yet — the four
    // concrete regional categories in SAFETY_NET_CATEGORIES still work directly.
    const categoryHint = categoryImpliesCategory(title);
    for (const member of members) {
      if (member.title.startsWith('Categoria:') || member.title.startsWith('Category:')) continue;
      const wp = extractsByLang.get(lang)?.get(member.title);
      if (!wp || wp.lat == null || wp.lon == null) continue; // no coordinates: can't place it on the map
      const fetchedAt = new Date().toISOString();
      candidates.push({
        sourceName: 'wikipedia',
        sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(member.title.replace(/ /g, '_'))}`,
        fetchedAt,
        name: member.title,
        category: categoryHint,
        categoryConfidence: categoryHint ? 'medium' : undefined,
        coords: { lat: wp.lat, lon: wp.lon },
        descriptionIt: lang === 'it' ? wp.extract : undefined,
        links: [
          {
            label: `Wikipedia (${lang})`,
            url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(member.title.replace(/ /g, '_'))}`,
            kind: 'wikipedia',
          },
        ],
        verified: false, // only Wikipedia vouches for this one; build-dataset marks verified once matched or corroborated
      });
    }
  }
  return candidates;
}

export async function enrichWikidata(osmCandidates: RawCandidate[]): Promise<RawCandidate[]> {
  // Sequential, not Promise.all: politeFetch's pacing is a shared clock, and
  // running both phases concurrently would let two request streams race past it.
  const fromTags = await enrichFromWikidataTags(osmCandidates);
  const fromCategories = await crawlSafetyNetCategories();
  return [...fromTags, ...fromCategories];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await enrichWikidata([]);
  console.log(`[enrich-wikidata] Total (category crawl only, no OSM input): ${candidates.length} candidates`);
}
