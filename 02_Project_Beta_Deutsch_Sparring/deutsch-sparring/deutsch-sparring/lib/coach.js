// The coach on the Home page (Task 10): cleaning what the model says and applying plan changes.
// Pure functions, no React, no browser APIs: used by the server (/api/coach), the browser (Coach.js)
// and scripts/check-coach.mjs.
//
// What the coach answers (after cleaning):
//   message          1–3 short sentences, simple English
//   suggestedSession { kind, topicId, level, difficulty, questions, grammar[] } or null – settings the setup screen supports
//   planChanges      { goalId, changes: [{ action: 'add'|'move'|'remove', milestoneId?, title?, date?, target? }] } or null
//   quickReplies     0–3 short texts the student can tap
// The model only PROPOSES. A plan change is applied by the browser after the student taps "Apply",
// and applyPlan() checks every date and id again against the goal as it is at that moment.
import {
  isDay, dayNum, cleanGoal, cleanGoalId, newGoalId, MAX_MILESTONES,
} from './goals.js';
import {
  LEVELS, DIFFICULTIES, QUESTION_STEPS, GRAMMAR_POINTS, KINDS,
} from './session-settings.js';

export const MAX_MESSAGES = 30; // coach messages kept per student
export const MAX_TEXT = 1200;
export const MAX_CHANGES = 8;
export const MAX_QUICK = 3;
const ACTIONS = ['add', 'move', 'remove'];
const PLAN_STATUS = ['open', 'applied', 'kept', 'replaced'];

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const clip = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const clipLines = (x, n) => (typeof x === 'string' ? x.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n) : '');

// ---------- suggested session ----------
const nearestStep = (n) => {
  if (!Number.isFinite(n)) return 20;
  return QUESTION_STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), QUESTION_STEPS[0]);
};

// topics = the catalog (server: allTopics(); browser: the loaded topics). null = do not look the topic up
// (messages read back from storage: the setup screen checks the values again anyway).
export function cleanSuggestion(raw, topics = null) {
  if (!isObj(raw)) return null;
  const topicId = clip(raw.topicId, 160);
  if (!topicId || topicId === 'free') return null;
  let kind = KINDS.includes(raw.kind) ? raw.kind : 'vocab';
  let level = LEVELS.includes(raw.level) ? raw.level : 'B1';
  if (topics) {
    const topic = topics.find((x) => x.id === topicId);
    if (!topic) return null;
    kind = topic.type === 'Wortschatz' ? 'vocab' : 'grammar';
    // A coach suggestion must open a setup in which its topic is actually selectable.
    if (topic.levels?.length && !topic.levels.includes(level)) level = topic.levels.find((x) => LEVELS.includes(x)) || level;
  }
  const grammar = Array.isArray(raw.grammar) ? GRAMMAR_POINTS.filter((g) => raw.grammar.includes(g)) : [];
  return {
    kind,
    topicId,
    level,
    difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'medium',
    questions: nearestStep(Math.round(Number(raw.questions))),
    grammar: kind === 'vocab' ? grammar : [],
  };
}

// → the part of the setup form this suggestion fills in (merge it into the remembered form), or null
export function suggestionToSetup(s, topics) {
  const topic = topics.find((x) => x.id === s?.topicId);
  if (!topic || topic.id === 'free') return null;
  const vocab = topic.type === 'Wortschatz';
  const patch = { kind: vocab ? 'vocab' : 'grammar', level: s.level, difficulty: s.difficulty, questions: s.questions };
  if (vocab) {
    patch.section = topic.parent || topic.id;
    patch.list = topic.parent ? topic.id : null;
    if (s.grammar?.length) patch.grammar = s.grammar;
  } else {
    patch.grammarTopic = topic.id;
  }
  return patch;
}

// ---------- plan changes ----------
// A date a milestone may have: a real day, today or later, inside the goal's time frame.
const dateOk = (date, goal, today) => isDay(date)
  && dayNum(date) >= dayNum(today) && dayNum(date) >= dayNum(goal.startDate) && dayNum(date) <= dayNum(goal.endDate);

// The new goal after the changes, or null when anything does not fit (unknown milestone, date outside the
// time frame, too many milestones). Nothing is half-applied. Milestones that are already done stay as they are.
export function applyPlan(goal, changes, today) {
  if (!goal || !Array.isArray(changes) || !changes.length) return null;
  const list = goal.milestones.map((m) => ({ ...m }));
  for (const c of changes) {
    if (c.action === 'add') {
      const title = clip(c.title, 80);
      const target = Math.round(Number(c.target));
      if (!title || !Number.isFinite(target) || !dateOk(c.date, goal, today)) return null;
      list.push({ id: newGoalId('m'), date: c.date, title, target: Math.max(0, Math.min(100, target)), status: 'open' });
    } else if (c.action === 'move') {
      const m = list.find((x) => x.id === c.milestoneId);
      if (!m || m.status === 'done' || !dateOk(c.date, goal, today)) return null;
      m.date = c.date;
    } else if (c.action === 'remove') {
      const i = list.findIndex((x) => x.id === c.milestoneId && x.status !== 'done');
      if (i < 0) return null;
      list.splice(i, 1);
    } else {
      return null;
    }
  }
  if (list.length > MAX_MILESTONES) return null;
  const next = cleanGoal({ ...goal, milestones: list });
  return next && next.milestones.length === list.length ? next : null; // cleanGoal drops what does not fit
}

