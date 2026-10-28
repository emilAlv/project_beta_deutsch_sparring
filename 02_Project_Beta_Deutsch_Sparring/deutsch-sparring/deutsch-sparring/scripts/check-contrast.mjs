// Reads the colour tokens from app/globals.css (:root) and checks the contrast of text on its backgrounds
// (at least 4.5:1) and of field borders (at least 3:1). Plain node:  node scripts/check-contrast.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'globals.css'), 'utf8');
const root = css.match(/:root\s*\{([^}]*)\}/)[1];
const tokens = {};
for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) tokens[m[1]] = m[2];
tokens.white = '#ffffff';

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [text token, [background tokens]]
const TEXT = [
  ['ink', ['bg', 'surface', 'surface-2', 'brand-tint', 'brand-soft', 'amber-bg', 'input']],
  ['muted', ['bg', 'surface', 'surface-2', 'brand-tint', 'brand-soft', 'amber-bg', 'input']],
  ['brand', ['bg', 'surface', 'surface-2', 'brand-tint', 'brand-soft']],
  ['white', ['brand', 'brand-hover']],
  ['amber', ['amber-bg', 'surface', 'bg']],
  ['amber-text', ['amber-bg', 'surface', 'bg']],
  ['mistake', ['bg', 'surface', 'surface-2', 'amber-bg', 'input']],
];
// [border token, [backgrounds it sits on]]
const BORDERS = [['input-line', ['input', 'surface']]]; // fields sit on white cards

let failed = 0;
const line = (label, r, min) => {
  const ok = r >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${r.toFixed(2)}:1 (needs ${min}:1)`);
};
for (const [fg, bgs] of TEXT) {
  if (!tokens[fg]) { failed += 1; console.log(`FAIL token --${fg} not found`); continue; }
  for (const bg of bgs) {
    if (!tokens[bg]) { failed += 1; console.log(`FAIL token --${bg} not found`); continue; }
    line(`text --${fg} ${tokens[fg]} on --${bg} ${tokens[bg]}`, ratio(tokens[fg], tokens[bg]), 4.5);
  }
}
for (const [fg, bgs] of BORDERS) {
  if (!tokens[fg]) { failed += 1; console.log(`FAIL token --${fg} not found`); continue; }
  for (const bg of bgs) line(`border --${fg} ${tokens[fg]} on --${bg} ${tokens[bg]}`, ratio(tokens[fg], tokens[bg]), 3);
}
process.exit(failed ? 1 : 0);
