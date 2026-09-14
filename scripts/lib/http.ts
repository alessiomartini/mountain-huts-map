// Polite HTTP helper for the data pipeline: identifying User-Agent, one
// request at a time with an enforced pause, and a robots.txt check for the
// scrapers. Callers must await each request sequentially (a for-loop, not
// Promise.all) for the pacing to mean anything.
export const USER_AGENT =
  'mountain-huts-map-bot/1.0 (+https://github.com/alessiomartini/mountain-huts-map)';

let lastRequestAt = 0;

export interface PoliteFetchOptions {
  /** Minimum pause since the previous politeFetch call, in ms. Default 1500. */
  minDelayMs?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
  body?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function politeFetch(url: string, options: PoliteFetchOptions = {}): Promise<Response> {
  const minDelay = options.minDelayMs ?? 1500;
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < minDelay) await sleep(minDelay - elapsed);
  lastRequestAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    return await fetch(url, {
      method: options.method,
      body: options.body,
      headers: { 'User-Agent': USER_AGENT, ...options.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const robotsCache = new Map<string, string[]>();

/** Very small robots.txt reader: only understands `User-agent: *` + `Disallow:` prefixes. */
async function getDisallowRules(origin: string): Promise<string[]> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  let rules: string[] = [];
  try {
    const res = await politeFetch(`${origin}/robots.txt`, { minDelayMs: 0 });
    if (res.ok) {
      const text = await res.text();
      let inWildcardBlock = false;
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (/^user-agent:\s*\*/i.test(line)) {
          inWildcardBlock = true;
        } else if (/^user-agent:/i.test(line)) {
          inWildcardBlock = false;
        } else if (inWildcardBlock) {
          const match = line.match(/^disallow:\s*(\S*)/i);
          if (match && match[1]) rules.push(match[1]);
        }
      }
    }
  } catch {
    // No robots.txt or unreachable: treat as "everything allowed".
    rules = [];
  }
  robotsCache.set(origin, rules);
  return rules;
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const rules = await getDisallowRules(parsed.origin);
  return !rules.some((rule) => parsed.pathname.startsWith(rule));
}
