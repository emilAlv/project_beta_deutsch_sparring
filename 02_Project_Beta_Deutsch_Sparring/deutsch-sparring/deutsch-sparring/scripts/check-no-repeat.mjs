// A word answered right in a session is never asked again as a flashcard (lib/reply.js swapRepeatedCard). node scripts/check-no-repeat.mjs
process.removeAllListeners('warning');
const { normalizeReply } = await import('../lib/reply.js');
let failed = 0;
const check = (name, ok, d = '') => { if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` – ${d}`}`); };
const W = (id, en, article, noun) => ({ id, de: `${article} ${noun}`, type: 'noun', en, article, noun, plural: `${article} ${noun}n` });
const vorname = W('der vorname', 'the first name', 'der', 'Vorname');
const lampe = W('die lampe', 'the lamp', 'die', 'Lampe');
const tisch = W('der tisch', 'the table', 'der', 'Tisch');
const words = [vorname, lampe, tisch];
const ctx = (extra) => ({ level: 'A1', difficulty: 'medium', topicIds: new Set(['x']), topicId: 'x', wordIds: new Set(words.map((w) => w.id)), wordById: new Map(words.map((w) => [w.id, w])), direction: 'en-de', wordsOnly: true, rightWordIds: new Set(), askedWordIds: new Set(), ...extra });
const card = (w, direction = 'en-de', extra = {}) => ({ number: 8, type: 'Karteikarte', direction, line: direction === 'en-de' ? w.en : `${w.article} ${w.noun}`, answer: `${w.article} ${w.noun}`, hint: 'Tipp', wordId: w.id, ...extra });
const run = (exercise, c, feedback, message = `Weiter: ${exercise.line}`) => normalizeReply({ message, feedback, exercise, options: ['a', 'b'] }, c);
const right = { forNumber: 7, correct: true, studentAnswer: 'der Vorname', corrected: 'der Vorname', changedWords: [], explanation: '', rule: '' };
const wrong = { ...right, correct: false, studentAnswer: 'die Lampe', corrected: 'der Vorname', errorType: 'Wortschatz' };

let r = run(card(vorname), ctx({ rightWordIds: new Set([vorname.id]), askedWordIds: new Set([vorname.id]) }));
check('EN→DE: repeat of a right word becomes the next unused word', r.exercise.wordId === lampe.id && r.exercise.line === 'the lamp' && r.exercise.task === 'flashcard', JSON.stringify(r.exercise));
check('…hint and options of the old word are gone, message follows', r.exercise.hint === null && r.options.length === 0 && r.message.includes('the lamp') && !r.message.includes('first name'), `${r.message}`);
check('…checks recomputed (meaning + article on Medium)', JSON.stringify(r.exercise.checks) === '["meaning","article"]', JSON.stringify(r.exercise.checks));

r = run(card(vorname, 'de-en'), ctx({ direction: 'de-en', rightWordIds: new Set([vorname.id]), askedWordIds: new Set([vorname.id, lampe.id]) }));
check('DE→EN: article + noun of the next unused word (skips asked ones)', r.exercise.wordId === tisch.id && r.exercise.line === 'der Tisch' && r.exercise.direction === 'de-en', JSON.stringify(r.exercise));

r = run(card(vorname), ctx({ openTask: 'flashcard', openWordId: vorname.id, askedWordIds: new Set([vorname.id]) }), right);
check('the word just answered right is not asked again', r.exercise.wordId === lampe.id, JSON.stringify(r.exercise));

r = run(card(vorname), ctx({ openTask: 'flashcard', openWordId: vorname.id, askedWordIds: new Set([vorname.id]) }), wrong);
check('a word answered WRONG may come again', r.exercise.wordId === vorname.id && r.exercise.line === 'the first name', JSON.stringify(r.exercise));

r = run(card(vorname), ctx({ rightWordIds: new Set([vorname.id, tisch.id]), askedWordIds: new Set(words.map((w) => w.id)) }));
check('only a word answered wrong is left: it is used (may come again)', r.exercise.wordId === lampe.id, JSON.stringify(r.exercise));

r = run({ number: 8, type: 'Lückentext', line: 'Mein ___ ist Tom.', answer: 'Vorname', wordId: vorname.id }, ctx({ rightWordIds: new Set([vorname.id]), wordsOnly: false }));
check('a grammar task for a right word stays', r.exercise.wordId === vorname.id && r.exercise.task === 'grammar', JSON.stringify(r.exercise));

r = run(card(vorname), ctx({ rightWordIds: new Set(words.map((w) => w.id)) }));
check('nothing left: unchanged', r.exercise.wordId === vorname.id && r.exercise.line === 'the first name' && r.options.length === 2, JSON.stringify(r.exercise));

r = run(card(vorname), ctx({}));
check('no right words: untouched', r.exercise.wordId === vorname.id);

// ---------- BUG 2: the app decides the meaning of an English → German card ----------
const klein = { id: 'klein', de: 'klein', type: 'adjective', en: 'small, short', article: '', noun: '' };
const kasten = W('der kasten', 'the cupboard', 'der', 'Kasten');
const all2 = [vorname, klein, kasten];
const judgeCtx = (word, extra) => ({ ...ctx({}), wordIds: new Set(all2.map((w) => w.id)), wordById: new Map(all2.map((w) => [w.id, w])), openTask: 'flashcard', openDirection: 'en-de', openWordId: word.id, openChecks: ['meaning'], ...extra });
const aiSays = (correct, student) => ({ forNumber: 7, correct, studentAnswer: student, corrected: student, changedWords: [], explanation: correct ? 'Richtig!' : '', rule: '', errorType: correct ? null : 'Wortschatz', parts: { meaning: correct } });
const judge = (word, student, aiCorrect, extra) => normalizeReply({ message: aiCorrect ? 'Richtig! Weiter.' : 'Nicht ganz.', feedback: aiSays(aiCorrect, student), exercise: null }, judgeCtx(word, { studentText: student, ...extra })).feedback;
let fb = judge(vorname, 'der Name', true);
check('«der Name» for "the first name" is WRONG even if the AI said correct', fb.correct === false && fb.errorType === 'vocab' && fb.corrected.startsWith('der Vorname') && !/richtig/i.test(fb.explanation) && fb.why?.here.includes('der Vorname'), JSON.stringify(fb));
fb = judge(vorname, 'der Vorname', true);
check('«der Vorname» is right', fb.correct === true);
fb = judge(vorname, 'Vorname', false);
check('the right word is right even if the AI said wrong (no article typed: article not judged)', fb.parts.meaning === true, JSON.stringify(fb));
fb = judge(klein, 'kurz', true);
check('«kurz» for "small, short" keeps the AI verdict (correct)', fb.correct === true);
fb = judge(klein, 'kurz', false);
check('…and keeps a wrong verdict', fb.correct === false);
fb = judge(kasten, 'der Schrank', true);
check('Swiss/German variant counts as the same word', fb.correct === true, JSON.stringify(fb));
fb = judge(vorname, 'der Name', true, { openDirection: 'de-en' });
check('German → English cards are not judged by the app', fb.correct === true);
const rr = normalizeReply({ message: 'Richtig! Das war es.', feedback: aiSays(true, 'der Name'), exercise: null }, judgeCtx(vorname, { studentText: 'der Name' }));
check('praise in the message is replaced by a neutral line', !/richtig/i.test(rr.message), rr.message);
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll no-repeat checks passed.');
process.exit(failed ? 1 : 0);
