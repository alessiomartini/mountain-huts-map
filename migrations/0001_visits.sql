-- Visits ("chi c'è stato"): short experiences shared by visitors, moderated.
-- Apply with: wrangler d1 migrations apply <DB_NAME> --remote  (see README).
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hut_slug TEXT NOT NULL,
  visited_month TEXT,            -- 'YYYY-MM' (month precision), optional
  body TEXT NOT NULL CHECK (length(body) BETWEEN 10 AND 1000),
  display_name TEXT CHECK (display_name IS NULL OR length(display_name) <= 40),
  lang TEXT NOT NULL DEFAULT 'it',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash TEXT NOT NULL,         -- SHA-256(IP_SALT + ip), never the raw IP
  created_at INTEGER NOT NULL    -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_visits_hut_status ON visits (hut_slug, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_ip_created ON visits (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_visits_status_created ON visits (status, created_at);
