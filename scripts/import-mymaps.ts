// Google My Maps import (spec §2.5). This is cross-reference-only: matched
// placemarks just confirm the dataset already covers that spot; unmatched
// ones go to scripts/out/candidates-from-mymaps.csv for manual review and
// are never auto-imported, because the placemark descriptions are personal
// notes, not publishable content.
//
// Local file in scripts/input/*.kml always wins over the network export —
// see scripts/input/README.md. This also means any other KML/GPX dropped
// there later works the same way (GPX parsing isn't implemented yet, only
// KML, since that's all the spec currently asks for).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { politeFetch } from './lib/http.ts';
import { haversineMeters } from './lib/geo.ts';
import { writeCsv } from './lib/csv.ts';

const INPUT_DIR = 'scripts/input';
const EXPORT_URL = 'https://www.google.com/maps/d/kml?mid=19pBu0i4wAQ26m-eb67T174d1itw&forcekml=1';
const MATCH_DISTANCE_M = 300;

export interface KmlPlacemark {
  name: string;
  description: string | null;
  lat: number;
  lon: number;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface KmlPlacemarkNode {
  // fast-xml-parser types text content by what it looks like (a numeric
  // <name> parses as `number`), so these are `unknown` and coerced via asText().
  name?: unknown;
  description?: unknown;
  Point?: { coordinates?: unknown };
}

interface KmlFolderNode {
  Placemark?: KmlPlacemarkNode | KmlPlacemarkNode[];
  Folder?: KmlFolderNode | KmlFolderNode[];
}

// fast-xml-parser returns whatever primitive type the text content parses
// as (a purely numeric <name> becomes a number, not a string), so every
// text field coming out of the parser needs coercing before .trim().
function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function collectPlacemarks(folder: KmlFolderNode): KmlPlacemark[] {
  const result: KmlPlacemark[] = [];
  for (const placemark of toArray(folder.Placemark)) {
    const coords = asText(placemark.Point?.coordinates);
    const name = asText(placemark.name);
    if (!coords || !name) continue;
    const [lonStr, latStr] = coords.split(',');
    const lon = Number.parseFloat(lonStr);
    const lat = Number.parseFloat(latStr);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    result.push({ name, description: asText(placemark.description) ?? null, lat, lon });
  }
  for (const sub of toArray(folder.Folder)) {
    result.push(...collectPlacemarks(sub));
  }
  return result;
}

function parseKml(xml: string): KmlPlacemark[] {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const doc = parser.parse(xml) as { kml?: { Document?: KmlFolderNode } };
  const root = doc.kml?.Document;
  if (!root) return [];
  return collectPlacemarks(root);
}

function findLocalKmlFiles(): string[] {
  if (!existsSync(INPUT_DIR)) return [];
  return readdirSync(INPUT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.kml'))
    .map((f) => join(INPUT_DIR, f));
}

export async function loadMyMapsPlacemarks(): Promise<KmlPlacemark[]> {
  const localFiles = findLocalKmlFiles();
  if (localFiles.length > 0) {
    console.log(`[import-mymaps] Using local file(s): ${localFiles.join(', ')}`);
    return localFiles.flatMap((f) => parseKml(readFileSync(f, 'utf-8')));
  }

  console.log(`[import-mymaps] No local KML in ${INPUT_DIR}/, trying the export URL...`);
  try {
    const res = await politeFetch(EXPORT_URL);
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !/xml|kml/i.test(contentType)) {
      console.warn(
        `[import-mymaps] Export URL did not return KML (status ${res.status}, content-type "${contentType}"). ` +
          `Not scraping the embed page per spec — please download the KML manually from Google My Maps ` +
          `("Scarica KML" from the map menu) and place it at ${INPUT_DIR}/mymaps.kml.`,
      );
      return [];
    }
    const xml = await res.text();
    return parseKml(xml);
  } catch (err) {
    console.warn(`[import-mymaps] Export URL fetch failed: ${(err as Error).message}. Falling back to manual: place a .kml file in ${INPUT_DIR}/.`);
    return [];
  }
}

export interface MyMapsMatchResult {
  matchedCount: number;
  unmatchedCount: number;
}

/**
 * Matches placemarks against already-merged hut coordinates within 300m.
 * Writes unmatched ones to scripts/out/candidates-from-mymaps.csv. Never
 * mutates or contributes fields to `existingHuts` — matching is purely for
 * coverage confirmation and to surface spots the dataset is missing.
 */
export function matchMyMapsPlacemarks(
  placemarks: KmlPlacemark[],
  existingHuts: Array<{ name: string; coords: { lat: number; lon: number } }>,
): MyMapsMatchResult {
  const unmatched: KmlPlacemark[] = [];

  for (const placemark of placemarks) {
    const hasMatch = existingHuts.some(
      (hut) => haversineMeters({ lat: placemark.lat, lon: placemark.lon }, hut.coords) <= MATCH_DISTANCE_M,
    );
    if (!hasMatch) unmatched.push(placemark);
  }

  if (unmatched.length > 0) {
    writeCsv(
      'scripts/out/candidates-from-mymaps.csv',
      ['name', 'lat', 'lon', 'description'],
      unmatched.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, description: p.description ?? '' })),
    );
  }

  return { matchedCount: placemarks.length - unmatched.length, unmatchedCount: unmatched.length };
}
