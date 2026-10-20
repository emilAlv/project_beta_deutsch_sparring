// Goals through the Coach (review R12, Coach decisions points 1, 2 and 7). Server side (and the check scripts).
//
// The model only CHOOSES a template and its numbers (proposeGoal) or asks for a change (planChanges). This file
//   - cleans what the model sent (unknown template, level, date or id = refused; no title, no part name, no
//     milestone text is ever taken from the model),
//   - runs the generator (lib/plan-templates.js) and turns the result into a small PREVIEW for the chat card,
//   - re-runs the preview when the student picks one of the generator's fixes ("doesn't fit" box),
//   - checks a rename / new end date / new daily time against the goal as it is now and shows before → after.
// Nothing is saved here: the browser saves only after the student taps Accept / Apply.
import { isDay, MAX_GOALS } from './goals.js';
import { MAX_LABEL, PLAN_VERSION } from './plan.js';
import { planRequest, buildPlan, describePlan, replan, cleanPlan } from './plan-templates.js';
import { cleanProposal, cleanLever, cleanRequest, cleanStoredPlan, MAX_CHANGES } from './coach.js';

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const clip = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');

// ---------- notes added to the coach message when a proposal cannot be used ----------
export const NOTES = {
  bad_date: 'I could not use that end date. A goal needs at least a week (an exam goal at least four weeks) and at most three years. Tell me another date.',
  too_many: 'You already have the most goals you can have (12). Delete one on this page first, then I can plan a new one.',
  default: 'I could not put that plan together. Tell me once more what you want to reach and by when.',
  exam_date_fixed: 'The exam date does not move. I can change your daily time or leave something out instead.',
  ended: 'This goal has ended, so I cannot re-plan it.',
};
const noteFor = (error) => NOTES[error] || NOTES.default;

// ---------- a new goal ----------
// The model's proposeGoal → a request for the generator. Only these fields are read; id, startDate and every kind of
// title or name are ignored on purpose.
export function requestFromModel(p) {
  const o = isObj(p?.options) ? p.options : {};
  return {
    template: p?.template, level: p?.level, startLevel: p?.startLevel, endDate: p?.endDate, minutesPerDay: p?.minutesPerDay,
    options: { sources: o.sources, section: o.section, list: o.list, topicIds: o.topicIds, cut: o.cut },
  };
}

// what the card shows: a few milestones per part (names are made by the templates), the numbers, and what does not fit
function previewOf(goal, described, tight) {
  const firstOf = (part) => part.milestones.filter((m) => m.status !== 'skipped' && !m.alreadySolid).slice(0, 3).map((m) => ({ title: m.title, date: m.date }));
  return {
    title: goal.title,
    fits: !tight,
    finishesOn: described.summary.finishesOn,
    bufferDays: described.summary.bufferDays,
    milestones: described.summary.milestones,
    alreadySolid: described.summary.alreadySolid,
    courseWords: described.summary.courseWords,
    parts: described.parts.filter((p) => p.include && p.milestoneCount).map((p) => ({
      title: p.title, count: p.milestones.filter((m) => m.status !== 'skipped').length, words: p.words, until: p.until, first: firstOf(p),
    })),
    tight: tight ? {
      needsUntil: tight.needsUntil, planEnd: tight.planEnd, weeksOver: tight.weeksOver, examDate: tight.examDate,
      byPlanEnd: tight.byPlanEnd, fixes: tight.fixes,
    } : null,
  };
}

const requestOf = (d) => ({
  id: d.id, template: d.template, level: d.level, startLevel: d.startLevel, startDate: d.startDate, endDate: d.endDate,
  minutesPerDay: d.minutesPerDay, options: { ...d.options, cut: d.cut || [] },
});

// request (any shape) → { ok, goal, proposal } or { ok: false, error }. Stores nothing.
export function previewProposal(raw, ctx) {
  const req = planRequest(raw, ctx);
  if (!req.ok) return req;
  const { goal, tight } = buildPlan(req.draft, ctx);
  const described = describePlan(goal, ctx, tight);
  const proposal = cleanProposal({ request: requestOf(req.draft), preview: previewOf(goal, described, tight), status: 'open' });
  return proposal ? { ok: true, goal, proposal } : { ok: false, error: 'bad_template' };
}

