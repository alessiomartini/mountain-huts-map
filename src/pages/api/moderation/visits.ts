import type { APIRoute } from 'astro';
import { getVisitsEnv, json } from '../../../lib/visits-env.ts';
import { isAuthorized, parseModeration } from '../../../lib/visits.ts';

export const prerender = false;

// Both methods need `Authorization: Bearer <MODERATION_TOKEN>`.

// GET /api/moderation/visits[?status=pending|approved|rejected] -> list (default pending)
export const GET: APIRoute = async ({ request, url }) => {
  const { DB, MODERATION_TOKEN } = getVisitsEnv();
  if (!isAuthorized(request.headers.get('authorization'), MODERATION_TOKEN)) return json({ error: 'unauthorized' }, 401);
  if (!DB) return json({ error: 'disabled' }, 503);
  const status = url.searchParams.get('status') ?? 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status)) return json({ error: 'invalid_status' }, 400);
  const { results } = await DB.prepare(
    `SELECT id, hut_slug AS hut, visited_month AS visitedMonth, body, display_name AS displayName, lang, status, created_at AS createdAt
     FROM visits WHERE status = ? ORDER BY created_at ASC LIMIT 100`,
  )
    .bind(status)
    .all();
  return json({ visits: results });
};

// POST /api/moderation/visits  {"id": 12, "status": "approved"|"rejected"|"pending"}
export const POST: APIRoute = async ({ request }) => {
  const { DB, MODERATION_TOKEN } = getVisitsEnv();
  if (!isAuthorized(request.headers.get('authorization'), MODERATION_TOKEN)) return json({ error: 'unauthorized' }, 401);
  if (!DB) return json({ error: 'disabled' }, 503);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const m = parseModeration(raw);
  if (!m) return json({ error: 'invalid_body' }, 400);
  await DB.prepare('UPDATE visits SET status = ? WHERE id = ?').bind(m.status, m.id).run();
  return json({ ok: true, id: m.id, status: m.status });
};
