import { cai } from './sources/cai.ts';

const candidates = await cai.run();
console.log(JSON.stringify(candidates, null, 2));
