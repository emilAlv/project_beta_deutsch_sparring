import { progressRoute, bad } from '../../../lib/progress-api';
import { planContext } from '../../../lib/home-data';
import { previewPlan, cleanPlan } from '../../../lib/plan-templates';
import { applyFix, applyPlanChange } from '../../../lib/coach-goal';
import { isDay, dayNum, todayKey } from '../../../lib/goals';

export const dynamic = 'force-dynamic';

// The plan preview (review R10, redesign §4.7) and what the Coach cards need (R12). Fixed rules only, no AI call. STORES NOTHING.
//   POST { draft: { template, endDate, minutesPerDay, startLevel, options } }  → { ok, goal, tight, summary, parts }   (Accept: the goal to save)
//   POST { fix: { request, lever } }                                           → { ok, proposal }   (a "doesn't fit" fix, previewed again)
//   POST { goal, levers: { minutesPerDay?, endDate?, focus?, cut? }, label? }  → { ok, goal, changes, tight, summary, parts }   (Apply)
// Works with and without an account (without one, the browser sends its scores and rulelog, as for /api/stats).
// today: the browser's own day, accepted when it is at most one day from the server's (time zones).
const todayOf = (body) => {
  const server = todayKey();
  return isDay(body?.today) && Math.abs(dayNum(body.today) - dayNum(server)) <= 1 ? body.today : server;
};

export const POST = (req) => progressRoute(req, { write: true, maxBytes: 400_000, allowOff: true }, async ({ user, body }) => {
  const today = todayOf(body);
  const ctx = await planContext(user, body, today);
  if (body.fix && typeof body.fix === 'object') {
    const out = applyFix(body.fix.request, body.fix.lever, ctx);
    return out.ok ? { ok: true, proposal: out.proposal } : bad(out.error);
  }
  if (body.draft) {
    const out = previewPlan(body.draft, ctx);
    return out.ok ? out : bad(out.error);
  }
  if (body.goal) {
    const goal = cleanPlan(body.goal);
    if (!goal) return bad('bad_goal');
    const levers = body.levers && typeof body.levers === 'object' ? body.levers : {};
    const out = applyPlanChange(goal, ctx, today, { levers, label: typeof body.label === 'string' ? body.label : '' });
    return out.ok ? out : bad(out.error);
  }
  return bad('bad_body');
});
