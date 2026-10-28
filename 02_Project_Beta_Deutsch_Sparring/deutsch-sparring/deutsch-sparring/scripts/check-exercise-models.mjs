// Checks the exercise models (content/exercise-models/*.json, lib/exercise-models.js) and everything around them. Plain node:
//   node scripts/check-exercise-models.mjs
process.removeAllListeners('warning');
import fs from 'node:fs';
import path from 'node:path';
const X = await import('../lib/exercise-models.js');
const C = await import('../lib/curriculum.js');
const N = await import('../lib/novelty.js');
const P = await import('../lib/prompt.js');
const T = await import('../lib/topics.js');
const M = await import('../lib/mock.js');
const H = await import('../lib/question-history.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

// ---- the data files
const dir = path.join(process.cwd(), 'content', 'exercise-models');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
check('there are data files', files.length >= 10, String(files.length));
const topicIds = new Set(T.allTopics().map((t) => t.id));
const allIds = new Map();
for (const f of files) {
  const topic = f.replace(/\.json$/, '');
  const bad = [];
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch (e) {
    bad.push(`does not parse: ${e.message}`);
  }
  if (!Array.isArray(raw) || !raw.length) bad.push('not a list');
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!X.cleanModel(item)) bad.push(`unusable item ${item?.id}`);
    if (!item.focus) bad.push(`no focus: ${item.id}`);
    if (!Array.isArray(item.alternatives)) bad.push(`alternatives is not a list: ${item.id}`);
    if (/ß/.test(`${item.model} ${item.answer}`)) bad.push(`ß in model or answer (Swiss spelling): ${item.id}`);
    if (allIds.has(item.id)) bad.push(`id used twice: ${item.id} (also in ${allIds.get(item.id)})`);
    allIds.set(item.id, f);
    const gaps = (String(item.model).match(/___/g) || []).length;
    if (item.type === 'Lückentext' && gaps === 0) bad.push(`Lückentext without ___: ${item.id}`);
    if (gaps && String(item.answer).split(/\s*(?:\.\.\.|…)\s*/).length !== gaps) bad.push(`gaps and answer parts differ: ${item.id}`);
  }
  const known = topicIds.has(topic);
  const waiting = X.WAITING_TOPICS.includes(topic);
  if (!known && !waiting) bad.push('topic id does not exist and is not listed as waiting');
  if (known && waiting) bad.push('listed as waiting, but the topic exists now: remove it from WAITING_TOPICS');
  check(`${topic}${waiting ? ' (waiting for a topic)' : ''}: ${(raw || []).length} models`, bad.length === 0, bad.join('; '));
}
check('waiting topics have a data file', X.WAITING_TOPICS.every((t) => files.includes(`${t}.json`)));
check('a topic without models gives no models, nothing breaks', X.pickModels('g-a1-praesens').length === 0 && X.pickModels('free').length === 0 && X.pickModels(null).length === 0 && X.pickModels('../../etc/passwd').length === 0);

// ---- selection and rotation
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // fixed sequence, so the check is exact
for (const topic of [...X.allModels().keys()].filter((t) => !X.WAITING_TOPICS.includes(t))) {
  const all = X.modelsFor(topic);
  const first = X.pickModels(topic, { total: 10, rand });
  const firstIds = first.map((m) => m.id);
  const second = X.pickModels(topic, { total: 10, rand, seen: firstIds });
  const again = X.pickModels(topic, { total: 10, rand, keep: firstIds, seen: [] });
  const want = Math.min(all.length, X.modelsPerSession(10));
  const bad = [];
  if (first.length < Math.min(3, all.length) || first.length > 5) bad.push(`picks ${first.length}`);
  if (new Set(firstIds).size !== firstIds.length) bad.push('duplicate pick');
  if (second.map((m) => m.id).join() === firstIds.join()) bad.push('second session picks the same models');
  if (all.length >= 2 * want && second.some((m) => firstIds.includes(m.id))) bad.push('second session repeats a model although unseen ones exist');
  if (again.map((m) => m.id).join() !== firstIds.join()) bad.push('the set changes inside a session');
  check(`selection ${topic}: ${all.length} models, picks ${first.length}, rotates`, bad.length === 0, bad.join('; '));
}
const t10 = X.modelsFor('g-a2-verben-dativ');
const everSeen = t10.slice(0, 12).map((m) => m.id);
const rotated = X.pickModels('g-a2-verben-dativ', { total: 10, rand, seen: everSeen });
check('models seen long ago come back before recent ones (all seen)', rotated.length >= 3 && X.pickModels('g-a2-verben-dativ', { total: 10, rand, seen: t10.map((m) => m.id) }).length >= 3);
check('browser history → seen ids (same topic, oldest first)', H.seenModelIds({ id: 'now', topicId: 't' }, [{ id: 'b', topicId: 't', modelIds: ['b1'] }, { id: 'a', topicId: 't', modelIds: ['a1'] }, { id: 'c', topicId: 'other', modelIds: ['c1'] }]).join() === 'a1,b1');

