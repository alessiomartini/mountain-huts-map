// Disk cache for the data pipeline (scripts/.cache/<namespace>/<hash>.json).
// Every network call in the pipeline goes through `cached()` so a second run
// doesn't re-hit any source unless its TTL has expired.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const CACHE_ROOT = 'scripts/.cache';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

interface CacheEnvelope<T> {
  key: string;
  cachedAt: string;
  data: T;
}

function cacheKeyToPath(namespace: string, key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 24);
  return join(CACHE_ROOT, namespace, `${hash}.json`);
}

export function readCache<T>(namespace: string, key: string, ttlMs: number): T | null {
  const path = cacheKeyToPath(namespace, key);
  if (!existsSync(path)) return null;
  try {
    const envelope = JSON.parse(readFileSync(path, 'utf-8')) as CacheEnvelope<T>;
    const age = Date.now() - new Date(envelope.cachedAt).getTime();
    if (age > ttlMs) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(namespace: string, key: string, data: T): void {
  const path = cacheKeyToPath(namespace, key);
  mkdirSync(dirname(path), { recursive: true });
  const envelope: CacheEnvelope<T> = { key, cachedAt: new Date().toISOString(), data };
  writeFileSync(path, JSON.stringify(envelope));
}

/**
 * Cache-or-fetch. Returns `fromCache: true` when the TTL was still valid, so
 * callers can report "N/M requests skipped (cache hit)" in the refresh summary.
 */
export async function cached<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; fromCache: boolean }> {
  const hit = readCache<T>(namespace, key, ttlMs);
  if (hit !== null) return { data: hit, fromCache: true };
  const data = await fetcher();
  writeCache(namespace, key, data);
  return { data, fromCache: false };
}
