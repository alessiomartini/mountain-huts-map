import { diska } from './diska.ts';
import { cai } from './cai.ts';
import { paesidivaltellina } from './paesidivaltellina.ts';
import { hikesoftheworld } from './hikesoftheworld.ts';
import type { SiteScraper } from './types.ts';
import type { RawCandidate } from '../lib/source-record.ts';

// Priority order per spec §2.2-bis. abitarelestremo, caibergamo and
// parcorobievalt were dropped: all three are already covered by the
// official CAI API (see cai.ts) and had stopped returning any candidates
// anyway (site restructures / no reachable endpoint).
export const SCRAPERS: SiteScraper[] = [
  diska,
  cai,
  paesidivaltellina,
  hikesoftheworld,
];

/**
 * Runs every scraper in sequence (not parallel — see politeFetch's shared
 * pacing clock). One scraper throwing is caught here too, belt-and-suspenders
 * on top of each scraper's own internal try/catch, so a bug in one source
 * file can never take down the whole `data:refresh` run.
 */
export async function runAllScrapers(): Promise<RawCandidate[]> {
  const all: RawCandidate[] = [];
  for (const scraper of SCRAPERS) {
    try {
      const candidates = await scraper.run();
      all.push(...candidates);
    } catch (err) {
      console.warn(`[sources] Scraper "${scraper.sourceName}" threw and was skipped entirely: ${(err as Error).message}`);
    }
  }
  return all;
}
