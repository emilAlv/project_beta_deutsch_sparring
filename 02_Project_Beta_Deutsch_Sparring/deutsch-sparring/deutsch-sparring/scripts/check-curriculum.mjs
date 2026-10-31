// Checks the grammar curriculum (lib/curriculum.js) and everything that uses it. Plain node:
//   node scripts/check-curriculum.mjs
process.removeAllListeners('warning');
const C = await import('../lib/curriculum.js');
const K = await import('../lib/coach.js');
const P = await import('../lib/coach-prompt.js');
const T = await import('../lib/topics.js');
const M = await import('../lib/mock.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

const list = C.CURRICULUM;
const ids = list.map((e) => e.id);
check('ids unique', new Set(ids).size === ids.length);
for (const lv of C.CURRICULUM_LEVELS) {
  const n = list.filter((e) => e.level === lv).length;
  // Cap per level (31 Oct 2026): 10 topics were added (A1 14, A2 15, B1 17), so the old cap of 13 was raised to the
  // current size plus a little room. Raise it again only on purpose, when a level really gets more topics.
  const cap = { A1: 14, A2: 15, B1: 17 }[lv] ?? 13;
  check(`level ${lv} has 8–${cap} entries`, n >= 8 && n <= cap, String(n));
}
for (const e of list) {
  const bad = [];
  if (!/^g-(a1|a2|b1)-[a-z0-9-]+$/.test(e.id) || e.id.split('-')[1] !== e.level.toLowerCase()) bad.push('id');
  if (!C.CURRICULUM_LEVELS.includes(e.level)) bad.push('level');
  for (const f of ['title', 'titleEn', 'rule']) if (!e[f] || typeof e[f] !== 'string') bad.push(f);
  if (!Array.isArray(e.examples) || e.examples.length < 3 || e.examples.length > 5) bad.push('examples count');
  if (!Array.isArray(e.exerciseIdeas) || e.exerciseIdeas.length < 2 || e.exerciseIdeas.length > 3) bad.push('exerciseIdeas');
  if (!Array.isArray(e.ruleNames) || !e.ruleNames.length || e.ruleNames.some((r) => !r)) bad.push('ruleNames');
  if (JSON.stringify(e).includes('ß')) bad.push('ß');
  for (const x of e.examples || []) {
    const g = C.gapExample(x);
    if (!g.words.length) bad.push(`no key word: ${x}`);
    if (g.words.some((w) => /\s/.test(w))) bad.push(`key word with space: ${x}`);
    if (/[*|]/.test(g.sentence)) bad.push(`markup left: ${x}`);
  }
  check(`entry ${e.id}`, bad.length === 0, bad.join('; '));
}

// topics and coach
const topics = T.allTopics().map(({ keywords, ...t }) => t);
check('allTopics has all curriculum ids', ids.every((id) => topics.some((t) => t.id === id && t.type === 'Grammatik' && t.levels.length === 1)));
check('lesson lektion-01 still a topic, one level', topics.find((t) => t.id === 'lektion-01-dativ-akkusativ')?.levels.length === 1);
check('every grammar topic has exactly one level', topics.filter((t) => t.type === 'Grammatik').every((t) => t.levels.length === 1));
const context = P.coachContext({
  home: { goals: [], tiles: { sessions: 0, answered: 0, pctRight: 0, learnt: 0, wordsTotal: 0 }, progress: {}, strengths: [], gaps: [], rules: [] },
  topics, today: '2026-10-19',
});
check('coach catalog lists every id', ids.every((id) => context.includes(`\n${id} |`)));
const prompt = P.buildCoachPrompt({ name: 'Test', context });
check('coach CURRICULUM text built from the list', ids.every((id) => prompt.includes(`[${id}]`)));
const badSug = list.filter((e) => {
  const s = K.cleanSuggestion({ kind: 'grammar', topicId: e.id, level: 'B1', difficulty: 'easy', questions: 10 }, topics);
  return !s || s.topicId !== e.id || s.kind !== 'grammar' || s.level !== e.level;
});
check('cleanSuggestion accepts all ids (and uses the topic level)', badSug.length === 0, badSug.map((e) => e.id).join(', '));

// demo tutor: an exercise for every topic, and it accepts its own solution
const settings = { level: 'A2', difficulty: 'medium', variant: 'ch', grammar: [], sentences: false, direction: 'en-de' };
const reply = async (t, text, done, openNumber, openLine) => JSON.parse(await M.mockReply({
  text, settings, session: { topicId: t.id, total: 10, openNumber, openLine }, progress: { done, answered: done, correct: done, skipped: 0 }, topic: t, topics, words: [],
}));
for (const t of topics.filter((x) => x.curriculum)) {
  const e = C.curriculumEntry(t.id);
  const bad = [];
  const start = await reply(t, 'Start', 0, 0);
  if (!start.exercise?.line) bad.push('no exercise');
  if (!start.grammarFocus?.title) bad.push('no focus');
  for (let i = 0; i < e.examples.length; i += 1) {
    const q = await reply(t, 'Start', i, 0);
    const g = C.gapExample(e.examples[i]);
    for (const answer of [g.sentence, g.words.join(' ')]) {
      const r = await reply(t, answer, i, i + 1, q.exercise.line);
      if (!r.feedback?.correct) bad.push(`example ${i + 1} not accepted: "${answer}"`);
    }
    const wrong = await reply(t, 'xyzzy', i, i + 1, q.exercise.line);
    if (wrong.feedback?.correct !== false) bad.push(`example ${i + 1}: wrong answer accepted`);
  }
  check(`mock ${t.id}`, bad.length === 0, bad.join('; '));
}

// the two class topics (28 Oct 2026): welcher / dieser and hin / her
{
  const X = await import('../lib/exercise-models.js');
  for (const id of ['g-a2-welcher-dieser', 'g-a2-hin-her']) {
    const e = C.curriculumEntry(id);
    check(`${id} exists at A2`, e?.level === 'A2');
    check(`${id}: prerequisites exist`, Boolean(e) && e.needs.length > 0 && e.needs.every((n) => C.isCurriculumId(n)));
    check(`${id}: in the A2 plan order`, C.planOrder('A2').includes(id));
    check(`${id}: exercise models no longer waiting`, !X.WAITING_TOPICS.includes(id) && X.allModels().has(id));
  }
}

// the ten topics added on 31 Oct 2026 (R26 point 4 + the plural topic)
{
  const NEW = { A1: ['g-a1-pluralformen', 'g-a1-praep-akkusativ'], A2: ['g-a2-deshalb-trotzdem-denn', 'g-a2-indirekte-fragen'],
    B1: ['g-b1-als-wenn', 'g-b1-futur1', 'g-b1-adj-ohne-artikel', 'g-b1-konjunktiv2-vergangenheit', 'g-b1-relativsaetze-praep', 'g-b1-lassen'] };
  for (const [lv, newIds] of Object.entries(NEW)) {
    for (const id of newIds) {
      const e = C.curriculumEntry(id);
      check(`${id} exists at ${lv}`, e?.level === lv);
      check(`${id}: 5 examples, rule, role, traps, no ß`, Boolean(e) && e.examples.length === 5 && e.rule.length > 100 && ['productive', 'receptive'].includes(e.role) && e.traps?.length > 0 && !JSON.stringify(e).includes('ß'));
      check(`${id}: needs exist and are not itself`, Boolean(e) && e.needs.every((n) => C.isCurriculumId(n) && n !== id));
      check(`${id}: in the ${lv} plan order`, C.planOrder(lv).includes(id));
      check(`${id}: hints do not give the answer`, Boolean(e) && e.examples.every((x) => { const g = C.gapExample(x); return !x.includes('|') || [...x.matchAll(/\*([^*|]+)\|([^*]+)\*/g)].every((m) => m[1].trim().toLowerCase() !== m[2].trim().toLowerCase()); }));
    }
  }
}

// the tutor's lesson text
const lesson = C.curriculumLesson(list[0]);
check('lesson text has rule names, level and examples', lesson.includes(list[0].ruleNames[0]) && lesson.includes('Level: A1') && lesson.includes('**Der**'));


// ---- R26: known grammar comes from the curriculum; B1 is not asked at A1 level; difficulty has its own task types ----
{
  const PR = await import('../lib/prompt.js');
  const kgA2 = C.knownGrammarText('A2');
  const kgB1 = C.knownGrammarText('B1');
  check('known grammar A1 lists only A1 topics', C.knownGrammarText('A1').split('\n').length === 1 && !C.knownGrammarText('A1').includes('Passiv'));
  check('known grammar B1 has every curriculum topic title', C.CURRICULUM.every((e) => kgB1.includes(C.shortTitle(e))));
  check('known grammar A2 has no B1 topic', !kgA2.includes('Plusquamperfekt') && kgA2.includes('Wechselpräpositionen'));
  check('B1 lesson text asks for B1 sentences, A1/A2 stay simple', /natural B1 sentences/.test(C.curriculumLesson(C.curriculumEntry('g-b1-relativsaetze'))) && /simple, short sentences/.test(C.curriculumLesson(C.curriculumEntry('g-a2-weil'))));
  const mk = (level, difficulty, knownGrammar, words = null, grammar = []) => PR.buildSystemPrompt({
    name: 'Emilio', lesson: C.curriculumLesson(C.curriculumEntry('g-b1-relativsaetze')), words, models: [], knownGrammar,
    catalog: [{ id: 'g-b1-relativsaetze', title: 'Relativsätze', type: 'Grammatik', levels: ['B1'] }],
    settings: { level, difficulty, grammar, variant: 'ch', direction: 'en-de' }, session: { topicId: 'g-b1-relativsaetze', total: 10, openNumber: 0, openLine: '' },
    progress: { done: 0, answered: 0, correct: 0, skipped: 0 }, mistakes: [], notes: [], guessed: false, asked: [],
  });
  const p = mk('B1', 'Schwer', kgB1);
  check('prompt: KNOWN GRAMMAR is the curriculum list, no A1–A2 fallback', p.includes(kgB1) && !p.includes('assume A1–A2') && !p.includes('if empty: A1–A2'));
  for (const [d, words] of [['Leicht', ['Auswahl', 'ONE gap']], ['Mittel', ['transformation', 'Aktiv → Passiv']], ['Schwer', ['translate a whole sentence', 'find the mistake', '12–20 words with a Nebensatz']]]) {
    const pd = mk('B1', d, kgB1);
    check(`prompt (${d}): its own grammar task types`, words.every((w) => pd.includes(w)));
  }
  check('prompt: case is not named on Mittel and Schwer (CASE CHOICE)', p.includes('CASE CHOICE') && /NEVER name the case/.test(p));
  const v = mk('B1', 'Mittel', kgB1, { header: 'id | German', lines: ['w1 | Lampe'] }, ['akkusativ']);
  check('prompt: NEW WORDS rule keeps the chosen direction, "new" and "extra" columns', v.includes('NEW WORDS') && v.includes('Keep the chosen flashcard direction') && v.includes('"extra"') && v.includes('"new"'));
  check('prompt: repeated mistake gets a new memory aid', /NEW memory aid or a contrasting pair/.test(p));
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
