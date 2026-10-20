// Checks the grammar tasks of the demo tutor (lib/word-tasks.js, lib/declension.js) on every word of the word list:
//   node scripts/check-word-tasks.mjs            (add --samples to print example tasks to read through)
// Every task's own solution must be accepted; an empty answer must be wrong; no "ß"; known forms must be right.

process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const W = await import('../lib/words.js');
const T = await import('../lib/word-tasks.js');
const D = await import('../lib/declension.js');
const G = await import('../lib/grammar.js');
const R = await import('../lib/reply.js');
const { readFileSync } = await import('node:fs');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ---- known forms (written by hand) ----
const word = (article, noun, plural = '', extra = {}) => ({ id: noun, type: 'noun', article, noun, plural, number: '', ...extra });
const ph = (w, kase, adj = null) => D.nounPhrase(w, kase, { adj })?.phrase;
eq('Genitiv der Schrank', ph(word('der', 'Schrank', 'die Schränke'), 'Genitiv', 'alt'), 'des alten Schrankes');
eq('Genitiv die Lampe', ph(word('die', 'Lampe', 'die Lampen'), 'Genitiv', 'hell'), 'der hellen Lampe');
eq('Genitiv das Haus', ph(word('das', 'Haus', 'die Häuser'), 'Genitiv', 'gross'), 'des grossen Hauses');
eq('Genitiv der Computer', ph(word('der', 'Computer', 'die Computer'), 'Genitiv', 'neu'), 'des neuen Computers');
eq('Genitiv der Nachbar (weak)', ph(word('der', 'Nachbar', 'die Nachbarn'), 'Genitiv', 'nett'), 'des netten Nachbarn');
eq('Akkusativ der Nachbar (weak)', ph(word('der', 'Nachbar', 'die Nachbarn'), 'Akkusativ'), 'den Nachbarn');
eq('Genitiv der Familienname', ph(word('der', 'Familienname', 'die Familiennamen'), 'Genitiv'), 'des Familiennamens');
eq('Genitiv der Kunde (weak)', ph(word('der', 'Kunde', 'die Kunden'), 'Genitiv'), 'des Kunden');
eq('Genitiv der Student (weak)', ph(word('der', 'Student', 'die Studenten'), 'Genitiv'), 'des Studenten');
eq('Genitiv das Kind', ph(word('das', 'Kind', 'die Kinder'), 'Genitiv', 'klein'), 'des kleinen Kindes');
eq('Genitiv der Tisch (-es)', ph(word('der', 'Tisch', 'die Tische'), 'Genitiv'), 'des Tisches');
eq('Genitiv der Fluss (ss)', ph(word('der', 'Fluss', 'die Flüsse'), 'Genitiv'), 'des Flusses');
eq('Genitiv der Staat (unsure → none)', ph(word('der', 'Staat', 'die Staaten'), 'Genitiv'), undefined);
eq('Genitiv das Ergebnis (unsure → none)', ph(word('das', 'Ergebnis', 'die Ergebnisse'), 'Genitiv'), undefined);
eq('Dativ der Schrank', ph(word('der', 'Schrank', 'die Schränke'), 'Dativ', 'alt'), 'dem alten Schrank');
eq('Dativ die Lampe', ph(word('die', 'Lampe', 'die Lampen'), 'Dativ', 'hell'), 'der hellen Lampe');
eq('Dativ plural (die Eltern)', ph(word('die', 'Eltern', '', { number: 'pl' }), 'Dativ', 'nett'), 'den netten Eltern');
eq('Dativ plural (die Bücher → Büchern)', D.nounPhrase(word('das', 'Buch', 'die Bücher'), 'Dativ', { plural: true, adj: 'gut' }).phrase, 'den guten Büchern');
eq('Akkusativ das Bett', ph(word('das', 'Bett', 'die Betten'), 'Akkusativ', 'breit'), 'das breite Bett');
eq('Akkusativ der Tisch', ph(word('der', 'Tisch', 'die Tische'), 'Akkusativ', 'rund'), 'den runden Tisch');
eq('indefinite alternative', D.nounPhrase(word('der', 'Schrank', 'die Schränke'), 'Akkusativ', { adj: 'alt' }).alts, ['einen alten Schrank']);
eq('adjective dunkel', D.withEnding('dunkel', 'en'), 'dunklen');
eq('adjective teuer', D.withEnding('teuer', 'e'), 'teure');
eq('adjective leer (keeps both e)', D.withEnding('leer', 'en'), 'leeren');
eq('adjective müde + en', D.withEnding('müde', 'en'), 'müden');
eq('adjective müde + e', D.withEnding('müde', 'e'), 'müde');
eq('adjective böse + er', D.withEnding('böse', 'er'), 'böser');
eq('adjective sauber',D.withEnding('sauber', 'e'), 'saubere');
eq('adjective sauer', D.withEnding('sauer', 'e'), 'saure');
eq('adjective hoch',D.withEnding('hoch', 'es'), 'hohes');

