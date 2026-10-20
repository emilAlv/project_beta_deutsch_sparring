import { progressRoute, bad } from '../../../lib/progress-api';
import { planContext } from '../../../lib/home-data';
import { previewPlan, replan, describePlan, cleanPlan } from '../../../lib/plan-templates';
import { isDay, dayNum, todayKey } from '../../../lib/goals';

export const dynamic = 'force-dynamic';

// The plan preview (review R10, redesign §4.7). Fixed rules only, no AI call. STORES NOTHING.
//   POST { draft: { template, endDate, minutesPerDay, startLevel, options } }  → { ok, goal, tight, summary, parts }
//   POST { goal, levers: { minutesPerDay?, endDate?, focus?, cut? } }          → { ok, goal, changes, tight, summary, parts }
// Works with and without an account (without one, the browser sends its scores and rulelog, as for /api/stats).
// today: the browser's own day, accepted when it is at most one day from the server's (time zones).
const todayOf = (body) => {
  const server = todayKey();
  return isDay(body?.today) && Math.abs(dayNum(body.today) - dayNum(server)) <= 1 ? body.today : server;
};

export const POST = (req) => progressRoute(req, { write: true, maxBytes: 400_000, allowOff: true }, async ({ user, body }) => {
  const today = todayOf(body);
  const ctx = await planContext(user, body, today);
  if (body.draft) {
    const out = previewPlan(body.draft, ctx);
    return out.ok ? out : bad(out.error);
  }
  if (body.goal) {
    const goal = cleanPlan(body.goal);
    if (!goal) return bad('bad_goal');
    const out = replan(goal, ctx, today, body.levers && typeof body.levers === 'object' ? body.levers : {});
    return out.ok ? { ...out, ...describePlan(out.goal, ctx, out.tight) } : bad(out.error);
  }
  return bad('bad_body');
});
