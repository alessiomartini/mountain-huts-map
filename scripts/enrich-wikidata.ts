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
import { cached, THIRTY_DAYS_MS } from './lib/cache.ts';
import { politeFetch } from './lib/http.ts';
import type { RawCandidate } from './lib/source-record.ts';

const WIKIDATA_ENTITY_URL = (qid: string) => `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
const WIKIPEDIA_API = (lang: string) => `https://${lang}.wikipedia.org/w/api.php`;
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

// Safety-net categories per spec §2.2. Extend this list to cover more
// regions/languages; nothing else needs to change.
const SAFETY_NET_CATEGORIES: Array<{ lang: 'it'; title: string }> = [
  { lang: 'it', title: "Categoria:Bivacchi d'Italia" },
  { lang: 'it', title: "Categoria:Rifugi d'Italia per regione" },
  { lang: 'it', title: 'Categoria:Bivacchi della Lombardia' },
  { lang: 'it', title: 'Categoria:Rifugi della Lombardia' },
  { lang: 'it', title: 'Categoria:Rifugi per stato' },
];

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

async function fetchWikidataEntity(qid: string): Promise<WikidataFacts | null> {
  try {
    const { data } = await cached('wikidata', qid, THIRTY_DAYS_MS, async () => {
      const res = await politeFetch(WIKIDATA_ENTITY_URL(qid));
      if (!res.ok) throw new Error(`Wikidata ${qid} responded ${res.status}`);
      const json = (await res.json()) as { entities: Record<string, WikidataEntity> };
      return json.entities[qid];
    });
    if (!data) return null;

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
  } catch (err) {
    console.warn(`[enrich-wikidata] Failed to fetch entity ${qid}: ${(err as Error).message}`);
    return null;
  }
}

async function fetchWikidataLabel(qid: string, lang: string): Promise<string | null> {
  try {
    const { data } = await cached('wikidata-label', `${qid}:${lang}`, THIRTY_DAYS_MS, async () => {
      const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
      const res = await politeFetch(url);
      if (!res.ok) throw new Error(`Wikidata label ${qid} responded ${res.status}`);
      const json = (await res.json()) as {
        entities: Record<string, { labels?: Record<string, { value: string }> }>;
      };
      return json.entities[qid]?.labels?.[lang]?.value ?? json.entities[qid]?.labels?.en?.value ?? null;
    });
    return data;
  } catch {
    return null;
  }
}

interface WikipediaExtract {
  extract: string | null;
  imageUrl: string | null;
  lat: number | null;
  lon: number | null;
}

async function fetchWikipediaExtract(lang: string, title: string): Promise<WikipediaExtract | null> {
  try {
    const { data } = await cached('wikipedia', `${lang}:${title}`, THIRTY_DAYS_MS, async () => {
      const url = new URL(WIKIPEDIA_API(lang));
      url.search = new URLSearchParams({
        action: 'query',
        prop: 'extracts|pageimages|coordinates',
        exintro: '1',
        explaintext: '1',
        piprop: 'original',
        titles: title,
        format: 'json',
        formatversion: '2',
      }).toString();
      const res = await politeFetch(url.toString());
      if (!res.ok) throw new Error(`Wikipedia ${lang}:${title} responded ${res.status}`);
      return (await res.json()) as {
        query?: {
          pages?: Array<{
            extract?: string;
            original?: { source: string };
            coordinates?: Array<{ lat: number; lon: number }>;
            missing?: boolean;
          }>;
        };
      };
    });
    const page = data.query?.pages?.[0];
    if (!page || page.missing) return null;
    return {
      extract: page.extract ?? null,
      imageUrl: page.original?.source ?? null,
      lat: page.coordinates?.[0]?.lat ?? null,
      lon: page.coordinates?.[0]?.lon ?? null,
    };
  } catch (err) {
    console.warn(`[enrich-wikidata] Failed to fetch Wikipedia ${lang}:${title}: ${(err as Error).message}`);
    return null;
  }
}

