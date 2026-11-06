// Pure logic for the note/feedback widget (payload building), kept apart from
// the DOM code so it can be unit-tested.

export const NOTES_ENDPOINT = 'https://site-notes.alemarti-2001.workers.dev/mountain-huts-map/notes';
export const MAX_NOTE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 300;

export interface NotePayload {
  text: string;
  page: string;
  context: string;
  website: string;
}

/**
 * Short description of where the visitor is: language, hut page slug (if any)
 * and the active map filters, which the map keeps in the URL query string.
 */
export function buildContext(lang: string, pathname: string, search: string): string {
  const parts = [`lang=${lang}`];
  const hut = pathname.match(/\/hut\/([^/]+)\/?$/);
  if (hut) parts.push(`hut=${decodeURIComponent(hut[1])}`);
  const query = search.replace(/^\?/, '');
  if (query) parts.push(`filters=${query}`);
  return parts.join('; ').slice(0, MAX_CONTEXT_LENGTH);
}

/** Returns null when the text is empty after trimming. `website` is the honeypot value, sent as-is. */
export function buildPayload(
  rawText: string,
  honeypot: string,
  loc: { lang: string; pathname: string; search: string },
): NotePayload | null {
  const text = rawText.trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) return null;
  return {
    text,
    page: loc.pathname,
    context: buildContext(loc.lang, loc.pathname, loc.search),
    website: honeypot,
  };
}

// Local queue: a note stays in localStorage until the server accepted it
// (same pattern as markets-first-principles / job-research-website).
export const QUEUE_KEY = 'site-notes.pending';
const MAX_QUEUE = 20;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readQueue(store: Store): NotePayload[] {
  try {
    const list = JSON.parse(store.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(store: Store, list: NotePayload[]): void {
  try {
    if (list.length) store.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));
    else store.removeItem(QUEUE_KEY);
  } catch {
    /* storage full or blocked: nothing more to do */
  }
}

export function enqueue(store: Store, note: NotePayload): void {
  writeQueue(store, [...readQueue(store), note]);
}

/** POSTs a note; throws on network errors and on non-2xx (4xx included, so the widget shows the error). */
export async function postNote(note: NotePayload, doFetch: typeof fetch = fetch): Promise<void> {
  const res = await doFetch(NOTES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
  if (!res.ok) throw new Error(String(res.status));
}

/** Resends queued notes one by one; keeps those that still fail. Notes the server rejects with 4xx are dropped (they never will be accepted). */
export async function flushQueue(store: Store, doFetch: typeof fetch = fetch): Promise<void> {
  const left: NotePayload[] = [];
  for (const note of readQueue(store)) {
    try {
      await postNote(note, doFetch);
    } catch (e) {
      const status = Number((e as Error).message);
      if (!(status >= 400 && status < 500)) left.push(note);
    }
  }
  writeQueue(store, left);
}
