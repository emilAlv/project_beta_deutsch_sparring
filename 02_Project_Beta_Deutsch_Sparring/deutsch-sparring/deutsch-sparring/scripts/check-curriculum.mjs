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
  check(`level ${lv} has 8–13 entries`, n >= 8 && n <= 13, String(n));
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

// the tutor's lesson text
const lesson = C.curriculumLesson(list[0]);
check('lesson text has rule names, level and examples', lesson.includes(list[0].ruleNames[0]) && lesson.includes('Level: A1') && lesson.includes('**Der**'));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
