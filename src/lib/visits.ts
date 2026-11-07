// Pure logic for the visits ("chi c'è stato") feature: validation, IP hashing,
// rate-limit decision and moderation-token check. No Cloudflare imports here so
// it can be unit-tested with plain vitest.

export const BODY_MIN = 10;
export const BODY_MAX = 1000;
export const NAME_MAX = 40;
export const RATE_LIMIT_MAX = 3; // submissions per hashed IP...
export const RATE_LIMIT_WINDOW_S = 24 * 60 * 60; // ...per 24 hours

export interface VisitInput {
  hut: string;
  body: string;
  visitedMonth: string | null;
  displayName: string | null;
  lang: 'it' | 'en';
}

export type ValidationResult =
  | { ok: true; value: VisitInput }
  | { ok: false; honeypot?: boolean; error: string };

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
// Control characters except newline/tab are stripped.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function clean(s: string): string {
  return s.replace(CONTROL_RE, '').replace(/\r\n?/g, '\n').trim();
}

/** `now` is injectable for tests. A month in the future is rejected. */
export function validateVisit(raw: unknown, now: Date = new Date()): ValidationResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'invalid_body' };
  const r = raw as Record<string, unknown>;

  // Honeypot: a hidden field real users never fill in. Callers answer with a
  // fake success so bots don't learn anything.
  if (typeof r.website === 'string' && r.website.trim() !== '') {
    return { ok: false, honeypot: true, error: 'honeypot' };
  }

  if (typeof r.hut !== 'string' || r.hut.length > 120 || !SLUG_RE.test(r.hut)) {
    return { ok: false, error: 'invalid_hut' };
  }
  if (typeof r.body !== 'string') return { ok: false, error: 'invalid_text' };
  const body = clean(r.body);
  if (body.length < BODY_MIN) return { ok: false, error: 'text_too_short' };
  if (body.length > BODY_MAX) return { ok: false, error: 'text_too_long' };

  let visitedMonth: string | null = null;
  if (r.visitedMonth != null && r.visitedMonth !== '') {
    if (typeof r.visitedMonth !== 'string') return { ok: false, error: 'invalid_month' };
    const m = MONTH_RE.exec(r.visitedMonth);
    if (!m) return { ok: false, error: 'invalid_month' };
    const year = Number(m[1]);
    const month = Number(m[2]);
    const nowKey = now.getUTCFullYear() * 12 + now.getUTCMonth();
    if (year < 1900 || year * 12 + (month - 1) > nowKey) return { ok: false, error: 'invalid_month' };
    visitedMonth = r.visitedMonth;
  }

  let displayName: string | null = null;
  if (r.displayName != null && r.displayName !== '') {
    if (typeof r.displayName !== 'string') return { ok: false, error: 'invalid_name' };
    const name = clean(r.displayName).replace(/\s+/g, ' ');
    if (name.length > NAME_MAX) return { ok: false, error: 'invalid_name' };
    displayName = name || null;
  }

  const lang = r.lang === 'en' ? 'en' : 'it';
  return { ok: true, value: { hut: r.hut, body, visitedMonth, displayName, lang } };
}

/** SHA-256(salt + ":" + ip) as hex. The raw IP is never stored or logged. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `recentCount` = submissions by this hashed IP inside the window. */
export function isRateLimited(recentCount: number, max: number = RATE_LIMIT_MAX): boolean {
  return recentCount >= max;
}

/** Constant-time comparison of the bearer token with the configured secret. */
export function isAuthorized(authHeader: string | null, token: string | undefined): boolean {
  if (!token || token.length < 16) return false; // refuse weak/missing secrets
  const m = /^Bearer (.+)$/.exec(authHeader ?? '');
  if (!m) return false;
  const a = new TextEncoder().encode(m[1]!);
  const b = new TextEncoder().encode(token);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export const MODERATION_STATUSES = ['approved', 'rejected', 'pending'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export function parseModeration(raw: unknown): { id: number; status: ModerationStatus } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'number' || !Number.isInteger(r.id) || r.id < 1) return null;
  if (typeof r.status !== 'string' || !(MODERATION_STATUSES as readonly string[]).includes(r.status)) return null;
  return { id: r.id, status: r.status as ModerationStatus };
}
