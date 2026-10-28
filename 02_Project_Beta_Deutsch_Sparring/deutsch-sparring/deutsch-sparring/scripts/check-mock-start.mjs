// Demo mode (MOCK=1): every topic must open with a question, never with "Das Thema bleibt …".
// The app's own start message "Starte bitte das Thema «…»" can look like a topic wish, so the demo tutor
// ignores wishes while session.start is true. Plain node:  node scripts/check-mock-start.mjs
process.removeAllListeners('warning');
const { allTopics } = await import('../lib/topics.js');
const { FREE_TOPIC } = await import('../lib/content.js');
const { getWords, wordTopicFilter, sourcesFor } = await import('../lib/words.js');
const { pickWords } = await import('../lib/scores.js');
const { pickModels } = await import('../lib/exercise-models.js');
const { mockReply } = await import('../lib/mock.js');
const { t } = await import('../lib/ui-text.js');

const topics = [...allTopics(), FREE_TOPIC];
const catalog = topics.map(({ keywords, ...x }) => x);
let failed = 0;
const bad = [];

async function startOf(topic, start) {
  const level = topic.levels?.[0] || 'A1';
  const settings = { level, difficulty: 'medium', direction: 'en-de', grammar: [], sentences: false, variant: 'ch' };
  const filter = topic.type === 'Wortschatz' ? wordTopicFilter(topic.id) : null;
  const words = filter ? pickWords({ words: getWords(), scores: {}, level, sources: sourcesFor('both'), ...filter, count: 13 }) : [];
  const models = filter || topic.id === 'free' ? [] : pickModels(topic.id, { total: 10 });
  const text = t('tutorStartTopic', { topic: topic.short });
  const session = { topicId: topic.id, total: 10, openNumber: 0, openLine: '', openDirection: null, openWordId: '', openTask: null, finished: false, start, skippedNumber: 0, skippedLine: '', skippedWordId: '', skippedTask: null };
  return JSON.parse(await mockReply({ text, settings, session, progress: { done: 0, correct: 0, answered: 0, skipped: 0 }, topic, topics: catalog, words, models }));
}

for (const topic of topics) {
  const out = await startOf(topic, true);
  if (!out.exercise || /bleibt während der Sitzung/.test(out.message)) bad.push(`${topic.id}: ${out.message}`);
}
if (bad.length) failed += 1;
console.log(`${bad.length ? 'FAIL' : 'ok  '} all ${topics.length} topics start with a question${bad.length ? ` – ${bad.length} do not:\n  ${bad.slice(0, 10).join('\n  ')}` : ''}`);

// the guard only applies to the app's own start message: a student's wish in the middle of a session is still refused
const ws = topics.find((x) => x.type === 'Wortschatz');
const gr = topics.find((x) => x.type === 'Grammatik');
const settings = { level: gr.levels[0], difficulty: 'medium', direction: 'en-de', grammar: [], sentences: false, variant: 'ch' };
const mid = JSON.parse(await mockReply({
  text: `Können wir ${ws.short} üben?`, settings, topics: catalog, topic: gr, words: [], models: pickModels(gr.id, { total: 10 }),
  progress: { done: 1, correct: 1, answered: 1, skipped: 0 },
  session: { topicId: gr.id, total: 10, openNumber: 2, openLine: '', finished: false, start: false },
}));
const refused = /bleibt während der Sitzung/.test(mid.message);
if (!refused) failed += 1;
console.log(`${refused ? 'ok  ' : 'FAIL'} a topic wish in the middle of a session is still refused`);

process.exit(failed ? 1 : 0);