// ---- grammar settings ----
eq('cleanGrammar keeps known points in order', G.cleanGrammar(['dativ', 'x', 'perfekt', 'dativ']), ['dativ', 'perfekt']);
eq('cleanGrammar: not a list → null', G.cleanGrammar('dativ'), null);
check('article & plural alone: no sentence tasks', G.wantsSentenceTasks(['article-plural']) === false);
check('Dativ: sentence tasks', G.wantsSentenceTasks(['dativ']) === true);

// ---- every task of every word accepts its own solution ----
const words = W.getWords();
const counts = {};
const problems = [];
const samples = {};
const variants = [G.GRAMMAR_POINTS, G.GRAMMAR_POINTS.filter((p) => p !== 'adjective-endings'), ['genitiv'], ['perfekt'], ['verb-case'], ['adjective-endings'], []];
for (const w of words) {
  for (const grammar of variants) {
    for (const t of T.taskList(w, grammar)) {
      counts[`${w.type}:${t.kind}`] = (counts[`${w.type}:${t.kind}`] || 0) + 1;
      if (/ß/.test(t.solution + t.line + t.rule)) problems.push(`${w.id}: "ß" in ${t.line}`);
      const r = t.check(t.solution);
      if (!r.correct) problems.push(`${w.id}: own solution rejected – ${t.line} → ${t.solution} (${r.explanation})`);
      const bad = t.check('Vielleicht');
      if (bad.correct) problems.push(`${w.id}: nonsense accepted – ${t.line}`);
      if (!bad.correct && !bad.errorType) problems.push(`${w.id}: wrong answer without errorType – ${t.line}`);
      if (!t.rule) problems.push(`${w.id}: task without rule – ${t.line}`);
      if (t.kind === 'noun' && t.type !== 'Nomen-Drill') problems.push(`${w.id}: noun task is not a Nomen-Drill – ${t.line}`);
      if (t.kind === 'noun') {
        for (const d of ['easy', 'medium', 'hard']) for (const strong of [false, true]) {
          const hint = t.hint(strong, d);
          if (hint && T.norm(hint).includes(T.norm(t.solution))) problems.push(`${w.id}: hint reveals noun solution – ${t.line}`);
        }
      }
      if (T.findTask(w, t.line)?.line !== t.line) problems.push(`${w.id}: task not found again by its text – ${t.line}`);
      const key = `${w.type}:${t.kind}:${t.rule}`;
      if (!samples[key]) samples[key] = `${t.line}\n      → ${t.solution}`;
    }
  }
}
check('every task accepts its own solution, has a rule, no ß', problems.length === 0, problems.slice(0, 8).join(' | '));
console.log('task variants checked:', JSON.stringify(counts));
if (process.argv.includes('--samples')) for (const [k, v] of Object.entries(samples)) console.log(`  ${k}\n      ${v}`);

// ---- noun drills: morphology without arbitrary predicates ----
const schrank = { ...word('der', 'Schrank', 'die Schränke', { id: 'x', adjective: 'alt' }) };
const gen = T.taskList(schrank, ['genitiv', 'adjective-endings']).find((t) => t.rule === G.RULES.nounGen);
eq('Genitiv task type', gen.type, 'Nomen-Drill');
eq('Genitiv task line', gen.line, 'Setze in den Genitiv: der · alt · Schrank');
eq('Genitiv solution', gen.solution, 'des alten Schrankes');
eq('Genitiv right', gen.check('des alten Schranks').correct, true);
eq('Genitiv wrong ending → Adjektivendung', gen.check('des alte Schrankes').errorType, 'Adjektivendung');
eq('Genitiv wrong case → Kasus', gen.check('dem alten Schrank').errorType, 'Kasus');
eq('Genitiv wrong gender article stays case when gender is possible', gen.check('der alten Schranks').errorType, 'Kasus');
eq('Genitiv wrong article "das" → Artikel', gen.check('das alte Schrank').errorType, 'Artikel');
eq('Genitiv word missing → Wortschatz', gen.check('des alten Tisches').errorType, 'Wortschatz');
const dat = T.taskList(schrank, ['dativ', 'adjective-endings']).find((t) => t.rule === G.RULES.nounDat);
eq('Dativ task line', dat.line, 'Setze in den Dativ: der · alt · Schrank');
eq('Dativ right', dat.check('dem alten Schrank').correct, true);
eq('Dativ rejects Akkusativ', dat.check('den alten Schrank').errorType, 'Kasus');

