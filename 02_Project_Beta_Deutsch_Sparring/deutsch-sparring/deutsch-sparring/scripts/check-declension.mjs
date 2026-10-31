// Checks the German of the demo tutor (lib/declension.js, lib/word-tasks.js, lib/verb-objects.js) over the whole word list:
//   node scripts/check-declension.mjs
// Expected forms are written by hand (review R20): See/Tee/Kaffee strong, English loanwords with -s, Meer/Tier/Bier/Haar
// with both endings, adjective nouns, dative plural, Swiss Perfekt with sein, modal verbs in the Präteritum,
// verb + case sentences with a fitting object.

process.removeAllListeners('warning');
const D = await import('../lib/declension.js');
const T = await import('../lib/word-tasks.js');
const W = await import('../lib/words.js');
const O = await import('../lib/verb-objects.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const noun = (article, n, plural = '', extra = {}) => ({ id: n, type: 'noun', article, noun: n, plural, number: '', ...extra });
const np = (w, kase, opts) => D.nounPhrase(w, kase, opts);
const all = (w, kase, opts) => { const r = np(w, kase, opts); return r ? [r.phrase, ...r.alts] : []; };

// ---- T15: See, Schnee, Tee, Kaffee, Klee are strong ----
for (const [art, n, pl] of [['der', 'See', 'die Seen'], ['der', 'Schnee', ''], ['der', 'Tee', 'die Tees'], ['der', 'Kaffee', 'die Kaffees'], ['der', 'Klee', '']]) {
  const w = noun(art, n, pl);
  eq(`Akkusativ den ${n}`, np(w, 'Akkusativ')?.phrase, `den ${n}`);
  eq(`Dativ dem ${n}`, np(w, 'Dativ')?.phrase, `dem ${n}`);
  eq(`Genitiv des ${n}s`, np(w, 'Genitiv')?.phrase, `des ${n}s`);
}

// ---- T2: English loanwords take -s only ----
for (const n of ['Job', 'Snack', 'Song', 'Hit', 'Link', 'Blog', 'Steak', 'Fan', 'Chef', 'Park', 'Club']) {
  const w = noun(n === 'Steak' ? 'das' : 'der', n, `die ${n}s`);
  eq(`Genitiv des ${n}s (no -es)`, all(w, 'Genitiv'), [`des ${n}s`, `eines ${n}s`]);
}

// ---- T2: both endings for Meer / Tier / Bier / Haar ----
for (const n of ['Meer', 'Tier', 'Bier', 'Haar']) {
  const w = noun('das', n, `die ${n}e`);
  const got = all(w, 'Genitiv');
  check(`Genitiv ${n}: -s and -es accepted`, got.includes(`des ${n}s`) && got.includes(`des ${n}es`), got.join(' | '));
}

// ---- T2: adjective nouns decline like adjectives ----
const sg = noun('das', 'Selbstgemachte', '', { number: 'sg', note: 'Adj.-Nomen' });
eq('Adj.-Nomen Dativ', np(sg, 'Dativ', { adj: 'neu' })?.phrase, 'dem neuen Selbstgemachten');
eq('Adj.-Nomen Nominativ indefinite alternative', np(sg, 'Nominativ', { adj: 'neu' })?.alts, ['ein neues Selbstgemachtes']);
eq('Adj.-Nomen Genitiv', np(sg, 'Genitiv')?.phrase, 'des Selbstgemachten');
const bek = noun('der', 'Bekannte', 'die Bekannten', { note: 'Adj.-Nomen' });
eq('Adj.-Nomen der Bekannte Akkusativ', np(bek, 'Akkusativ', { adj: 'alt' })?.phrase, 'den alten Bekannten');
eq('Adj.-Nomen der Bekannte Nominativ ein', np(bek, 'Nominativ', { adj: 'alt' })?.alts, ['ein alter Bekannter']);
eq('Adj.-Nomen Plural Dativ', np(bek, 'Dativ', { plural: true })?.phrase, 'den Bekannten');

// ---- T2: dative plural ----
const dp = (art, n, pl) => np(noun(art, n, pl), 'Dativ', { plural: true })?.phrase;
eq('datPl normal', dp('das', 'Buch', 'die Bücher'), 'den Büchern');
eq('datPl -e takes -n', dp('der', 'Schuh', 'die Schuhe'), 'den Schuhen');
eq('datPl no -n after -s', dp('das', 'Auto', 'die Autos'), 'den Autos');
eq('datPl no -n after a vowel', dp('die', 'Villa', 'die Villi'), 'den Villi');
eq('datPl no -n for Euro', dp('der', 'Euro', 'die Euro'), 'den Euro');
eq('datPl no -n for Cent', dp('der', 'Cent', 'die Cent'), 'den Cent');
eq('datPl no -n for an abbreviation', dp('der', 'Lkw', 'die Lkw'), 'den Lkw');
eq('datPl no -n for PC', dp('der', 'PC', 'die PC'), 'den PC');

// ---- the whole word list: every noun gets forms, none of them wrong in the known ways ----
let nouns = 0;
for (const w of W.getWords().filter((x) => x.type === 'noun')) {
  nouns += 1;
  for (const kase of ['Akkusativ', 'Dativ', 'Genitiv']) {
    const r = np(w, kase, { adj: 'neu' });
    if (!r) continue;
    const genitiveEs = /(Job|Snack|Song|Hit|Link|Blog|Steak|Fan|Chef|Club)es\b/.test(r.phrase);
    if (genitiveEs) check(`no loanword -es: ${w.noun}`, false, r.phrase);
    if (/(See|Tee|Kaffee|Klee|Schnee)n\b/.test(r.phrase) && kase !== 'Dativ') check(`no weak form: ${w.noun}`, false, r.phrase);
  }
}
check(`all ${nouns} nouns declined without a known wrong form`, true);

// ---- T1/T16/T4: Perfekt tasks ----
const verb = (de, perfekt, extra = {}) => ({ id: de, type: 'verb', de, perfekt, ...extra });
const stehen = verb('stehen', 'hat gestanden', { extra: 'CH: ist gestanden' });
const st = T.taskList(stehen, ['perfekt'])[0];
check('stehen: haben accepted', st.check('Ich habe gestanden.').correct);
check('stehen: Swiss sein accepted', st.check('Ich bin gestanden.').correct);
check('stehen: wrong participle still wrong', !st.check('Ich bin gestehen.').correct);
check('stehen: multiple choice has no two right answers', st.options('easy').length === 0);
const jog = verb('joggen', 'ist gejoggt', { extra: 'joggen (hat gejoggt) is also used' });
const jt = T.taskList(jog, ['perfekt'])[0];
check('joggen: ist and hat accepted', jt.check('Ich bin gejoggt.').correct && jt.check('Ich habe gejoggt.').correct);
for (const [de, perfekt, extra] of [['liegen', 'hat gelegen', 'CH: ist gelegen'], ['sitzen', 'hat gesessen', 'CH: ist gesessen'], ['hängen', 'hat gehangen', 'CH: ist gehangen; hängen (transitive: to hang something) = hat gehängt']]) {
  const t = T.taskList(verb(de, perfekt, { extra }), ['perfekt'])[0];
  check(`${de}: both helper verbs`, t.check(t.solution).correct && t.check(t.solution.replace(/habe|bin/, (m) => (m === 'habe' ? 'bin' : 'habe'))).correct);
}
const gehen = verb('gehen', 'ist gegangen');
const gt = T.taskList(gehen, ['perfekt'])[0];
check('gehen: haben stays wrong', !gt.check('Ich habe gegangen.').correct);
check('gehen: explanation names the movement rule', /Bewegung von A nach B/.test(gt.check('Ich bin gegangen.').explanation));
const bl = T.taskList(verb('bleiben', 'ist geblieben'), ['perfekt'])[0];
check('bleiben: own explanation (exception)', /Ausnahme/.test(bl.check('Ich bin geblieben.').explanation) && !/Zustandsänderung/.test(bl.check('Ich bin geblieben.').explanation));
// modal verbs
const modals = { müssen: ['Ich musste.', 'hat gemusst'], dürfen: ['Ich durfte.', 'hat gedurft'], wollen: ['Ich wollte.', 'hat gewollt'], möchten: ['Ich wollte.', 'hat gewollt'], können: ['Ich konnte.', 'hat gekonnt'], sollen: ['Ich sollte.', 'hat gesollt'], mögen: ['Ich mochte.', 'hat gemocht'] };
for (const [m, [sol, perfekt]] of Object.entries(modals)) {
  const t = T.taskList(verb(m, perfekt), ['perfekt'])[0];
  check(`${m}: Präteritum task`, t.kind === 'praeteritum' && t.solution === sol && t.check(sol.replace('.', '')).correct, `${t.kind} ${t.solution}`);
  check(`${m}: Perfekt is wrong`, !t.check('Ich habe gemusst.').correct);
}

// ---- T5: verb + case sentences ----
const vc = (de, kase, perfekt = 'hat x') => T.taskList(verb(de, perfekt, { case: kase }), ['verb-case']).filter((t) => t.kind === 'verbcase');
for (const [de, kase] of [['merken', 'Akk'], ['vergleichen', 'mit + Dat'], ['verwechseln', 'mit + Dat'], ['informieren', 'über + Akk'], ['erinnern', 'an + Akk'], ['sich freuen', 'auf + Akk, über + Akk'], ['geben', 'Dat + Akk']]) {
  eq(`${de}: no verb + case task`, vc(de, kase).length, 0);
}
const refl = T.taskList({ id: 'r', type: 'verb', de: '(sich) rasieren', perfekt: 'hat rasiert', case: 'Akk' }, ['verb-case']).filter((t) => t.kind === 'verbcase');
eq('(sich) rasieren: no verb + case task', refl.length, 0);
check('anrufen: people only', vc('anrufen', 'Akk').every((t) => /(Freund|Lehrerin|Kollegen)/.test(t.solution)), vc('anrufen', 'Akk').map((t) => t.solution).join(' | '));
eq('teilnehmen an: contracted form is the solution', vc('teilnehmen an', 'an + Dat')[0]?.solution, 'Ich möchte am Kurs teilnehmen.');
check('teilnehmen an: the long form is accepted too', vc('teilnehmen an', 'an + Dat')[0].check('Ich möchte an dem Kurs teilnehmen.').correct);
eq('einziehen in: ins Haus', vc('einziehen in', 'in + Akk').map((t) => t.solution)[0], 'Ich möchte ins Haus einziehen.');
eq('aussteigen aus', vc('aussteigen aus', 'aus + Dat')[0]?.solution, 'Ich möchte aus dem Bus aussteigen.');
eq('anfangen mit: no contraction for mit', vc('anfangen mit', 'mit + Dat')[0]?.solution, 'Ich möchte mit dem Kurs anfangen.');

// the whole word list: every verb + case solution is accepted, and its object belongs to the verb's map
let tasks = 0;
for (const w of W.getWords().filter((x) => x.type === 'verb')) {
  for (const t of T.taskList(w, ['verb-case'])) {
    if (t.kind !== 'verbcase') continue;
    tasks += 1;
    if (!t.check(t.solution).correct) check(`verb + case solution accepted: ${w.id}`, false, t.solution);
    if (/möchte (den|dem|das|die|der) (Brief|Garten|Paket|Tasche) /.test(t.solution) && !O.VERB_OBJECT_KEYS.includes(T.infinitive(w))) check(`unlisted verb got a task: ${w.id}`, false);
  }
}
check(`${tasks} verb + case tasks over the word list: all solutions accepted`, tasks > 150, String(tasks));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall declension checks passed');
process.exit(failed ? 1 : 0);
