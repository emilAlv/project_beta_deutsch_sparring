// Integration checks for the 36 A1–B1 curriculum units and their tutor/coach wiring.
// Plain Node: npm run check:curriculum
process.removeAllListeners('warning');

const {
  FREE_TOPIC, getExamples, listLessons, topicsForLevel,
} = await import('../lib/content.js');
const { mockReply } = await import('../lib/mock.js');
const { buildSystemPrompt } = await import('../lib/prompt.js');
const { coachContext } = await import('../lib/coach-prompt.js');
const { cleanSuggestion } = await import('../lib/coach.js');
const { DEFAULT_SETUP } = await import('../lib/session-settings.js');
const { sameAnswer } = await import('../lib/variants.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

const lessons = listLessons();
const units = lessons.filter((lesson) => /^lektion-(a1|a2|b1)-\d{2}-/.test(lesson.id));
check('all 36 curriculum units load', units.length === 36, `loaded ${units.length}`);

for (const level of ['A1', 'A2', 'B1']) {
  const levelUnits = units.filter((lesson) => lesson.levels.length === 1 && lesson.levels[0] === level);
  const numbers = levelUnits.map((lesson) => lesson.unit).sort((a, b) => a - b);
  check(`${level}: 12 ordered units`, levelUnits.length === 12 && numbers.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12');
  check(`${level}: level filter includes only ${level} curriculum units`,
    topicsForLevel(units, level).length === 12 && topicsForLevel(units, level).every((lesson) => lesson.levels.includes(level)));
}

check('every unit exposes objective, situation and rule',
  units.every((lesson) => lesson.objective && lesson.situation && lesson.rule));
check('every unit has at least eight deterministic mock examples',
  units.every((lesson) => getExamples(lesson.id).length >= 8));

const baseMockSettings = {
  difficulty: 'medium', direction: 'en-de', grammar: [], sentences: false, variant: 'ch',
};
const baseSession = {
  topicId: null, total: 20, openNumber: 0, openLine: '', openDirection: null, openWordId: '', openTask: null,
  finished: false, skippedNumber: 0, skippedLine: '', skippedWordId: '', skippedTask: null,
};
const emptyProgress = { done: 0, answered: 0, correct: 0, skipped: 0 };
const samples = {
  A1: 'lektion-a1-01-vorstellen',
  A2: 'lektion-a2-01-perfekt',
  B1: 'lektion-b1-01-erzaehlen',
};

for (const [level, id] of Object.entries(samples)) {
  const topic = units.find((lesson) => lesson.id === id);
  const start = JSON.parse(await mockReply({
    text: 'Start', settings: { ...baseMockSettings, level },
    session: baseSession, progress: emptyProgress, topic, topics: [...units, FREE_TOPIC],
  }));
  check(`${level}: mock starts a curriculum session`,
    start.session.topicId === id && start.exercise?.number === 1);
  check(`${level}: objective and situation reach the mock tutor`,
    start.grammarFocus?.boxes?.[0]?.value === topic.objective
      && start.grammarFocus?.boxes?.[1]?.value === topic.situation);

  const examples = getExamples(id);
  const recycled = JSON.parse(await mockReply({
    text: 'Weiter', settings: { ...baseMockSettings, level },
    session: baseSession, progress: { ...emptyProgress, done: examples.length },
    topic, topics: [...units, FREE_TOPIC],
  }));
  check(`${level}: recycled practice changes the context deterministically`,
    recycled.exercise?.number === examples.length + 1
      && recycled.exercise.line !== start.exercise.line
      && recycled.exercise.line.includes('Neuer Kontext'));
}

const a2 = units.find((lesson) => lesson.id === samples.A2);
const firstA2 = JSON.parse(await mockReply({
  text: 'Start', settings: { ...baseMockSettings, level: 'A2' },
  session: { ...baseSession, total: 1 }, progress: emptyProgress,
  topic: a2, topics: [...units, FREE_TOPIC],
}));
const finishedA2 = JSON.parse(await mockReply({
  text: getExamples(a2.id)[0].solution, settings: { ...baseMockSettings, level: 'A2' },
  session: { ...baseSession, total: 1, openNumber: 1, openLine: firstA2.exercise.line },
  progress: emptyProgress, topic: a2, topics: [...units, FREE_TOPIC],
}));
check('mock completion keeps feedback and stops after the final question',
  finishedA2.feedback?.correct === true && finishedA2.exercise === null);

const prompt = buildSystemPrompt({
  name: 'Test',
  lesson: null,
  knownGrammar: '',
  catalog: [a2, FREE_TOPIC],
  settings: { level: 'A2', difficulty: 'Mittel', direction: 'en-de', grammar: [], variant: 'ch' },
  session: { ...baseSession, topicId: a2.id },
  progress: emptyProgress,
  mistakes: [],
  notes: [],
  guessed: false,
  asked: ['Gestern habe ich gearbeitet.'],
});
check('real tutor receives objective and situation',
  prompt.includes(a2.objective) && prompt.includes(a2.situation));
check('real tutor uses communicative progression and accepts alternatives',
  prompt.includes('communicative progression') && prompt.includes('different natural solution is not an error'));
check('old no-role-play prohibition is gone', !prompt.includes('No stories, no characters, no role-play'));

const home = {
  goals: [], progress: {}, tiles: { sessions: 0, answered: 0, pctRight: 0, learnt: 0, wordsTotal: 0 },
  strengths: [], gaps: [], rules: [], vocab: null,
};
const context = coachContext({ home, topics: [...units, FREE_TOPIC], today: '2026-10-19' });
check('coach receives all 36 ordered curriculum units',
  units.every((lesson) => context.includes(lesson.id) && context.includes(lesson.objective)));
const correctedSuggestion = cleanSuggestion(
  { topicId: samples.A1, level: 'B1', difficulty: 'medium', questions: 10 },
  units,
);
check('coach suggestions cannot pair a curriculum unit with the wrong CEFR level',
  correctedSuggestion?.level === 'A1' && correctedSuggestion.kind === 'grammar');
check('Swiss Standard German remains the default', DEFAULT_SETUP.variant === 'ch');
check('Swiss and German Standard vocabulary alternatives are equivalent',
  sameAnswer('das Velo', 'das Fahrrad') && sameAnswer('das Spital', 'das Krankenhaus'));

if (failed) {
  console.error(`\n${failed} curriculum check(s) failed.`);
  process.exit(1);
}
console.log('\nAll curriculum integration checks passed.');