export interface CommonsPhoto {
  url: string;
  thumb_url: string;
  author: string;
  license: string;
  source_url: string;
}

async function fetchCommonsImageInfo(filename: string): Promise<CommonsPhoto | null> {
  try {
    const { data } = await cached('commons', filename, THIRTY_DAYS_MS, async () => {
      const url = new URL(COMMONS_API);
      url.search = new URLSearchParams({
        action: 'query',
        titles: `File:${filename}`,
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        iiurlwidth: '640',
        format: 'json',
        formatversion: '2',
      }).toString();
      const res = await politeFetch(url.toString());
      if (!res.ok) throw new Error(`Commons imageinfo for ${filename} responded ${res.status}`);
      return (await res.json()) as {
        query?: {
          pages?: Array<{
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
    });
    const info = data.query?.pages?.[0]?.imageinfo?.[0];
    if (!info) return null;
    const author = stripHtml(info.extmetadata?.Artist?.value ?? 'unknown');
    const license = info.extmetadata?.LicenseShortName?.value ?? 'unknown';
    if (license === 'unknown') return null; // spec §0.2: never use an unlicensed photo
    return {
      url: info.url,
      thumb_url: info.thumburl ?? info.url,
      author,
      license,
      source_url: info.descriptionurl,
    };
  } catch (err) {
    console.warn(`[enrich-wikidata] Failed to fetch Commons info for ${filename}: ${(err as Error).message}`);
    return null;
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

/** Enriches OSM candidates that carry a `wikidata` tag with facts + description + photo. */
async function enrichFromWikidataTags(osmCandidates: RawCandidate[]): Promise<RawCandidate[]> {
  const extra: RawCandidate[] = [];
  const withQid = osmCandidates.filter((c) => c.wikidataQid);

  for (const osmCandidate of withQid) {
    const qid = osmCandidate.wikidataQid!;
    const entity = await fetchWikidataEntity(qid);
    if (!entity) continue;

    const fetchedAt = new Date().toISOString();
    const coords = osmCandidate.coords ?? (entity.lat != null && entity.lon != null ? { lat: entity.lat, lon: entity.lon } : null);

    let mountainGroupHint: string | undefined;
    if (entity.physicalFeatureQid) {
      const label = await fetchWikidataLabel(entity.physicalFeatureQid, 'it');
      if (label) mountainGroupHint = label;
    }

    const wikidataCandidate: RawCandidate = {
      sourceName: 'wikidata',
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      fetchedAt,
      externalId: `wd-${qid}`,
      name: osmCandidate.name,
      coords,
      elevationM: entity.elevationM,
      mountainGroupHint,
      verified: true,
    };
    extra.push(wikidataCandidate);

    for (const [lang, title] of Object.entries(entity.sitelinks)) {
      if (!title) continue;
      const wp = await fetchWikipediaExtract(lang, title);
      if (!wp) continue;
      const wpCoords = coords ?? (wp.lat != null && wp.lon != null ? { lat: wp.lat, lon: wp.lon } : null);
      const photos: RawCandidate['photos'] = [];
      if (entity.imageFilename) {
        const photo = await fetchCommonsImageInfo(entity.imageFilename);
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
  for (const { lang, title } of SAFETY_NET_CATEGORIES) {
    const members = await fetchCategoryMembers(lang, title);
    console.log(`[enrich-wikidata] ${title}: ${members.length} members`);
    // NOTE: a "per regione"/"per stato" umbrella category's direct members are
    // sub-categories (e.g. "Categoria:Rifugi della Lombardia"), which are
    // skipped below as not-an-article. Reaching their articles needs one more
    // level of category-member traversal; not implemented yet — the four
    // concrete regional categories in SAFETY_NET_CATEGORIES still work directly.
    const categoryHint = categoryImpliesCategory(title);
    for (const member of members) {
      if (member.title.startsWith('Categoria:') || member.title.startsWith('Category:')) continue; // sub-category, not an article
      const wp = await fetchWikipediaExtract(lang, member.title);
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
