// The coach on the Home page (Task 10): cleaning what the model says and applying plan changes.
// Pure functions, no React, no browser APIs: used by the server (/api/coach), the browser (Coach.js)
// and scripts/check-coach.mjs.
//
// What the coach answers (after cleaning):
//   message          1–3 short sentences, simple English
//   suggestedSession { kind, topicId, level, difficulty, questions, grammar[] } or null – settings the setup screen supports
//   goalProposal     a new goal as a PREVIEW made by the app (lib/coach-goal.js) – saved only when the student taps Accept
//   planChanges      a rename / new end date / new daily time for one goal, as a before -> after card, or null
//   quickReplies     0–3 short texts the student can tap
// The model only PROPOSES: a template and numbers. Names, parts and milestones always come from the templates
// (lib/plan-templates.js); the student confirms with a button and the server checks everything again.
import { isDay, cleanGoalId, GOAL_LEVELS } from './goals.js';
import { TEMPLATE_IDS, CUTS, MINUTES_PER_DAY, DEFAULT_MINUTES, SOURCE_CHOICES, MAX_LABEL } from './plan.js';
import {
  LEVELS, DIFFICULTIES, QUESTION_STEPS, GRAMMAR_POINTS, KINDS,
} from './session-settings.js';

export const MAX_MESSAGES = 30; // coach messages kept per student
export const MAX_TEXT = 1200;
export const MAX_CHANGES = 8; // lines shown on a plan change card
// added to the message when the model proposed plan changes that could not be read (cut off or invalid)
export const PLAN_UNREADABLE_NOTE = 'I also wanted to propose a plan, but I could not put it together. Ask me again and I will try once more.';
export const MAX_QUICK = 3;
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
  const milestoneId = cleanGoalId(raw.milestoneId) || null; // a suggestion tied to a plan milestone (R15)
  const topicId = clip(raw.topicId, 160) || null;
  if (topicId === 'free' || (!topicId && !milestoneId)) return null;
  let kind = KINDS.includes(raw.kind) ? raw.kind : 'vocab';
  let topicLevel = null; // a grammar topic belongs to one level: the suggestion uses it
  if (topics && topicId) {
    const topic = topics.find((x) => x.id === topicId);
    if (!topic && !milestoneId) return null;
    if (topic) {
      kind = topic.type === 'Wortschatz' ? 'vocab' : 'grammar';
      if (kind === 'grammar' && topic.levels?.length === 1) topicLevel = topic.levels[0];
    }
  }
  const grammar = Array.isArray(raw.grammar) ? GRAMMAR_POINTS.filter((g) => raw.grammar.includes(g)) : [];
  return {
    kind,
    topicId,
    level: topicLevel || (LEVELS.includes(raw.level) ? raw.level : 'B1'),
    difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'medium',
    questions: nearestStep(Math.round(Number(raw.questions))),
    grammar: kind === 'vocab' ? grammar : [],
    ...(milestoneId ? {
      milestoneId,
      title: clip(raw.title, 120),
      ...(SOURCE_CHOICES.includes(raw.source) ? { source: raw.source } : {}),
    } : {}),
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

// ---------- goal proposals and plan changes (R12) ----------
// The model only chooses a template and numbers. The server builds the plan (lib/coach-goal.js, lib/plan-templates.js) and
// sends back a PREVIEW: titles and dates made by the app. Both kinds are saved in the chat as small clean objects:
//   proposal { request, preview, status: 'open'|'accepted'|'changed'|'replaced' }
//   plan     { goalId, label?, levers, changes[], more, fits, needsUntil, status: 'open'|'applied'|'kept'|'replaced' }
const PROPOSAL_STATUS = ['open', 'accepted', 'changed', 'replaced'];
const int = (x, lo, hi) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const dayOrNull = (x) => (isDay(x) ? x : null);
const cutsOf = (x) => CUTS.filter((c) => Array.isArray(x) && x.includes(c));

// a goal request (what the generator needs): only fixed values and ids, never a name
export function cleanRequest(raw) {
  if (!isObj(raw) || !TEMPLATE_IDS.includes(raw.template) || !GOAL_LEVELS.includes(raw.level)) return null;
  const o = isObj(raw.options) ? raw.options : {};
  return {
    id: cleanGoalId(raw.id) || null,
    template: raw.template,
    level: raw.level,
    startLevel: GOAL_LEVELS.includes(raw.startLevel) ? raw.startLevel : raw.level,
    startDate: dayOrNull(raw.startDate),
    endDate: dayOrNull(raw.endDate),
    minutesPerDay: MINUTES_PER_DAY.includes(Number(raw.minutesPerDay)) ? Number(raw.minutesPerDay) : DEFAULT_MINUTES,
    options: {
      sources: SOURCE_CHOICES.includes(o.sources) ? o.sources : 'both',
      section: clip(o.section, 120) || null,
      list: clip(o.section, 120) ? clip(o.list, 120) || null : null,
      topicIds: (Array.isArray(o.topicIds) ? o.topicIds : []).map((x) => clip(x, 80)).filter(Boolean).slice(0, 12),
      cut: cutsOf(o.cut),
    },
  };
}

export function cleanLever(raw) {
  const r = isObj(raw) ? raw : {};
  const out = {};
  if (MINUTES_PER_DAY.includes(Number(r.minutesPerDay))) out.minutesPerDay = Number(r.minutesPerDay);
  if (isDay(r.endDate)) out.endDate = r.endDate;
  const cut = cutsOf(r.cut);
  if (cut.length) out.cut = cut;
  const focus = (Array.isArray(r.focus) ? r.focus : []).map(cleanGoalId).filter(Boolean).slice(0, 8);
  if (focus.length) out.focus = [...new Set(focus)];
  return out;
}

function cleanTight(raw) {
  if (!isObj(raw)) return null;
  return {
    needsUntil: dayOrNull(raw.needsUntil),
    planEnd: dayOrNull(raw.planEnd),
    weeksOver: int(raw.weeksOver, 0, 999) ?? 0,
    examDate: dayOrNull(raw.examDate),
    byPlanEnd: (Array.isArray(raw.byPlanEnd) ? raw.byPlanEnd : []).filter(isObj).slice(0, 4).map((p) => ({
      title: clip(p.title, 80), milestones: int(p.milestones, 0, 999) ?? 0, of: int(p.of, 0, 999) ?? 0,
      words: int(p.words, 0, 99999), wordsOf: int(p.wordsOf, 0, 99999),
    })),
    fixes: (Array.isArray(raw.fixes) ? raw.fixes : []).filter(isObj).slice(0, 6)
      .map((f) => ({ lever: cleanLever(f.lever), needsUntil: dayOrNull(f.needsUntil), fits: f.fits === true }))
      .filter((f) => Object.keys(f.lever).length),
  };
}

function cleanPreview(raw) {
  const p = isObj(raw) ? raw : {};
  return {
    title: clip(p.title, 80),
    fits: p.fits !== false,
    finishesOn: dayOrNull(p.finishesOn),
    bufferDays: int(p.bufferDays, 0, 99) ?? 0,
    parts: (Array.isArray(p.parts) ? p.parts : []).filter(isObj).slice(0, 8).map((x) => ({
      title: clip(x.title, 80),
      count: int(x.count, 0, 999) ?? 0,
      words: int(x.words, 0, 99999),
      until: dayOrNull(x.until),
      first: (Array.isArray(x.first) ? x.first : []).filter(isObj).slice(0, 3).map((m) => ({ title: clip(m.title, 120), date: dayOrNull(m.date) })),
    })),
    milestones: int(p.milestones, 0, 9999) ?? 0,
    alreadySolid: int(p.alreadySolid, 0, 9999) ?? 0,
    courseWords: int(p.courseWords, 0, 99999) ?? 0,
    tight: cleanTight(p.tight),
  };
}

export function cleanProposal(raw) {
  if (!isObj(raw)) return null;
  const request = cleanRequest(raw.request);
  if (!request) return null;
  return { request, preview: cleanPreview(raw.preview), status: PROPOSAL_STATUS.includes(raw.status) ? raw.status : 'open' };
}

// a plan change card (rename / new date / more or less time); old-format ones (add/move/remove of "% milestones") are shown as replaced
export function cleanStoredPlan(raw) {
  if (!isObj(raw)) return null;
  const goalId = cleanGoalId(raw.goalId);
  if (!goalId || !Array.isArray(raw.changes)) return null;
  if (raw.changes.some((c) => isObj(c) && c.action)) {
    return { goalId, legacy: true, levers: {}, changes: [], more: 0, fits: true, needsUntil: null, status: 'replaced' };
  }
  const changes = raw.changes.filter(isObj).slice(0, MAX_CHANGES).map((c) => ({
    type: ['pace', 'endDate', 'rename', 'move', 'target', 'focus'].includes(c.type) ? c.type : null,
    title: clip(c.title, 120), from: clip(String(c.from ?? ''), 120), to: clip(String(c.to ?? ''), 120),
  })).filter((c) => c.type);
  const label = clip(raw.label, MAX_LABEL);
  const levers = cleanLever(raw.levers);
  if (!changes.length && !label && !Object.keys(levers).length) return null;
  return {
    goalId, ...(label ? { label } : {}), levers, changes, more: int(raw.more, 0, 9999) ?? 0, fits: raw.fits !== false,
    needsUntil: dayOrNull(raw.needsUntil), status: PLAN_STATUS.includes(raw.status) ? raw.status : 'open',
    // the end-date effect: when the plan finishes before and after, and the goal's own end date (the exam date for an exam)
    finishBefore: dayOrNull(raw.finishBefore), finishAfter: dayOrNull(raw.finishAfter), endDate: dayOrNull(raw.endDate),
  };
}

// ---------- the answer of the model ----------
export function cleanQuick(raw) {
  return [...new Set((Array.isArray(raw) ? raw : []).map((x) => clip(x, 60)).filter(Boolean))].slice(0, MAX_QUICK);
}

// → { message, suggestedSession, goalProposal, planChanges, quickReplies } or null when there is no message.
// actions = what lib/coach-goal.js made of the model's proposeGoal / planChanges: { goalProposal, planChanges, note }
export function normalizeCoach(raw, { topics, actions = null }) {
  if (!isObj(raw)) return null;
  let message = clipLines(raw.message, MAX_TEXT);
  if (!message) return null;
  if (actions?.note) message = withPlanNote(message, actions.note);
  return {
    message,
    // with a plan the server has already tied the suggestion to a milestone (lib/coach-goal.js milestoneSuggestion)
    suggestedSession: cleanSuggestion(actions && 'suggestion' in actions ? actions.suggestion : raw.suggestedSession, topics),
    goalProposal: actions?.goalProposal || null,
    planChanges: actions?.planChanges || null,
    quickReplies: cleanQuick(raw.quickReplies),
  };
}

// The model proposed a goal or plan changes but none could be used: say so instead of silently showing no card.
export function withPlanNote(message, note = PLAN_UNREADABLE_NOTE) {
  return `${message.slice(0, MAX_TEXT - note.length - 2)}\n\n${note}`;
}

// A cut-off answer text: did the model start proposing a goal or plan changes?
export const startsPlanChanges = (text) => /"(planChanges|proposeGoal)"\s*:\s*\{/.test(String(text || ''));

// ---------- saved messages ----------
// One saved message: { id, role: 'coach'|'student', text, at (ms), auto?, suggestion?, proposal?, plan?, quick? }

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
      const proposal = cleanProposal(m.proposal);
      if (proposal) msg.proposal = proposal;
      const plan = cleanStoredPlan(m.plan);
      if (plan) msg.plan = plan;
      const quick = cleanQuick(m.quick);
      if (quick.length) msg.quick = quick;
    }
    out.push(msg);
  }
  return out.slice(-MAX_MESSAGES);
}