// Model → plan changes for one of the student's goals, or null. goals = the clean goals the model was told about.
export function cleanPlan(raw, goals, today) {
  if (!isObj(raw)) return null;
  const goalId = cleanGoalId(raw.goalId);
  const goal = goalId && goals.find((g) => g.id === goalId);
  if (!goal || !Array.isArray(raw.changes)) return null;
  const out = [];
  const touched = new Set();
  for (const c of raw.changes.slice(0, MAX_CHANGES)) {
    if (!isObj(c) || !ACTIONS.includes(c.action)) continue;
    if (c.action === 'add') {
      const title = clip(c.title, 80);
      const target = Math.round(Number(c.target));
      if (title && Number.isFinite(target) && dateOk(c.date, goal, today)) {
        out.push({ action: 'add', title, date: c.date, target: Math.max(0, Math.min(100, target)) });
      }
      continue;
    }
    const m = goal.milestones.find((x) => x.id === c.milestoneId);
    if (!m || m.status === 'done' || touched.has(m.id)) continue;
    if (c.action === 'move') {
      if (dateOk(c.date, goal, today) && c.date !== m.date) {
        touched.add(m.id);
        out.push({ action: 'move', milestoneId: m.id, title: m.title, date: c.date });
      }
    } else {
      touched.add(m.id);
      out.push({ action: 'remove', milestoneId: m.id, title: m.title });
    }
  }
  // too many milestones in the end: drop the last additions
  const removes = out.filter((c) => c.action === 'remove').length;
  let room = MAX_MILESTONES - (goal.milestones.length - removes);
  const kept = out.filter((c) => c.action !== 'add' || room-- > 0);
  if (!kept.length || !applyPlan(goal, kept, today)) return null;
  return { goalId: goal.id, changes: kept };
}

// ---------- the answer of the model ----------
export function cleanQuick(raw) {
  return [...new Set((Array.isArray(raw) ? raw : []).map((x) => clip(x, 60)).filter(Boolean))].slice(0, MAX_QUICK);
}

// → { message, suggestedSession, planChanges, quickReplies } or null when there is no message
export function normalizeCoach(raw, { topics, goals, today }) {
  if (!isObj(raw)) return null;
  const message = clipLines(raw.message, MAX_TEXT);
  if (!message) return null;
  return {
    message,
    suggestedSession: cleanSuggestion(raw.suggestedSession, topics),
    planChanges: cleanPlan(raw.planChanges, goals, today),
    quickReplies: cleanQuick(raw.quickReplies),
  };
}

// ---------- saved messages ----------
// One saved message: { id, role: 'coach'|'student', text, at (ms), auto?, suggestion?, plan?: { goalId, changes, status }, quick? }
function cleanStoredPlan(raw) {
  if (!isObj(raw)) return null;
  const goalId = cleanGoalId(raw.goalId);
  if (!goalId || !Array.isArray(raw.changes)) return null;
  const changes = [];
  for (const c of raw.changes.slice(0, MAX_CHANGES)) {
    if (!isObj(c) || !ACTIONS.includes(c.action)) continue;
    const title = clip(c.title, 80);
    const date = isDay(c.date) ? c.date : null;
    const target = Math.round(Number(c.target));
    const milestoneId = cleanGoalId(c.milestoneId);
    if (c.action === 'add' && title && date && Number.isFinite(target)) changes.push({ action: 'add', title, date, target: Math.max(0, Math.min(100, target)) });
    else if (c.action === 'move' && milestoneId && date) changes.push({ action: 'move', milestoneId, title, date });
    else if (c.action === 'remove' && milestoneId) changes.push({ action: 'remove', milestoneId, title });
  }
  if (!changes.length) return null;
  return { goalId, changes, status: PLAN_STATUS.includes(raw.status) ? raw.status : 'open' };
}

// Anything read from storage or from the browser → the last MAX_MESSAGES clean messages.
export function cleanStoredMessages(raw, topics = null) {
  const out = [];
  const seen = new Set();
  for (const m of (Array.isArray(raw) ? raw : []).slice(-MAX_MESSAGES * 2)) {
    if (!isObj(m)) continue;
    const id = cleanGoalId(m.id);
    const text = clipLines(m.text, MAX_TEXT);
    const role = m.role === 'coach' ? 'coach' : m.role === 'student' ? 'student' : null;
    if (!id || !text || !role || seen.has(id)) continue;
    seen.add(id);
    const at = Number.isFinite(Number(m.at)) && Number(m.at) > 0 ? Math.floor(Number(m.at)) : Date.now();
    const msg = { id, role, text, at };
    if (role === 'coach') {
      if (m.auto === true) msg.auto = true;
      const suggestion = cleanSuggestion(m.suggestion, topics);
      if (suggestion) msg.suggestion = suggestion;
      const plan = cleanStoredPlan(m.plan);
      if (plan) msg.plan = plan;
      const quick = cleanQuick(m.quick);
      if (quick.length) msg.quick = quick;
    }
    out.push(msg);
  }
  return out.slice(-MAX_MESSAGES);
}

// The conversation the model gets: the last few messages as { role: 'user'|'model', text } turns.
export function turnsForModel(messages, limit = 10) {
  return (Array.isArray(messages) ? messages : []).slice(-limit).map((m) => ({
    role: m.role === 'coach' ? 'model' : 'user',
    text: clip(m.text, 600),
  })).filter((m) => m.text);
}
