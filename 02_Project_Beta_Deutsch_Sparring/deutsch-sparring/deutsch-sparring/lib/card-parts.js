// Which parts of a flashcard were right, for the small line under the correction:
//   "Meaning ✓ · Article ✗ (die) · Plural ✓"
// feedback.parts has only the parts the card tested (lib/reply.js); a part that is null was not judged and is left out.
// The right article / plural for a wrong part is read from feedback.corrected ("die Lampe, die Lampen" or "die Lampe – lamp").
// No React, no browser APIs.

const ARTICLE = /\b(der|die|das)\b/i;

// → [{ part: 'meaning' | 'article' | 'plural', ok: boolean, fix: string }]  (empty = nothing to show)
export function partsView(f) {
  const parts = f?.parts;
  if (!parts || typeof parts !== 'object') return [];
  const corrected = String(f.corrected || '');
  const article = corrected.match(ARTICLE)?.[1]?.toLowerCase() || '';
  const plural = corrected.includes(',') ? corrected.split(',')[1].split(/\s[–-]\s/)[0].trim() : '';
  return ['meaning', 'article', 'plural']
    .filter((p) => parts[p] === true || parts[p] === false)
    .map((p) => ({ part: p, ok: parts[p], fix: parts[p] ? '' : p === 'article' ? article : p === 'plural' ? plural : '' }));
}
