import { describe, expect, it } from 'vitest';
import { buildContext, buildPayload, MAX_NOTE_LENGTH } from './notes.ts';

describe('buildContext', () => {
  it('includes language and filters from the query string', () => {
    expect(buildContext('it', '/it/', '?type=bivacco&free=1')).toBe('lang=it; filters=type=bivacco&free=1');
  });
  it('includes the hut slug on hut pages', () => {
    expect(buildContext('en', '/en/hut/bivacco-lanfranconi', '')).toBe('lang=en; hut=bivacco-lanfranconi');
  });
  it('is capped in length', () => {
    expect(buildContext('it', '/it/', '?q=' + 'x'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});

describe('buildPayload', () => {
  const loc = { lang: 'it', pathname: '/it/', search: '' };
  it('returns null for blank text', () => {
    expect(buildPayload('   \n', '', loc)).toBeNull();
  });
  it('builds the expected body and passes the honeypot through', () => {
    expect(buildPayload('  ciao ', 'spam', loc)).toEqual({
      text: 'ciao',
      page: '/it/',
      context: 'lang=it',
      website: 'spam',
    });
  });
  it('truncates over-long text', () => {
    expect(buildPayload('a'.repeat(MAX_NOTE_LENGTH + 50), '', loc)?.text.length).toBe(MAX_NOTE_LENGTH);
  });
});

import { enqueue, flushQueue, readQueue } from './notes.ts';

describe('queue', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const note = { text: 'x', page: '/it/', context: '', website: '' };
  it('keeps notes while the server fails and empties the queue on success', async () => {
    const store = mem();
    enqueue(store, note);
    await flushQueue(store, (async () => new Response('', { status: 500 })) as typeof fetch);
    expect(readQueue(store)).toHaveLength(1);
    const calls: string[] = [];
    await flushQueue(store, (async (_u: unknown, init: RequestInit) => { calls.push(String(init.body)); return new Response('{}', { status: 201 }); }) as typeof fetch);
    expect(readQueue(store)).toHaveLength(0);
    expect(JSON.parse(calls[0])).toEqual(note);
  });
  it('drops notes rejected with 4xx', async () => {
    const store = mem();
    enqueue(store, note);
    await flushQueue(store, (async () => new Response('', { status: 400 })) as typeof fetch);
    expect(readQueue(store)).toHaveLength(0);
  });
});
