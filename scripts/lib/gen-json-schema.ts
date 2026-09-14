// Regenerates src/data/huts.schema.json from the zod schema in
// src/lib/hut-schema.ts (the actual source of truth). Run with
// `npm run schema:gen` whenever the Hut shape changes.
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { HutSchema } from '../../src/lib/hut-schema.ts';

const jsonSchema = z.toJSONSchema(HutSchema, { target: 'draft-7' });
const out = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Hut',
  ...jsonSchema,
};

writeFileSync('src/data/huts.schema.json', JSON.stringify(out, null, 2) + '\n');
console.log('Wrote src/data/huts.schema.json');
