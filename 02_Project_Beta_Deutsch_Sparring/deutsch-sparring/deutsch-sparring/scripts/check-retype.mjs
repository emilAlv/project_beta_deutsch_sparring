// "Retype the correction": what is expected and how the answer is compared: node scripts/check-retype.mjs
process.removeAllListeners('warning');
const { retypeTarget, checkRetype, normalize, retypeShow, retypeIsShort } = await import('../lib/retype.js');
let failed = 0;
const check = (name, ok, d = '') => { if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` – ${d}`}`); };
const wrong = (corrected) => ({ correct: false, corrected });
const card = (direction, checks) => ({ type: 'flashcard', direction, checks, line: 'x' });
const ok = (ex, fb, text) => checkRetype(retypeTarget({ exercise: ex, feedback: fb }), text).ok;

check('normalize: quotes, final punctuation, spaces', normalize('  «Die  Entfernung».  ') === 'Die Entfernung');
check('normalize: separators', normalize('die Lampe – die Lampen') === 'die Lampe die Lampen' && normalize('die Lampe, die Lampen') === 'die Lampe die Lampen');
check('no retype when the answer was right or nothing is corrected', retypeTarget({ exercise: card('en-de', ['meaning']), feedback: { correct: true, corrected: 'die Lampe' } }) === null
  && retypeTarget({ exercise: card('en-de', ['meaning']), feedback: wrong('') }) === null);

// flashcards English → German
const hard = card('en-de', ['meaning', 'article', 'plural']);
const fb = wrong('die Entfernung, die Entfernungen');
check('Hard: article + noun + plural (comma)', ok(hard, fb, 'die Entfernung, die Entfernungen'));
check('Hard: dash or only spaces, case, quotes, final dot', ok(hard, fb, '«Die entfernung – die entfernungen».') && ok(hard, fb, 'die entfernung die entfernungen.'));
check('Hard: plural missing is not enough', !ok(hard, fb, 'die Entfernung'));
check('Hard: wrong plural shows the word that differs', checkRetype(retypeTarget({ exercise: hard, feedback: fb }), 'die Entfernung, die Entfernunge').missing.join() === 'Entfernungen');
const med = card('en-de', ['meaning', 'article']);
// the plural shown in the correction is accepted next to the expected answer (Medium: target «der Pass»)
const pass = wrong('der Pass, die Pässe');
check('Medium: «der Pass» + the shown plural is accepted', ok(med, pass, 'der Pass, die Pässe') && ok(med, pass, 'der Pass die Pässe') && ok(med, pass, 'der Pass'));
check('Medium: a wrong plural spelling is rejected', !ok(med, pass, 'der Pass, die Passe') && !ok(med, pass, 'der Pass die Passe'));
check('Medium: a word that is not in the correction is rejected', !ok(med, pass, 'der Pass, die Pässe, das Ding') && !ok(med, pass, 'der Pass, die Pässe Ding'));
check('Medium: the plural alone is not enough', !ok(med, pass, 'die Pässe') && !ok(med, pass, 'Pass die Pässe'));
check('Easy: the word + the shown plural is accepted', ok(card('en-de', ['meaning']), pass, 'Pass die Pässe'));
check('Hard: a shown extra word that is not the plural is rejected', !ok(hard, fb, 'die Entfernung, die Entfernungen, Weg'));
check('Medium: article + noun', ok(med, wrong('die Lampe, die Lampen'), 'die Lampe') && !ok(med, wrong('die Lampe, die Lampen'), 'das Lampe') && !ok(med, wrong('die Lampe, die Lampen'), 'Lampe'));
const easy = card('en-de', ['meaning']);
check('Easy: the word (with or without article)', ok(easy, wrong('die Lampe, die Lampen'), 'Lampe') && ok(easy, wrong('die Lampe, die Lampen'), 'die lampe') && !ok(easy, wrong('die Lampe, die Lampen'), 'Lamp'));
check('ß = ss, Swiss word = German word', ok(med, wrong('die Strasse, die Strassen'), 'die Straße') && ok(med, wrong('das Fahrrad, die Fahrräder'), 'das Velo'));
check('noun without plural on Hard', ok(hard, wrong('der Znüni'), 'der Znüni'));
check('verb card', ok(easy, wrong('gehen'), 'gehen'));

// flashcards German → English
const de = card('de-en', ['meaning']);
check('German → English: meaning, alternatives, the/to/article ignored', ok(de, wrong('die Lampe – lamp'), 'lamp') && ok(de, wrong('the lamp'), 'Lamp.') && ok(de, wrong('cupboard / wardrobe'), 'wardrobe')
  && ok(de, wrong('to go'), 'go') && ok(card('de-en', ['meaning', 'article']), wrong('die Lampe – lamp'), 'die – lamp') && !ok(de, wrong('lamp'), 'light'));

// gap fill
const gap = { type: 'gapfill', line: 'Ich gehe ___ Arzt.' };
const g = wrong('Ich gehe zum Arzt.');
check('Gap fill: only the missing word', ok(gap, g, 'zum') && ok(gap, g, ' Zum. '));
check('Gap fill: the full sentence also works', ok(gap, g, 'ich gehe zum arzt'));
check('Gap fill: wrong word', !ok(gap, g, 'zu') && checkRetype(retypeTarget({ exercise: gap, feedback: g }), 'zu').missing.length > 0);
check('Gap fill: two gaps', ok({ type: 'gapfill', line: '___ gehe ich ___ Hause.' }, wrong('Heute gehe ich nach Hause.'), 'Heute nach'));

check('Gap fill: a hint in brackets inside the task', ok({ type: 'gapfill', line: 'Ich ___ (heissen) Lara.' }, wrong('Ich heisse Lara.'), 'heisse'));

// sentence tasks
const tr = { type: 'translation', line: 'I am going home.' };
check('Sentence task: the corrected sentence', ok(tr, wrong('Ich gehe nach Hause.'), 'ich gehe nach hause') && !ok(tr, wrong('Ich gehe nach Hause.'), 'Ich gehe zu Hause'));
check('empty text is not right', !ok(tr, wrong('Ich gehe nach Hause.'), '   '));

// the shown extra words are only for German answers on flashcards
check('German → English: no extra words', !ok(de, wrong('die Lampe – lamp'), 'lamp Lampe'));
check('Gap fill: no extra words', !ok(gap, g, 'zum Arzt'));

// the text to type: short targets are named, long ones are not
const shown = (ex, fb) => retypeShow(retypeTarget({ exercise: ex, feedback: fb }));
const short = (ex, fb) => retypeIsShort(retypeTarget({ exercise: ex, feedback: fb }));
check('display: Medium shows the article + word', shown(med, pass) === 'der Pass' && short(med, pass));
check('display: Hard shows article + word + plural', shown(hard, fb) === 'die Entfernung, die Entfernungen' && short(hard, fb));
check('display: Easy shows the word with its article', shown(easy, wrong('die Lampe, die Lampen')) === 'die Lampe');
check('display: German → English shows the English meaning', shown(de, wrong('die Lampe – lamp / light')) === 'lamp' && short(de, wrong('die Lampe – lamp / light')));
check('display: gap fill shows the missing word', shown(gap, g) === 'zum' && short(gap, g));
const longSentence = 'Ich gehe heute am Nachmittag mit meiner Schwester in den grossen Park spazieren.';
check('display: a long sentence is not named', shown(tr, wrong(longSentence)) === normalize(longSentence) && !short(tr, wrong(longSentence)));
check('display: a short sentence is named', shown(tr, wrong('Ich gehe nach Hause.')) === 'Ich gehe nach Hause' && short(tr, wrong('Ich gehe nach Hause.')));
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll retype checks passed.');
process.exit(failed ? 1 : 0);
