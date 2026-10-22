import { progressRoute, bad, overCap } from '../../../lib/progress-api';
import { goalsStore } from '../../../lib/goals-store';
import { cleanGoal, cleanGoalId, todayKey } from '../../../lib/goals';
import { tickExam } from '../../../lib/home-plan';
import { PLAN_VERSION } from '../../../lib/plan';
import { cleanPlan } from '../../../lib/plan-templates';

export const dynamic = 'force-dynamic';

// Goals and milestones of the logged-in student (accounts only; without accounts they live in the browser).
// GET → { goals }   POST { goal } → create or replace one goal with its milestones   DELETE ?id= → delete one goal
// A goal with version 2 is a new plan (review R10): parts + up to 40 milestones each, saved with one UPSERT;
// its title always comes from the template (lib/plan-templates.js), never from the request.
export const GET = (req) => progressRoute(req, {}, async ({ user }) => ({ goals: await goalsStore().list(user.id) }));

export const POST = (req) => progressRoute(req, { write: true, maxBytes: 60_000 }, async ({ user, body }) => {
  const goal = Number(body.goal?.version) === PLAN_VERSION ? cleanPlan(body.goal) : cleanGoal(body.goal);
  if (!goal) return bad('bad_goal');
  const capped = await overCap(user, 'goal');
  if (capped) return capped;
  const ok = await goalsStore().save(user.id, goal);
  return ok ? { ok: true, goal } : Response.json({ code: 'too_many' }, { status: 409 });
});

// PATCH { goalId, milestoneId, result? } → the student ticks an exam milestone done (a mock exam, Schreiben/Sprechen done outside
// the app), with optional points. Nothing else can be ticked by hand; the server checks it against the stored goal.
export const PATCH = (req) => progressRoute(req, { write: true, maxBytes: 2_000 }, async ({ user, body }) => {
  const goalId = cleanGoalId(body.goalId);
  const milestoneId = cleanGoalId(body.milestoneId);
  if (!goalId || !milestoneId) return bad('bad_id');
  const goal = (await goalsStore().list(user.id)).find((g) => g.id === goalId);
  const next = goal && tickExam(goal, milestoneId, todayKey(), body.result);
  const clean = next && cleanPlan(next);
  if (!clean) return bad('bad_goal');
  const capped = await overCap(user, 'goal');
  if (capped) return capped;
  const ok = await goalsStore().save(user.id, clean);
  return ok ? { ok: true, goal: clean } : Response.json({ code: 'too_many' }, { status: 409 });
});

export const DELETE = (req) => progressRoute(req, { write: true, needsBody: false }, async ({ user, req: r }) => {
  const id = cleanGoalId(new URL(r.url).searchParams.get('id'));
  if (!id) return bad('bad_id');
  await goalsStore().remove(user.id, id);
  return { ok: true };
});
