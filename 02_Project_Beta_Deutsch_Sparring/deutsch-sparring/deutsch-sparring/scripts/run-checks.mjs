// `npm test`: runs every scripts/check-*.mjs with plain node, one after the other, and fails if any of them fails.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => /^check-.*\.mjs$/.test(f)).sort();
const failed = [];
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', cwd: path.join(dir, '..') });
  if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : `\nAll ${files.length} check scripts passed.`);
process.exit(failed.length ? 1 : 0);
