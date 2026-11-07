import type { APIRoute } from 'astro';
import { getVisitsEnv, json } from '../../lib/visits-env.ts';
import { RATE_LIMIT_WINDOW_S, hashIp, isRateLimited, validateVisit } from '../../lib/visits.ts';

export const prerender = false;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// GET /api/visits?hut=<slug> -> approved visits. Always 200: {enabled:false}
// when the D1 binding is missing, so the static page degrades quietly.
export const GET: APIRoute = async ({ url }) => {
  const { DB } = getVisitsEnv();
  if (!DB) return json({ enabled: false, visits: [] });
  const hut = url.searchParams.get('hut') ?? '';
  if (!SLUG_RE.test(hut) || hut.length > 120) return json({ error: 'invalid_hut' }, 400);
  try {
    const { results } = await DB.prepare(
      `SELECT id, visited_month AS visitedMonth, body, display_name AS displayName, created_at AS createdAt
       FROM visits WHERE hut_slug = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(hut)
      .all();
    return json({ enabled: true, visits: results });
  } catch {
    return json({ enabled: false, visits: [] });
  }
};

// POST /api/visits -> stores a pending visit.
export const POST: APIRoute = async ({ request }) => {
  const { DB, IP_SALT } = getVisitsEnv();
  if (!DB || !IP_SALT) return json({ enabled: false, error: 'disabled' }, 503);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const result = validateVisit(raw);
  if (!result.ok) {
    if (result.honeypot) return json({ ok: true }); // fake success for bots
    return json({ error: result.error }, 400);
  }
  const v = result.value;

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const ipHash = await hashIp(ip, IP_SALT);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await DB.prepare('SELECT COUNT(*) AS n FROM visits WHERE ip_hash = ? AND created_at > ?')
      .bind(ipHash, now - RATE_LIMIT_WINDOW_S)
      .first<{ n: number }>();
    if (isRateLimited(row?.n ?? 0)) return json({ error: 'rate_limited' }, 429);
    await DB.prepare(
      `INSERT INTO visits (hut_slug, visited_month, body, display_name, lang, status, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(v.hut, v.visitedMonth, v.body, v.displayName, v.lang, ipHash, now)
      .run();
  } catch {
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true, status: 'pending' }, 201);
};