const baby = word('das', 'Baby', 'die Babys', { id: 'das baby', adjective: 'klein' });
const babyAcc = T.taskList(baby, ['akkusativ', 'adjective-endings'])[0];
eq('Baby task type', babyAcc.type, 'Nomen-Drill');
eq('Baby task line', babyAcc.line, 'Setze in den Akkusativ: das · klein · Baby');
eq('Baby solution', babyAcc.solution, 'das kleine Baby');
check('Baby task has no arbitrary predicate', !/brauche|zufrieden|bleiben wir|stelle das Buch|liegt in/i.test(`${babyAcc.line} ${babyAcc.solution}`));
for (const d of ['easy', 'medium', 'hard']) for (const strong of [false, true]) {
  const hint = babyAcc.hint(strong, d);
  check(`Baby hint does not reveal solution (${d}/${strong})`, !hint || !T.norm(hint).includes(T.norm(babyAcc.solution)));
}

// ---- live reply hint safety ----
const replyCtx = { level: 'A1', difficulty: 'medium', topicIds: new Set(['free']), topicId: 'free', wordIds: new Set(), openTask: 'grammar' };
const rawReply = (hint, answer) => ({
  message: 'Weiter geht es.',
  feedback: null,
  exercise: { number: 1, type: 'Lückentext', line: 'In der Praxis: Die Ärztin untersucht ___.', hint, answer },
  options: [],
  panelView: null,
  session: { topicId: 'free', topicName: 'Test', level: 'A1', difficulty: 'Mittel', finished: false },
});
eq('Hint with exact noun phrase is removed', R.normalizeReply(rawReply('Akkusativ: das kleine Baby.', 'das kleine Baby'), replyCtx).exercise.hint, null);
eq('Hint with phrase inside a full sentence is removed', R.normalizeReply(rawReply('Beispiel: Ich sehe das kleine Baby.', 'das kleine Baby'), replyCtx).exercise.hint, null);
eq('Helpful structural hint survives', R.normalizeReply(rawReply('Wen untersucht die Ärztin? Achte auf Artikel und Endung.', 'das kleine Baby'), replyCtx).exercise.hint, 'Wen untersucht die Ärztin? Achte auf Artikel und Endung.');
eq('Missing private answer drops hint safely', R.normalizeReply(rawReply('Achte auf den Artikel.', ''), replyCtx).exercise.hint, null);
eq('ss/ß cannot bypass hint safety', R.normalizeReply(rawReply('Lösung: die grosse Strasse.', 'die große Straße'), replyCtx).exercise.hint, null);
check('Private answer is absent from normalized exercise', !Object.hasOwn(R.normalizeReply(rawReply(null, 'das kleine Baby'), replyCtx).exercise, 'answer'));

// ---- production prompt regression ----
const promptSource = readFileSync(new URL('../lib/prompt.js', import.meta.url), 'utf8');
check('Prompt removes old disconnected noun template', !promptSource.includes('Bilde einen Satz: der Schrank + alt'));
check('Prompt removes generic brauchen example', !promptSource.includes('Ich brauche den alten Schrank'));
check('Prompt requires creative, non-repeating contexts', promptSource.includes('CREATIVE VARIATION') && promptSource.includes('exclusion list'));
check('Prompt requires a private answer for hint safety', promptSource.includes('private exercise.answer'));

const fahren = { id: 'f', type: 'verb', de: 'abbiegen', perfekt: 'ist abgebogen', case: 'in + Akk' };
const pf = T.taskList(fahren, ['perfekt'])[0];
eq('Perfekt line', pf.line, 'Bilde das Perfekt: ich + abbiegen');
eq('Perfekt solution', pf.solution, 'Ich bin abgebogen.');
eq('Perfekt rule', pf.rule, 'Perfekt mit sein');
eq('Perfekt wrong aux → Verbform', pf.check('Ich habe abgebogen.').errorType, 'Verbform');
const vc = T.taskList(fahren, ['verb-case'])[0];
eq('Verb + case solution', vc.solution, 'Ich möchte in den Garten abbiegen.');
eq('Verb + case wrong case', vc.check('Ich möchte in dem Garten abbiegen.').errorType, 'Kasus');
eq('Verb + case rule', vc.rule, 'Akkusativ nach in');
const reflexive = { id: 'r', type: 'verb', de: 'sich freuen', perfekt: 'hat sich gefreut', case: 'über + Akk' };
eq('Perfekt reflexive', T.taskList(reflexive, ['perfekt'])[2].solution, 'Er hat sich gefreut.');
const alt = { id: 'a', type: 'adjective', de: 'alt' };
const en = T.taskList(alt, ['akkusativ']).find((t) => t.line.startsWith('Ergänze die Endung: Ich sehe den '));
eq('Ending task', en.line, 'Ergänze die Endung: Ich sehe den ___ (alt) Mann.');
eq('Ending right (word)', en.check('alten').correct, true);
eq('Ending right (ending only)', en.check('-en').correct, true);
eq('Ending wrong', en.check('alte').errorType, 'Adjektivendung');
eq('Phrases have no grammar task', T.taskList({ id: 'p', type: 'phrase', de: 'Achtung!' }, G.GRAMMAR_POINTS), []);

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall word-task checks passed');
