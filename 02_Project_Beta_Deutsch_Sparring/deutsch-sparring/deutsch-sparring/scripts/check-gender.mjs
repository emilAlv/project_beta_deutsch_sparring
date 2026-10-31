// Checks the der/die/das rules of thumb (lib/gender.js) against the word list: "immer" rules are never wrong,
// every other rule is right far more often than not, exceptions are named, and the tutor's word list carries them.
//   node scripts/check-gender.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const { genderRule } = await import('../lib/gender.js');
const { getWords, wordLine, WORD_LINE_HEADER } = await import('../lib/words.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

check('-e → meist feminin', genderRule('Lampe', 'die')?.fits === true && /-e → meist feminin \(die\)/.test(genderRule('Lampe', 'die').text));
check('an exception is named', genderRule('Auge', 'das')?.fits === false && /AUSNAHME: das Auge/.test(genderRule('Auge', 'das').text));
check('-ung, -chen, Ge-…-e', genderRule('Wohnung', 'die')?.how === 'immer' && genderRule('Brötchen', 'das')?.expected === 'das' && genderRule('Gebäude', 'das')?.fits === true);
check('not every -chen / -um is the ending (Kuchen, Baum)', genderRule('Kuchen', 'der') === null && genderRule('Baum', 'der') === null);
check('compound: the last part decides', genderRule('Kinder-Zeitung', 'die')?.ending === '-ung');
check('no rule → null (better nothing than a wrong rule)', genderRule('Tisch', 'der') === null && genderRule('Zimmer', 'das') === null);

const nouns = getWords().filter((w) => w.type === 'noun' && ['der', 'die', 'das'].includes(w.article));
const rows = nouns.map((w) => ({ w, r: genderRule(w.noun, w.article) })).filter((x) => x.r);
const always = rows.filter((x) => x.r.how === 'immer' && !x.r.fits).map((x) => `${x.w.article} ${x.w.noun}`);
check('"immer" rules are never wrong in the word list', always.length === 0, always.join(', '));
const fits = rows.filter((x) => x.r.fits).length;
check('rules are right for at least 80 % of the nouns they match', fits / rows.length >= 0.8, `${fits} of ${rows.length}`);

const line = wordLine(nouns.find((w) => w.noun === 'Wohnung') || nouns[0]);
check('the tutor\'s word list has a "gender rule" column', WORD_LINE_HEADER.includes('gender rule') && line.split(' | ').length === WORD_LINE_HEADER.split(' | ').length);
check('the word list has "extra" and "new" columns; only a fresh word is marked', WORD_LINE_HEADER.endsWith('extra | new') && wordLine(nouns[0], true).endsWith(' | new') && !wordLine(nouns[0]).endsWith(' | new'));

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll gender checks passed.');
process.exit(failed ? 1 : 0);
