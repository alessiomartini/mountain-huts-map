// Astro config. See docs before touching the adapter section:
// https://docs.astro.build/en/guides/integrations-guide/cloudflare/
// @astrojs/cloudflare v13+ dropped Pages support (Workers only) and
// Astro.locals.runtime.env (use `import { env } from 'cloudflare:workers'` instead).
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// No custom domain: the workers.dev address is the site's only address.
const SITE = 'https://mountain-huts-map.alemarti-2001.workers.dev';

export default defineConfig({
  site: SITE,
  output: 'static', // default: pages are prerendered; opt out per-route with `export const prerender = false`
  adapter: cloudflare(),
});
