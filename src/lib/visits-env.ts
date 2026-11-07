// Access to the optional D1 binding and secrets. Everything is optional so the
// site works (feature disabled) before the D1 database exists.
import { env } from 'cloudflare:workers';

/** Minimal D1 surface used here (avoids depending on generated worker types). */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
  };
}

export interface VisitsEnv {
  DB?: D1Like;
  IP_SALT?: string;
  MODERATION_TOKEN?: string;
}

export function getVisitsEnv(): VisitsEnv {
  return env as unknown as VisitsEnv;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