// ---- the copy detector
const sample = X.modelsFor('g-a2-wechselpraepositionen').slice(0, 6);
check('detector: verbatim copy', N.isModelCopy(sample[1].model, sample));
check('detector: copy with other punctuation or case', N.isModelCopy(sample[1].model.toUpperCase().replace('.', ''), sample));
check('detector: copy with one word changed', N.isModelCopy('Ich lege das Buch ___ Regal. (in, das Regal; Wohin?) Danke', sample));
check('detector: a real variation passes', !N.isModelCopy('Sie legt die Zeitung ___ Tasche. (in, die Tasche; Wohin?)', sample));
check('detector: another situation passes', !N.isModelCopy('Wir stellen die Vase ___ Tisch. (auf, der Tisch; Wohin?)', sample));
const imp = X.modelsFor('g-a1-imperativ');
check('detector: a variation of a short gap sentence passes', !N.isModelCopy('___ bitte das Fenster auf. (du, machen)', imp) && N.isModelCopy('___ bitte die Tür zu. (du, machen)', imp));
// the retry: a copy gets ONE more call; the better second draft is used
let calls = 0;
const asks = [];
const draft = (line) => JSON.stringify({ exercise: { line } });
const retried = await N.draftWithNoveltyRetry({
  ask: async (extra) => { calls += 1; asks.push(extra); return extra ? draft('Sie legt die Zeitung ___ Tasche. (in, die Tasche; Wohin?)') : draft(sample[1].model); },
  parse: (t) => JSON.parse(t),
  copyOf: sample,
  previous: [],
  log: () => {},
});
check('a copied model is retried once and the variation is used', calls === 2 && JSON.parse(retried).exercise.line.startsWith('Sie legt') && asks[1].includes('MODEL COPY RETRY'));
calls = 0;
await N.draftWithNoveltyRetry({ ask: async () => { calls += 1; return draft('Sie legt die Zeitung ___ Tasche. (in, die Tasche; Wohin?)'); }, parse: (t) => JSON.parse(t), copyOf: sample, previous: [], log: () => {} });
check('a real variation costs no second call', calls === 1);
calls = 0;
await N.draftWithNoveltyRetry({ ask: async () => { calls += 1; return draft(sample[1].model); }, parse: (t) => JSON.parse(t), copyOf: sample, previous: [], deadline: Date.now() + 1000, log: () => {} });
check('no time left: the first draft is kept, no retry', calls === 1);

// ---- the prompt
const catalog = T.allTopics().map((t) => ({ ...t, id: t.id }));
const promptFor = (topicId, models) => P.buildSystemPrompt({
  name: 'Test', lesson: C.curriculumEntry(topicId) ? C.curriculumLesson(C.curriculumEntry(topicId)) : 'LESSON TEXT', words: null, models, knownGrammar: '', catalog,
  settings: { level: 'A2', difficulty: 'Mittel', grammar: [], variant: 'ch' }, session: { topicId, total: 10, openNumber: 0, openLine: '' },
  progress: { done: 0, answered: 0, correct: 0, skipped: 0 }, mistakes: [], notes: [], guessed: false, asked: [],
});
const withModels = promptFor('g-a2-wechselpraepositionen', sample.slice(0, 4));
check('prompt has the EXERCISE MODELS block with the picked models', withModels.includes('EXERCISE MODELS') && withModels.includes(sample[0].model) && withModels.includes('NEVER ask a model sentence') && withModels.includes('accept every correct alternative'));
check('prompt only has the picked models (not the whole bank)', !withModels.includes(X.modelsFor('g-a2-wechselpraepositionen')[8].model));
check('prompt shows alternatives and traps', withModels.includes('also correct: "aufs"') && withModels.includes('trap:'));
check('prompt keeps "do not copy" for examples', withModels.includes('do not copy them'));
check('no block for a topic without models', !promptFor('g-a1-praesens', X.pickModels('g-a1-praesens')).includes('EXERCISE MODELS'));
check('curriculum lesson text lists the traps only where there are some', C.curriculumLesson(C.curriculumEntry('g-a1-imperativ')).includes('Typical traps') && !C.curriculumLesson(C.curriculumEntry('g-a1-praesens')).includes('Typical traps'));

// ---- the demo tutor asks the models and accepts model + answer + alternatives
const settings = { level: 'A2', difficulty: 'medium', variant: 'ch', grammar: [], sentences: false, direction: 'en-de' };
const reply = async (t, text, done, open, openLine, models) => JSON.parse(await M.mockReply({
  text, settings, session: { topicId: t.id, total: 10, openNumber: open, openLine }, progress: { done, answered: done, correct: done, skipped: 0 }, topic: t, topics: [], words: [], models,
}));
for (const topic of [...X.allModels().keys()].filter((x) => topicIds.has(x))) {
  const t = T.allTopics().find((x) => x.id === topic);
  const models = X.modelsFor(topic).slice(0, 10);
  const bad = [];
  for (let i = 0; i < models.length; i += 1) {
    const q = await reply(t, 'Start', i, 0, '', models);
    if (!q.exercise?.line) { bad.push(`no question ${i + 1}`); continue; }
    const answers = [models[i].answer, ...models[i].alternatives];
    for (const a of answers) {
      const gap = (models[i].model.match(/___/g) || []).length;
      const typed = gap ? a.replace(/\s*(\.\.\.|…)\s*/g, ' ') : a;
      const r = await reply(t, typed, i, i + 1, q.exercise.line, models);
      if (!r.feedback?.correct) bad.push(`${models[i].id}: "${typed}" not accepted`);
    }
    const w = await reply(t, 'xyzzy', i, i + 1, q.exercise.line, models);
    if (w.feedback?.correct !== false) bad.push(`${models[i].id}: wrong answer accepted`);
  }
  check(`demo ${topic}: asks and checks ${models.length} models`, bad.length === 0, bad.slice(0, 4).join('; '));
}
const noModels = await reply(T.allTopics().find((x) => x.id === 'g-a1-praesens'), 'Start', 0, 0, '', []);
check('demo without models still works (curriculum examples)', Boolean(noModels.exercise?.line));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
