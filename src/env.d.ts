/// <reference types="astro/client" />

// Minimal typing for the Workers runtime env (bindings are cast in src/lib/visits-env.ts).
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
