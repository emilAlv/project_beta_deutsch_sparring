// Checks Swiss and German Hochdeutsch (lib/variants.js and where it is used):
//   node scripts/check-variants.mjs
// word pairs both ways · ss = ß · spelling of sample sentences · "Klasse, Wasser, muss, dass" never get a ß

process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const V = await import('../lib/variants.js');
const D = await import('../lib/diff.js');
const T = await import('../lib/word-tasks.js');
const P = await import('../lib/prompt.js');
const W = await import('../lib/words.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const de = (s) => V.toVariant(s, 'de');
const ch = (s) => V.toVariant(s, 'ch');

// ---- the map, both ways ----
const pairs = [
  ['das Velo', 'das Fahrrad'], ['das Spital', 'das Krankenhaus'], ['das Trottoir', 'der Bürgersteig'], ['der Estrich', 'der Dachboden'],
  ['der Kasten', 'der Schrank'], ['die Stube', 'das Wohnzimmer'], ['das Lavabo', 'das Waschbecken'], ['die Glace', 'das Eis'],
  ['das Natel', 'das Handy'], ['das Billett', 'die Fahrkarte'], ['das Poulet', 'das Hähnchen'], ['das Rüebli', 'die Karotte'],
  ['der Znüni', 'das Pausenbrot'], ['der Coiffeur', 'der Friseur'], ['parkieren', 'parken'], ['grillieren', 'grillen'],
];
for (const [a, b] of pairs) {
  check(`${a} = ${b}`, V.sameAnswer(a, b));
  check(`${b} = ${a}`, V.sameAnswer(b, a));
  check(`in a sentence: ${a}`, V.sameAnswer(`Ich sehe ${a} dort.`, `Ich sehe ${b} dort.`));
}
check('different words stay different', !V.sameAnswer('das Velo', 'das Auto') && !V.sameAnswer('die Stube', 'die Küche'));
check('wrong article stays wrong', !V.sameAnswer('der Velo', 'das Fahrrad') && !V.sameAnswer('der Stube', 'das Wohnzimmer'));
check('bare word is not the word with article', !V.sameAnswer('Velo', 'das Fahrrad'));
check('plural Velos = Fahrräder', V.sameAnswer('die Velos', 'die Fahrräder'));
check('verb forms: geparkt = parkiert', V.sameAnswer('Ich habe geparkt', 'Ich habe parkiert'));

// ---- ss = ß ----
for (const [a, b] of [['Strasse', 'Straße'], ['gross', 'groß'], ['heissen', 'heißen'], ['Fuss', 'Fuß'], ['schliessen', 'schließen'], ['Ich heisse Anna.', 'ich heiße anna']]) {
  check(`${a} = ${b}`, V.sameAnswer(a, b));
}
check('different words with ss are still different', !V.sameAnswer('Wasser', 'Wasen') && !V.sameAnswer('Klasse', 'Kasse'));

// ---- toVariant on sample sentences ----
eq('de: Strasse', de('Die Strasse ist gross.'), 'Die Straße ist groß.');
eq('de: heissen', de('Wie heissen Sie? Ich heisse Anna.'), 'Wie heißen Sie? Ich heiße Anna.');
eq('de: Fuss / schliessen', de('Ich gehe zu Fuss. Bitte schliessen Sie die Tür.'), 'Ich gehe zu Fuß. Bitte schließen Sie die Tür.');
eq('de: compounds', de('Die Einbahnstrasse, der Fussball, die Grossmutter, ausserdem draussen.'), 'Die Einbahnstraße, der Fußball, die Großmutter, außerdem draußen.');
eq('de: süss, Spass, weiss, heiss', de('Das ist süss. Das macht Spass. Ich weiss es. Es ist heiss.'), 'Das ist süß. Das macht Spaß. Ich weiß es. Es ist heiß.');
eq('de: capitals', de('Strasse. Gross. Fuss.'), 'Straße. Groß. Fuß.');
eq('de: already ß stays', de('Die Straße ist groß.'), 'Die Straße ist groß.');
eq('ch: ß becomes ss', ch('Die Straße ist groß. Ich heiße Anna und schließe die Tür. Fußball'), 'Die Strasse ist gross. Ich heisse Anna und schliesse die Tür. Fussball');
eq('ch: nothing else changes', ch('Das Wasser muss kalt sein.'), 'Das Wasser muss kalt sein.');
const keep = ['Klasse', 'Wasser', 'muss', 'dass', 'müssen', 'Tasse', 'Fluss', 'essen', 'vergessen', 'lassen', 'Adresse', 'interessant', 'Schloss',
  'passen', 'Ergebnisse', 'Prozess', 'Messer', 'Essig', 'Schlüssel', 'Pass', 'nass', 'Kuss', 'Sessel', 'Mittagessen', 'Abendessen',
  'Mineralwasser', 'Passwort', 'Anschluss', 'Ausstellung', 'Wissenschaft', 'Zeugnisse', 'Erdgeschoss', 'Schulabschluss', 'Krankenkasse',
  'Tschüss', 'stattdessen', 'Zusammenfassung', 'Arbeitserlaubnisse', 'Lieferadresse', 'Dessert', 'Fitness', 'wissen', 'gewusst'];
for (const w of keep) eq(`de keeps ${w}`, de(w), w);
eq('de keeps a whole sentence', de('Das muss die Klasse wissen, dass das Wasser nass ist.'), 'Das muss die Klasse wissen, dass das Wasser nass ist.');

// every word of the word list: only words with a long vowel get a ß, and ch() undoes it
const SHORT_VOWEL_ONLY = /(wasser|klasse|tasse|adresse|essen|essig|fluss|schloss|messer|sessel|schlüssel|nass|pass|ergebnis|zeugnis|erlaubnis|schüssel|anlass|anschluss|abschluss|ausstellung|wissenschaft|zusammenfassung|krankenkasse|tschüss|dessert|fitness|interessant|passen|passend|müssen|lassen|vergessen|verbessern|hassen|hässlich|stattdessen|dass|passwort|busse)/i;
const LONG = /(gross|gröss|heiss|fuss|füss|strasse|schliess|süss|weiss|ausser|draussen|fleiss|giess|grüss|gruss|spass|stoss|stöss|bloss|beiss|reiss|fliess|schiess|geniess|spiess|strauss|sträuss|gemäss|mässig|ermäss|massnahme|massstab)/gi;
let suspicious = 0;
let converted = 0;
for (const w of W.getWords()) {
  for (const f of [w.noun, w.plural, w.adjective, w.de, w.perfekt]) {
    if (!f) continue;
    const g = de(f);
    if (g !== f) converted += 1;
    if (g.includes('ß') && SHORT_VOWEL_ONLY.test(f.replace(LONG, ''))) {
      suspicious += 1;
      console.log('  suspicious:', f, '->', g);
    }
    if (ch(g) !== f.replace(/ß/g, 'ss')) {
      failed += 1;
      console.log('FAIL round trip', f, g);
    }
  }
}
check(`word list: ${converted} forms get a ß, none of the short-vowel words`, suspicious === 0 && converted > 0);

// ---- localizeWord (words.json stays Swiss, shown in the variant) ----
const strasse = { id: 'die strasse', type: 'noun', article: 'die', noun: 'Strasse', plural: 'die Strassen', number: '', adjective: 'gross', de: 'die Strasse' };
const ls = V.localizeWord(strasse, 'de');
eq('localize Strasse (de)', [ls.noun, ls.plural, ls.adjective], ['Straße', 'die Straßen', 'groß']);
eq('localize Strasse (ch) unchanged', V.localizeWord(strasse, 'ch').noun, 'Strasse');
const st = V.localizeWord({ id: 'die stube', type: 'noun', article: 'die', noun: 'Stube', plural: 'die Stuben', number: '' }, 'de');
eq('localize Stube -> das Wohnzimmer', [st.article, st.noun, st.plural], ['das', 'Wohnzimmer', 'die Wohnzimmer']);
const sk = V.localizeWord({ id: 'der schrank', type: 'noun', article: 'der', noun: 'Schrank', plural: 'die Schränke', number: '' }, 'ch');
eq('localize Schrank (ch) -> der Kasten', [sk.article, sk.noun], ['der', 'Kasten']);
const pk = V.localizeWord({ id: 'parkieren', type: 'verb', de: 'parkieren', perfekt: 'hat parkiert' }, 'de');
eq('localize parkieren -> parken', [pk.de, pk.perfekt], ['parken', 'hat geparkt']);

// ---- a tutor reply: only the tutor's text changes ----
const reply = V.replyToVariant({
  message: 'Die Strasse ist gross.', options: ['Strasse'],
  feedback: { studentAnswer: 'Die Strasse', corrected: 'Die Strasse ist gross', changedWords: ['gross'], explanation: 'heissen', rule: 'die Strasse', forNumber: 1 },
  exercise: { number: 1, line: 'the street', hint: 'Fuss', wordId: 'die strasse' },
}, 'de');
eq('reply: message', reply.message, 'Die Straße ist groß.');
eq('reply: corrected', reply.feedback.corrected, 'Die Straße ist groß');
eq('reply: the student answer is not changed', reply.feedback.studentAnswer, 'Die Strasse');
eq('reply: the word id is not changed', reply.exercise.wordId, 'die strasse');

// ---- the answer comparison accepts both ----
check('diff: ss/ß is no difference', D.compareAnswer('Die Strasse ist gross', 'Die Straße ist groß', []).changes === 0);
check('diff: Velo/Fahrrad is no difference', D.compareAnswer('Ich kaufe das Velo', 'Ich kaufe das Fahrrad', []).changes === 0);
check('diff: a real difference is still found', D.compareAnswer('Ich kaufe das Auto', 'Ich kaufe das Fahrrad', []).changes > 0);

// ---- word tasks accept both spellings and both words ----
const noun = { id: 'x', type: 'noun', article: 'das', noun: 'Fahrrad', plural: 'die Fahrräder', number: '', adjective: 'neu' };
const task = T.taskList(noun, ['akkusativ', 'adjective-endings'])[0];
check('task: its own solution is right', task.check(task.solution).correct);
check('task: the Swiss word is accepted', task.check(task.solution.replace('Fahrrad', 'Velo')).correct, task.solution);
const sw = { id: 'y', type: 'noun', article: 'die', noun: 'Strasse', plural: 'die Strassen', number: '', adjective: 'gross' };
const tg = T.taskList(V.localizeWord(sw, 'de'), ['dativ', 'adjective-endings'])[0];
check('task (de): shows ß', /Straße/.test(tg.solution), tg.solution);
check('task (de): the Swiss spelling is accepted', tg.check(tg.solution.replace(/ß/g, 'ss')).correct);
check('task (de): the German spelling is accepted', tg.check(tg.solution).correct);
const fuss = { id: 'z', type: 'noun', article: 'der', noun: 'Fuss', plural: 'die Füsse', number: '', adjective: '' };
const tf = T.taskList(V.localizeWord(fuss, 'de'), ['genitiv'])[0];
check('task (de): Genitiv of Fuß is des Fußes', /Fußes/.test(tf.solution), tf.solution);

// ---- the prompt has one rule per variant ----
const base = {
  name: 'Emilio', lesson: null, words: null, knownGrammar: '', catalog: [{ id: 'free', title: 'Free', type: 'free', levels: ['B1'] }],
  session: { topicId: 'free', total: 10, openNumber: 0 }, progress: { done: 0, correct: 0, answered: 0, skipped: 0 }, mistakes: [], notes: [], guessed: false,
};
const set = { level: 'B1', difficulty: 'Mittel', direction: 'en-de', grammar: [] };
const sCh = P.buildSystemPrompt({ ...base, settings: { ...set, variant: 'ch' } });
const sDe = P.buildSystemPrompt({ ...base, settings: { ...set, variant: 'de' } });
check('prompt (ch): Swiss rule only', /write "ss", never "ß"/.test(sCh) && !/use the German words, not the Swiss/.test(sCh));
check('prompt (de): German rule only', /use "ß" after a long vowel/.test(sDe) && !/write "ss", never "ß"/.test(sDe));
check('prompt: the other variant is always accepted', /OTHER variant is ALWAYS correct/.test(sCh) && /OTHER variant is ALWAYS correct/.test(sDe));
check('prompt: Swiss Perfekt of stehen/liegen/sitzen/hängen with sein is accepted in both variants', /ich bin gestanden/.test(sCh) && /ich bin gestanden/.test(sDe) && /Accept both/.test(sCh) && /Accept both/.test(sDe));
check('prompt: no variant = Swiss', /write "ss", never "ß"/.test(P.buildSystemPrompt({ ...base, settings: set })));
check('cleanVariant', V.cleanVariant('de') === 'de' && V.cleanVariant('x') === 'ch' && V.cleanVariant(undefined) === 'ch');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall variant checks passed');
process.exit(failed ? 1 : 0);
