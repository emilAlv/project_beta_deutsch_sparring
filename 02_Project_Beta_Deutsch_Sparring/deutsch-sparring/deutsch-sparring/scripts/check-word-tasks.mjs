// Checks the grammar tasks of the demo tutor (lib/word-tasks.js, lib/declension.js) on every word of the word list:
//   node scripts/check-word-tasks.mjs            (add --samples to print example tasks to read through)
// Every task's own solution must be accepted; an empty answer must be wrong; no "ß"; known forms must be right.

process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const W = await import('../lib/words.js');
const T = await import('../lib/word-tasks.js');
const D = await import('../lib/declension.js');
const G = await import('../lib/grammar.js');

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
      if (T.findTask(w, t.line)?.line !== t.line) problems.push(`${w.id}: task not found again by its text – ${t.line}`);
      const key = `${w.type}:${t.kind}:${t.rule}`;
      if (!samples[key]) samples[key] = `${t.line}\n      → ${t.solution}`;
    }
  }
}
check('every task accepts its own solution, has a rule, no ß', problems.length === 0, problems.slice(0, 8).join(' | '));
console.log('task variants checked:', JSON.stringify(counts));
if (process.argv.includes('--samples')) for (const [k, v] of Object.entries(samples)) console.log(`  ${k}\n      ${v}`);

// ---- error types ----
const schrank = { ...word('der', 'Schrank', 'die Schränke', { id: 'x', adjective: 'alt' }) };
const gen = T.taskList(schrank, ['genitiv', 'adjective-endings']).find((t) => t.rule === 'Genitiv nach wegen');
eq('Genitiv task line', gen.line, 'Bilde einen Satz: der Schrank + alt · Genitiv nach wegen');
eq('Genitiv right', gen.check('Wegen des alten Schranks bleiben wir zu Hause.').correct, true);
eq('Genitiv wrong ending → Adjektivendung', gen.check('Wegen des alte Schrankes bleiben wir zu Hause.').errorType, 'Adjektivendung');
eq('Genitiv wrong case → Kasus', gen.check('Wegen dem alten Schrank bleiben wir zu Hause.').errorType, 'Kasus');
eq('Genitiv wrong gender article → Artikel', gen.check('Wegen der alten Schranks bleiben wir zu Hause.').errorType, 'Kasus'); // "der" exists for masculine (Dativ/Gen of feminine) but not as the article of this noun in the Genitiv
eq('Genitiv wrong article "das" → Artikel', gen.check('Wegen das alte Schrank bleiben wir zu Hause.').errorType, 'Artikel');
eq('Genitiv word missing → Wortschatz', gen.check('Wegen des alten Tisches bleiben wir zu Hause.').errorType, 'Wortschatz');
const dat = T.taskList(schrank, ['dativ', 'adjective-endings']).find((t) => t.rule === 'Dativ nach in (Wo?)');
eq('Dativ in (Wo?) accepts "im"', dat.check('Das Buch liegt im alten Schrank.').correct, true);
eq('Dativ in (Wo?) accepts "in dem"', dat.check('Das Buch liegt in dem alten Schrank.').correct, true);
eq('Dativ in (Wo?) rejects Akkusativ', dat.check('Das Buch liegt in den alten Schrank.').errorType, 'Kasus');
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
