import { progressRoute, bad } from '../../../lib/progress-api';
import { goalsStore } from '../../../lib/goals-store';
import { cleanGoal, cleanGoalId } from '../../../lib/goals';

export const dynamic = 'force-dynamic';

// Goals and milestones of the logged-in student (accounts only; without accounts they live in the browser).
// GET → { goals }   POST { goal } → create or replace one goal with its milestones   DELETE ?id= → delete one goal
export const GET = (req) => progressRoute(req, {}, async ({ user }) => ({ goals: await goalsStore().list(user.id) }));

export const POST = (req) => progressRoute(req, { write: true, maxBytes: 20_000 }, async ({ user, body }) => {
  const goal = cleanGoal(body.goal);
  if (!goal) return bad('bad_goal');
  const ok = await goalsStore().save(user.id, goal);
  return ok ? { ok: true, goal } : Response.json({ code: 'too_many' }, { status: 409 });
});

export const DELETE = (req) => progressRoute(req, { write: true, needsBody: false }, async ({ user, req: r }) => {
  const id = cleanGoalId(new URL(r.url).searchParams.get('id'));
  if (!id) return bad('bad_id');
  await goalsStore().remove(user.id, id);
  return { ok: true };
});