export const MAX_STUDENT_CHARS = 500; // a student's turn is cut here; the coach's own turns keep their full text

// A short line telling the coach what it proposed earlier, so it can answer "make it 30 minutes" or "a month later".
const statusWord = (s) => ({
  accepted: 'the student accepted it', applied: 'the student applied it', open: 'waiting for the student', changed: 'the student wants changes',
}[s] || 'not used');
export function proposalSummary(proposal) {
  const p = cleanProposal(proposal);
  if (!p) return '';
  const r = p.request;
  const left = r.options.cut.length ? `, left out: ${r.options.cut.join('+')}` : '';
  return `[proposed goal: template ${r.template}, ${r.level}${r.endDate ? `, until ${r.endDate}` : ''}, ${r.minutesPerDay} min a day${left}${p.preview.fits ? '' : ' (did not fit)'} – ${statusWord(p.status)}]`;
}
export function planSummary(plan) {
  const p = cleanStoredPlan(plan);
  if (!p || p.legacy) return '';
  const bits = [];
  if (p.label) bits.push(`rename to «${p.label}»`);
  if (p.levers.minutesPerDay) bits.push(`${p.levers.minutesPerDay} min a day`);
  if (p.levers.endDate) bits.push(`end date ${p.levers.endDate}`);
  if (p.levers.cut?.length) bits.push(`leave out ${p.levers.cut.join('+')}`);
  return `[proposed for goal ${p.goalId}: ${bits.join('; ') || 'new dates'} – ${statusWord(p.status)}]`;
}

// The conversation the model gets: the last few messages as { role: 'user'|'model', text } turns.
// Student turns are cut to MAX_STUDENT_CHARS. A coach turn keeps its text and, with summary, gets the short summary of
// the card it carried (without summary the card itself is passed on, for the browser to send to the server).
export function turnsForModel(messages, limit = 10, { summary = true } = {}) {
  return (Array.isArray(messages) ? messages : []).slice(-limit).map((m) => {
    if (m?.role !== 'coach') return { role: 'user', text: clip(m?.text, MAX_STUDENT_CHARS) };
    const text = clip(m.text, MAX_TEXT);
    if (summary) {
      const note = [proposalSummary(m.proposal), planSummary(m.plan)].filter(Boolean).join('\n');
      return { role: 'model', text: note ? `${text}\n${note}` : text };
    }
    return { role: 'model', text, ...(m.plan ? { plan: m.plan } : {}), ...(m.proposal ? { proposal: m.proposal } : {}) };
  }).filter((m) => m.text);
}
