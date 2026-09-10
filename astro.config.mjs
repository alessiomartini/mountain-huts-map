// Astro config. See docs before touching the adapter section:
// https://docs.astro.build/en/guides/integrations-guide/cloudflare/
// @astrojs/cloudflare v13+ dropped Pages support (Workers only) and
// Astro.locals.runtime.env (use `import { env } from 'cloudflare:workers'` instead).
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// TODO: replace with the real production domain once one exists (see README).
const SITE = 'https://mountain-huts-map.workers.dev';

export default defineConfig({
  site: SITE,
  output: 'static', // default: pages are prerendered; opt out per-route with `export const prerender = false`
  adapter: cloudflare(),
});
