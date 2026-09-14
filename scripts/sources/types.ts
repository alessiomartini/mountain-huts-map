import type { RawCandidate } from '../lib/source-record.ts';

export interface SiteScraper {
  /** Matches the `source.name` used in RawCandidate.sourceName and SOURCE_PRECEDENCE. */
  sourceName: string;
  run(): Promise<RawCandidate[]>;
}

/** Facts extracted from one entry before it's wrapped into a RawCandidate. */
export interface ScrapedFacts {
  name: string;
  sourceUrl: string;
  lat?: number | null;
  lon?: number | null;
  elevationM?: number | null;
  capacity?: number | null;
  operator?: string | null;
  phone?: string | null;
  openingHours?: string | null;
  website?: string | null;
}
