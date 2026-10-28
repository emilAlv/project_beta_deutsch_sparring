// R14: how a Sparring session belongs to a plan milestone (redesign §3.4 and §3.5). Pure functions, no React, no fs.
//   setup screen    does the form still match the milestone it was opened from? (the strip turns grey when not)
//   settings        sessions.settings.milestoneId (+ milestoneTitle for the ribbon) – an id string, length-limited
//   summary         "Your milestone": how far the milestone moved in this session, from the numbers of
//                   lib/plan-progress.js (taken before the session and after it). Names come only from lib/plan-templates.js.
import { allMilestones } from './plan.js';
import { milestoneTitle, partTitle } from './plan-templates.js';

export const MILESTONE_ID_MAX = 40;
export const MILESTONE_TITLE_MAX = 160;

// an id as the plan generator makes it (letters, digits, - and _); anything else is dropped
export const cleanMilestoneId = (x) => (typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x) ? x : null);
export const cleanMilestoneTitle = (x) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, MILESTONE_TITLE_MAX) : null);

// Does the setup form (as it will really be used) still fit the milestone's own settings (the patch of setupFromSession)?
// Topic, level, kind and (for words) the source count. Difficulty, number of questions and variant are free.
export function setupMatches(form, patch) {
  if (!patch || !form) return false;
  if (form.kind !== patch.kind) return false;
  if (patch.level && form.level !== patch.level) return false;
  if (form.kind === 'grammar') return (form.grammarTopic || null) === (patch.grammarTopic || null);
  if (patch.source && form.source !== patch.source) return false;
  return (form.section || null) === (patch.section || null) && (form.list || null) === (patch.list || null);
}

// find a milestone in the goals → { goal, part, m, title, partTitle } or null
export function findMilestone(goals, id) {
  if (!id) return null;
  for (const goal of goals || []) {
    if (Number(goal?.version) !== 2 || !Array.isArray(goal.subPlans)) continue;
    const hit = allMilestones(goal).find(({ m }) => m.id === id);
    if (hit) return { goal, part: hit.part, m: hit.m, title: milestoneTitle(hit.m.criterion), partTitle: partTitle(hit.part) };
  }
  return null;
}

const isReachedState = (s) => s === 'reached' || s === 'refresh';

// A small copy of the milestone numbers, taken when a session starts (and compared with the numbers after it):
// { [milestoneId]: { have, need, total, unit, reached } }
export function milestoneSnapshot(plans) {
  const out = {};
  for (const plan of Object.values(plans || {})) {
    for (const [id, i] of Object.entries(plan?.milestones || {})) {
      if (i.state === 'skipped') continue;
      out[id] = { have: i.have, need: i.need, total: i.total, unit: i.unit, reached: isReachedState(i.state) || Boolean(i.reachedAt) };
    }
  }
  return out;
}

// ---------- the summary box ----------
// before = milestoneSnapshot from the start of the session (or null), after = /api/stats data ({ goals, plans, nextUp }),
// milestoneId = settings.milestoneId of the session (or null).
// → { state: 'plan' | 'none', primary, also[] }
//   primary { id, title, partTitle, unit, criterion, from, to, total, need, reached, justReached, date }
//   also    [{ id, title, partTitle, unit, plus }]  other milestones whose count went up in this session
//   state 'none' = the session matched no milestone and moved none: "not in your plan"
export function milestoneSummary(before, after, milestoneId) {
  const now = milestoneSnapshot(after?.plans);
  const rest = (skip) => Object.keys(now).filter((id) => id !== skip).map((id) => {
    const a = now[id];
    const b = before?.[id];
    if (!b) return null;
    const plus = a.unit === 'answers' || a.unit === 'words' || a.unit === 'lessons' ? a.have - b.have : 0;
    const up = plus > 0 || (a.reached && !b.reached);
    if (!up) return null;
    const hit = findMilestone(after.goals, id);
    return hit ? { id, title: hit.title, partTitle: hit.partTitle, unit: a.unit, plus: Math.max(plus, 0), justReached: a.reached && !b.reached } : null;
  }).filter(Boolean);

  const mine = milestoneId ? findMilestone(after?.goals, milestoneId) : null;
  const cur = mine ? now[milestoneId] : null;
  const also = rest(mine ? milestoneId : null);
  if (!mine || !cur) return also.length ? { state: 'plan', primary: null, also } : { state: 'none', primary: null, also: [] };
  const was = before?.[milestoneId] || cur;
  const plan = after.plans?.[mine.goal.id]?.milestones?.[milestoneId];
  return {
    state: 'plan',
    primary: {
      id: milestoneId, title: mine.title, partTitle: mine.partTitle, unit: cur.unit, criterion: mine.m.criterion,
      from: was.have, to: cur.have, total: cur.total, need: cur.need,
      reached: cur.reached, justReached: cur.reached && !was.reached,
      date: cur.reached ? null : mine.m.date || plan?.date || null,
    },
    also,
  };
}
