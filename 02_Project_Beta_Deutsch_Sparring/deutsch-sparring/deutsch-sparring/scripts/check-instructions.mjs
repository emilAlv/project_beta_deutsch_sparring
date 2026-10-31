// Every question tells the student WHAT to type (written by the app, lib/instructions.js): node scripts/check-instructions.mjs
process.removeAllListeners('warning');
const { instructionFor } = await import('../lib/instructions.js');
const { t } = await import('../lib/ui-text.js');
let failed = 0;
const check = (name, ok, d = '') => { if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` – ${d}`}`); };
const key = (ex) => instructionFor(ex)?.key;
check('German → English with article: article + English meaning', key({ type: 'flashcard', direction: 'de-en', checks: ['meaning', 'article'] }) === 'do_de_en_article');
check('German → English: English meaning', key({ type: 'flashcard', direction: 'de-en', checks: ['meaning'] }) === 'do_de_en');
check('English → German: word / + article / + plural', key({ type: 'flashcard', direction: 'en-de', checks: ['meaning'] }) === 'do_en_de'
  && key({ type: 'flashcard', direction: 'en-de', checks: ['meaning', 'article'] }) === 'do_en_de_article'
  && key({ type: 'flashcard', direction: 'en-de', checks: ['meaning', 'article', 'plural'] }) === 'do_en_de_plural');
const types = ['gapfill', 'choice', 'translation', 'build', 'findmistake', 'noundrill'];
check('every exercise type has an instruction', types.every((type) => key({ type })), types.filter((type) => !key({ type })).join(','));
const all = ['do_en_de', 'do_en_de_article', 'do_en_de_plural', 'do_de_en', 'do_de_en_article', ...types.map((x) => `do_${x}`)];
check('every instruction has a text (no raw keys)', all.every((k) => t(k) && t(k) !== k), all.filter((k) => !t(k) || t(k) === k).join(','));
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll instruction checks passed.');
process.exit(failed ? 1 : 0);
