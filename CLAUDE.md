# Claude Code instructions

## Project

Astro/TypeScript map application with Cloudflare worker/data tooling.

## Verification

- Install with `npm ci` when needed.
- Run `npm run test`, `npm run typecheck`, and `npm run build` as appropriate
  for the changed surface.
- Use `npm run dev` for UI changes; inspect the map and browser console.
- Use `npm run seed:test-data` for local test data, never real personal data.

## Workflow

- Read `README.md`, schemas, scripts, and the affected map component before editing.
- Keep generated datasets and Cloudflare credentials out of commits.
- Do not deploy; run `npm run deploy` only with explicit approval.
- Inspect `git diff` and report the exact checks run before committing.
