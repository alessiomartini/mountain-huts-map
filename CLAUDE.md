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

## Roadmap e progressi

Questo progetto è tracciato in https://alessiomartini.github.io/projects-overview/ tramite il file `ROADMAP.md`
nella root del repo. Mantienilo aggiornato:

- Alla fine di ogni sessione di lavoro (prima del commit finale), aggiorna `ROADMAP.md`:
  - spunta (`- [x]`) i punti completati in questa sessione;
  - aggiungi come `- [ ]` i nuovi compiti emersi, nella fase giusta (titoli `##`);
  - aggiungi in cima alla sezione `## Log` una riga `- AAAA-MM-GG: <cosa è stato fatto, in una frase>`
    (se esiste già una riga con la data di oggi, estendila invece di crearne un'altra).
- Non riscrivere né riordinare le voci esistenti senza motivo; non cancellare le voci completate.
- Se `ROADMAP.md` non esiste, crealo con le fasi `## ...`, le checkbox e una sezione `## Log`.
- Includi l'aggiornamento di `ROADMAP.md` nello stesso commit del lavoro.
