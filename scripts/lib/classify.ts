// Bivacco vs rifugio classification. OSM's tagging is the primary signal,
// but it's known to be inconsistent (see the project spec §2.1): plenty of
// Italian bivacchi are tagged tourism=alpine_hut by mistake. So we compute a
// second, independent heuristic vote from the hut's other attributes and
// flag a record for manual review whenever the two disagree.
import type { CategoryConfidence } from '../../src/lib/hut-schema.ts';

export interface OsmHutTags {
  tourism?: string;
  amenity?: string;
  shelter_type?: string;
  operator?: string;
  name?: string;
  capacity?: number;
  fee?: string;
  unmanned?: string;
  phone?: string;
  website?: string;
  opening_hours?: string;
}

/** null = not a hut/bivouac we publish (e.g. an open weather_shelter). */
export type ClassificationCategory = 'bivacco' | 'rifugio' | null;

export interface ClassificationResult {
  category: ClassificationCategory;
  osm_type: string | null;
  category_confidence: CategoryConfidence;
  needsReview: boolean;
  reasons: string[];
}

function tagCategory(tags: OsmHutTags): { category: ClassificationCategory; osm_type: string | null } {
  if (tags.tourism === 'alpine_hut') return { category: 'rifugio', osm_type: 'alpine_hut' };
  if (tags.tourism === 'wilderness_hut') return { category: 'bivacco', osm_type: 'wilderness_hut' };
  if (tags.amenity === 'shelter' && tags.shelter_type === 'basic_hut') {
    return { category: 'bivacco', osm_type: 'basic_hut' };
  }
  if (tags.amenity === 'shelter' && tags.shelter_type === 'weather_shelter') {
    return { category: null, osm_type: 'weather_shelter' };
  }
  return { category: null, osm_type: null };
}

interface HeuristicVote {
  category: 'bivacco' | 'rifugio';
  confidence: 'high' | 'medium';
  reasons: string[];
}

function heuristicVote(tags: OsmHutTags): HeuristicVote | null {
  const name = (tags.name ?? '').toLowerCase();
  const operator = (tags.operator ?? '').toLowerCase();
  const reasons: string[] = [];
  let bivaccoScore = 0;
  let rifugioScore = 0;

  if (operator.includes('cai')) {
    bivaccoScore += 1;
    reasons.push('operator contains "CAI"');
  }
  if (name.includes('bivacco')) {
    bivaccoScore += 2;
    reasons.push('name contains "bivacco"');
  }
  if (tags.capacity != null && tags.capacity <= 12) {
    bivaccoScore += 1;
    reasons.push('capacity <= 12');
  }
  if (tags.fee === 'no') {
    bivaccoScore += 1;
    reasons.push('fee=no');
  }
  if (tags.unmanned === 'yes') {
    bivaccoScore += 1;
    reasons.push('unmanned=yes');
  }
  if (!tags.phone && !tags.website) {
    bivaccoScore += 1;
    reasons.push('no phone/website');
  }

  if (/^(rifugio|berghutte|berghütte|refuge)\b/.test(name)) {
    rifugioScore += 2;
    reasons.push('name starts with Rifugio/Berghütte/Refuge');
  }
  if (tags.phone) {
    rifugioScore += 1;
    reasons.push('has phone');
  }
  if (tags.opening_hours) {
    rifugioScore += 1;
    reasons.push('has opening_hours');
  }
  if (tags.fee === 'yes') {
    rifugioScore += 1;
    reasons.push('fee=yes');
  }
  if (tags.capacity != null && tags.capacity > 20) {
    rifugioScore += 1;
    reasons.push('capacity > 20');
  }

  if (bivaccoScore === 0 && rifugioScore === 0) return null;
  const diff = Math.abs(bivaccoScore - rifugioScore);
  if (bivaccoScore > rifugioScore) {
    return { category: 'bivacco', confidence: diff >= 2 ? 'high' : 'medium', reasons };
  }
  if (rifugioScore > bivaccoScore) {
    return { category: 'rifugio', confidence: diff >= 2 ? 'high' : 'medium', reasons };
  }
  return null; // tied score: no useful signal
}

/**
 * Last-resort classification for candidates with no OSM tags at all
 * (scraper- or Wikipedia-only records): infer from the name alone. Used
 * only when no other signal is available; returns null (uncategorizable,
 * excluded from the dataset) rather than guessing when the name gives no clue.
 */
export function classifyByNameOnly(name: string): 'bivacco' | 'rifugio' | null {
  const n = name.toLowerCase();
  if (/\bbivacco\b/.test(n)) return 'bivacco';
  // Norwegian hut names are frequently one fused compound word (e.g.
  // "Fannaråkhytta"), so "hytt" is matched as a substring, not \bhytte\b.
  if (/\b(rifugio|capanna|refuge|berghutte|berghütte)\b/.test(n) || /hytt/.test(n)) return 'rifugio';
  return null;
}

export function classifyHut(tags: OsmHutTags): ClassificationResult {
  const { category: tagCat, osm_type } = tagCategory(tags);
  const heuristic = heuristicVote(tags);

  // Not a category we publish at all (open weather shelter, or unrecognized
  // tagging): heuristics don't resurrect it, since we have no tag basis to
  // classify it as bivacco/rifugio in the first place.
  if (tagCat === null) {
    return {
      category: null,
      osm_type,
      category_confidence: 'low',
      needsReview: false,
      reasons: heuristic?.reasons ?? [],
    };
  }

  if (!heuristic || heuristic.category === tagCat) {
    return {
      category: tagCat,
      osm_type,
      category_confidence: heuristic?.category === tagCat ? 'high' : 'medium',
      needsReview: false,
      reasons: heuristic?.reasons ?? [],
    };
  }

  // Tag and heuristic disagree. A confident heuristic wins (this is the
  // "bivacco mistagged as alpine_hut" case); a weak one just gets flagged.
  const conflictNote = `tag says ${tagCat} (osm_type=${osm_type}), heuristic suggests ${heuristic.category} (${heuristic.confidence})`;
  if (heuristic.confidence === 'high') {
    return {
      category: heuristic.category,
      osm_type,
      category_confidence: 'low',
      needsReview: true,
      reasons: [conflictNote, ...heuristic.reasons],
    };
  }
  return {
    category: tagCat,
    osm_type,
    category_confidence: 'medium',
    needsReview: true,
    reasons: [conflictNote, ...heuristic.reasons],
  };
}