// The student picked one of the generator's fixes ("30 minutes a day", "leave out course words", "move the end date"):
// the same request with that lever applied, previewed again.
export function applyFix(rawRequest, rawLever, ctx) {
  const request = cleanRequest(rawRequest);
  if (!request) return { ok: false, error: 'bad_template' };
  const lever = cleanLever(rawLever);
  const next = {
    ...request,
    ...(lever.minutesPerDay ? { minutesPerDay: lever.minutesPerDay } : {}),
    ...(lever.endDate ? { endDate: lever.endDate } : {}),
    options: { ...request.options, cut: [...new Set([...request.options.cut, ...(lever.cut || [])])] },
  };
  return previewProposal(next, ctx);
}

// ---------- a change to a goal the student has ----------
const planOf = (goals, id) => {
  const g = goals.find((x) => x.id === id && Number(x.version) === PLAN_VERSION);
  return g ? cleanPlan(g) : null;
};

// The student's own words for a goal: accepted only when they were really typed by the student (the model must not make names).
export const labelFrom = (label, studentText) => {
  const l = clip(label, MAX_LABEL);
  return l && String(studentText || '').toLowerCase().includes(l.toLowerCase()) ? l : '';
};

// goal (clean v2) + { levers, label } → { ok, goal, changes, tight, … } – used for the card AND again when the student taps Apply.
export function applyPlanChange(goal, ctx, today, { levers = {}, label = '' } = {}) {
  const lev = cleanLever(levers);
  let out = { ok: true, goal, changes: [], tight: null };
  if (Object.keys(lev).length) {
    out = replan(goal, ctx, today, lev);
    if (!out.ok) return out;
  }
  const name = clip(label, MAX_LABEL);
  if (name && name !== out.goal.title) {
    out = {
      ...out,
      goal: cleanPlan({ ...out.goal, label: name }),
      changes: [{ type: 'rename', from: out.goal.title, to: name }, ...out.changes],
    };
    if (!out.goal) return { ok: false, error: 'bad_goal' };
  }
  return { ...out, ...describePlan(out.goal, ctx, out.tight) };
}

const dayLine = (d) => d || '';
function planCard(goal, out, lev, label) {
  const shown = out.changes.slice(0, MAX_CHANGES);
  return cleanStoredPlan({
    goalId: goal.id,
    label: label || undefined,
    levers: lev,
    changes: shown.map((c) => ({
      type: c.type, title: clip(c.title, 120),
      from: c.type === 'rename' ? c.from : dayLine(c.from), to: c.type === 'rename' ? c.to : dayLine(c.to),
    })),
    more: Math.max(0, out.changes.length - shown.length),
    fits: !out.tight,
    needsUntil: out.tight ? out.tight.needsUntil : null,
    status: 'open',
  });
}

// ---------- the whole model answer ----------
// raw = the parsed JSON of the model. goals = the student's clean goals. lastUser = the student's last message.
// → { goalProposal, planChanges, note }
export function goalActions(raw, { goals, ctx, today, lastUser }) {
  const out = { goalProposal: null, planChanges: null, note: '' };
  if (!isObj(raw)) return out;
  if (isObj(raw.proposeGoal)) {
    if ((goals || []).length >= MAX_GOALS) {
      out.note = NOTES.too_many;
      return out;
    }
    const r = previewProposal(requestFromModel(raw.proposeGoal), ctx);
    if (r.ok) out.goalProposal = r.proposal;
    else out.note = noteFor(r.error);
    return out;
  }
  if (isObj(raw.planChanges)) {
    const pc = raw.planChanges;
    const goal = planOf(goals || [], typeof pc.goalId === 'string' ? pc.goalId : '');
    if (!goal) {
      out.note = NOTES.default;
      return out;
    }
    const label = labelFrom(pc.label, lastUser);
    const lev = cleanLever({
      minutesPerDay: pc.minutesPerDay, endDate: isDay(pc.endDate) ? pc.endDate : undefined, cut: pc.cut,
    });
    if (!label && !Object.keys(lev).length) {
      out.note = NOTES.default;
      return out;
    }
    const r = applyPlanChange(goal, ctx, today, { levers: lev, label });
    if (!r.ok) {
      out.note = noteFor(r.error);
      return out;
    }
    if (!r.changes.length) return out; // nothing would change: no card
    out.planChanges = planCard(goal, r, lev, label);
  }
  return out;
}
