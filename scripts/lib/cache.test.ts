import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached, readCache, writeCache } from './cache.ts';

const TEST_NAMESPACE = 'test-cache-namespace';

afterEach(() => {
  if (existsSync(`scripts/.cache/${TEST_NAMESPACE}`)) rmSync(`scripts/.cache/${TEST_NAMESPACE}`, { recursive: true });
});

describe('cache', () => {
  it('round-trips a value through writeCache/readCache', () => {
    writeCache(TEST_NAMESPACE, 'key-1', { hello: 'world' });
    expect(readCache(TEST_NAMESPACE, 'key-1', 1000)).toEqual({ hello: 'world' });
  });

  it('returns null once the TTL has expired', () => {
    writeCache(TEST_NAMESPACE, 'key-2', { value: 1 });
    expect(readCache(TEST_NAMESPACE, 'key-2', -1)).toBeNull(); // negative TTL: instantly "expired"
  });

  it('returns null for a key that was never written', () => {
    expect(readCache(TEST_NAMESPACE, 'never-written', 1000)).toBeNull();
  });

  it('cached() only calls the fetcher once across two calls within the TTL — this is what makes a second data:refresh run skip already-cached HTTP requests', async () => {
    const fetcher = vi.fn().mockResolvedValue('fetched-value');
    const first = await cached(TEST_NAMESPACE, 'key-3', 60_000, fetcher);
    const second = await cached(TEST_NAMESPACE, 'key-3', 60_000, fetcher);
    expect(first).toEqual({ data: 'fetched-value', fromCache: false });
    expect(second).toEqual({ data: 'fetched-value', fromCache: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cached() calls the fetcher again once the TTL expires', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    await cached(TEST_NAMESPACE, 'key-4', -1, fetcher); // instantly expired TTL
    await cached(TEST_NAMESPACE, 'key-4', -1, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
