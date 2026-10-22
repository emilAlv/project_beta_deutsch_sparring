// Rules of thumb for the gender (der / die / das) of a German noun, worked out by the APP from the word's ending,
// so the tutor can explain an article mistake with a real rule ("Endung -e → meist feminin") and say honestly when
// the word is an exception (der Name). In a compound word the last part decides, so the ending works for it too.
// Ordered: the first matching ending wins (longer, more reliable endings first). Rules that are wrong too often
// (e.g. "-er → der": das Zimmer, das Alter) are left out on purpose – no rule is better than a misleading one.
// Checked against the word list: npm test (scripts/check-gender.mjs).
const NOT_ENDING = { chen: /(u|a)chen$/, um: /aum$/ }; // Kuchen, Drachen, Baum, Raum: not the -chen / -um ending

const RULES = [
  // always / almost always
  { end: ['chen', 'lein'], article: 'das', how: 'immer' },
  { end: ['ung', 'heit', 'keit', 'schaft'], article: 'die', how: 'immer' },
  { end: ['erin', 'istin', 'antin', 'entin', 'orin'], article: 'die', how: 'immer', note: 'weibliche Person' },
  { end: ['ion', 'tät'], article: 'die', how: 'fast immer' },
  { end: ['ling', 'ismus'], article: 'der', how: 'fast immer' },
  { end: ['ment'], article: 'das', how: 'meist' },
  { end: ['ei', 'ie', 'ik', 'enz', 'anz'], article: 'die', how: 'meist' },
  { end: ['eur'], article: 'der', how: 'meist', note: 'oft Personen' },
  { end: ['ur'], article: 'die', how: 'meist' },
  { end: ['ist'], article: 'der', how: 'meist', note: 'oft Personen' },
  { end: ['or', 'ig', 'ich'], article: 'der', how: 'meist' },
  { end: ['um', 'tum', 'nis', 'ma'], article: 'das', how: 'meist' },
  { start: 'ge', end: ['e'], article: 'das', how: 'oft', note: 'Ge- … -e' },
  { end: ['e'], article: 'die', how: 'meist' },
  { end: ['o', 'y'], article: 'das', how: 'oft', note: 'Fremdwörter' },
];

const GENDER = { der: 'maskulin', die: 'feminin', das: 'neutral' };

// noun "Rose", article "die" → { ending: '-e', expected: 'die', how: 'meist', fits: true, text: 'Endung -e → meist feminin (die).' }
// null when no rule matches (then a memory help is better than a rule).
export function genderRule(noun, article) {
  const n = String(noun || '').trim().toLowerCase().split(/[\s-]+/).pop() || '';
  if (n.length < 3 || !GENDER[article]) return null;
  for (const r of RULES) {
    if (r.start && !n.startsWith(r.start)) continue;
    const ending = r.end.find((e) => n.endsWith(e) && n.length > e.length + 1 && !NOT_ENDING[e]?.test(n));
    if (!ending) continue;
    const fits = r.article === article;
    const base = `${r.start ? 'Ge- … -e' : `Endung -${ending}`} → ${r.how} ${GENDER[r.article]} (${r.article})${r.note && !r.start ? `, ${r.note}` : ''}.`;
    return {
      ending: r.start ? 'Ge-…-e' : `-${ending}`, expected: r.article, how: r.how, fits,
      text: fits ? base : `${base} AUSNAHME: ${article} ${noun.trim()}.`,
    };
  }
  return null;
}
