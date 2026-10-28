// Exercise MODELS: ready-made exercise patterns per topic (content/exercise-models/<topic id>.json).
// A model is NOT a question to ask. It shows the grammar point, the task type and the level; the AI writes a NEW
// exercise from it every time (new words, names, places, situation). Server side only (reads files, like lib/content.js).
//
// How it works in a session (stateless: nothing new in the database):
//   1. the first request of a session has no model ids: pickModels() chooses 3–5 models for the topic, preferring models
//      the student has not seen in recent sessions (`seen`, kept by the browser in its session history);
//   2. the server sends the ids back; the browser keeps them with the session and returns them with every request (`keep`),
//      so the set stays the same for the whole session and the copy check knows which models to compare with;
//   3. the browser adds the ids to the session record, so the next session on this topic starts with other models.
//
// File format: a JSON list of { id, type, model, answer, alternatives[], focus, trap? } (see README.md, "Exercise models").
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'content', 'exercise-models');

export const MODEL_TYPES = ['Lückentext', 'Auswahl', 'Fehler finden', 'Satzbau', 'Übersetzung', 'Kommunikative Aufgabe'];
// Data files whose topic does not exist in lib/curriculum.js or content/ yet (a later task creates the topics).
// They are kept so the content is not lost; nothing asks for them until the topic exists.
export const WAITING_TOPICS = ['g-a2-welcher-dieser', 'g-a2-hin-her'];
export const MODELS_MIN = 3;
export const MODELS_MAX = 5;

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// one raw item → a clean model, or null if it is not usable
export function cleanModel(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const model = {
    id: clip(raw.id, 40),
    type: MODEL_TYPES.includes(raw.type) ? raw.type : '',
    model: clip(raw.model, 400),
    answer: clip(raw.answer, 400),
    alternatives: (Array.isArray(raw.alternatives) ? raw.alternatives : []).map((a) => clip(a, 400)).filter(Boolean).slice(0, 6),
    focus: clip(raw.focus, 200),
    trap: clip(raw.trap, 400),
  };
  return model.id && model.type && model.model && model.answer ? model : null;
}

let cache = null;
const useCache = () => process.env.NODE_ENV !== 'development'; // in development a data file edit shows without a restart

// Map: topic id (= file name) → clean models. A broken file is skipped, never a crash.
export function allModels() {
  if (cache && useCache()) return cache;
  const out = new Map();
  let files = [];
  try {
    files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  } catch {
    files = [];
  }
  for (const file of files) {
    try {
      const list = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
      const models = (Array.isArray(list) ? list : []).map(cleanModel).filter(Boolean);
      if (models.length) out.set(file.replace(/\.json$/, ''), models);
    } catch (e) {
      console.error('exercise models: skipped', file, e?.message);
    }
  }
  if (useCache()) cache = out;
  return out;
}

export const modelsFor = (topicId) => (topicId && allModels().get(topicId)) || [];

// how many models a session of `total` questions gets: 3 for a short one, up to 5 for a long one
export const modelsPerSession = (total) => (total <= 8 ? MODELS_MIN : total <= 14 ? 4 : MODELS_MAX);

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => clip(x, 40)).filter(Boolean))];

// The models for one session.
//   keep   model ids already chosen for this session (sent back by the browser): used as they are
//   seen   model ids from earlier sessions, oldest first: the models NOT in this list come first
//   rand   random function (a parameter so the checks can be exact)
// Never fewer than min(3, available) and never more than 5. Different task types are mixed where the choice allows it.
export function pickModels(topicId, { seen = [], keep = [], total = 10, rand = Math.random } = {}) {
  const all = modelsFor(topicId);
  if (!all.length) return [];
  const byId = new Map(all.map((m) => [m.id, m]));
  const kept = ids(keep).map((id) => byId.get(id)).filter(Boolean);
  if (kept.length >= Math.min(MODELS_MIN, all.length)) return kept.slice(0, MODELS_MAX);

  const want = Math.min(all.length, modelsPerSession(total));
  const seenIds = ids(seen);
  const rank = (m) => seenIds.lastIndexOf(m.id); // -1 = never seen; a bigger number = seen more recently
  const shuffled = [...all].map((m) => [rand(), m]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const unseen = shuffled.filter((m) => rank(m) < 0);
  const old = shuffled.filter((m) => rank(m) >= 0).sort((a, b) => rank(a) - rank(b)); // seen longest ago first
  // enough unseen models: choose only among them. Not enough: all of them, then the ones seen longest ago.
  const candidates = unseen.length >= want ? unseen : [...unseen, ...old].slice(0, want);
  const picked = [];
  const types = new Set();
  // mix the task types where the choice allows it
  while (picked.length < want && candidates.length) {
    const i = candidates.findIndex((m) => !types.has(m.type));
    const [m] = candidates.splice(i < 0 ? 0 : i, 1);
    picked.push(m);
    types.add(m.type);
  }
  return picked;
}

// ids that the browser may send: clean list of short strings
export const cleanModelIds = (list, max = 60) => ids(list).slice(-max);
