// A logged-in student's goals and milestones, kept on the server (Task 9). Server only.
// The database (Neon) – or, with AUTH_MEMORY=1 for local tests, a list in memory.
// Goals are always cleaned first (cleanGoal in lib/goals.js, cleanPlan in lib/plan-templates.js for the new
// plans); every query is parameterised and always restricted to the student's own user_id (taken from the login
// cookie, never from the request).
//
// Two kinds of goal (old ones are converted by the student on Home, R12):
//   - new plans (version 2, review R10): the whole plan is ONE value in goals.plan, saved with ONE statement (an UPSERT
//     that also checks the 12-goal limit), so a save can never be half-done;
//   - old goals: goals row + milestones rows (read only while goals.plan is empty).
import { databaseUrl } from './schema.mjs';
import { sql, ensureSchema } from './db';
import { MAX_GOALS } from './goals';
import { PLAN_VERSION, withLegacyFields } from './plan';
import { cleanPlan } from './plan-templates';
import { applyReached } from './plan-progress';

const isPlan = (goal) => goal?.version === PLAN_VERSION;
// what a list returns for a new plan: the clean plan plus the fields the old Home code reads (until R13)
const planView = (raw) => {
  const goal = cleanPlan(raw);
  return goal ? withLegacyFields(goal) : null;
};

// ---------- in memory (AUTH_MEMORY=1) ----------
const mem = (globalThis.__wortMemoryGoals ??= new Map()); // userId → Map(goalId → goal)
const box = (userId) => {
  if (!mem.has(userId)) mem.set(userId, new Map());
  return mem.get(userId);
};

const memoryStore = {
  async list(userId) {
    return [...box(userId).values()]
      .map((g) => (isPlan(g) ? planView(g) : structuredClone(g)))
      .filter(Boolean)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  },
  // → true (saved) or false (too many goals)
  async save(userId, goal) {
    const b = box(userId);
    if (!b.has(goal.id) && b.size >= MAX_GOALS) return false;
    b.set(goal.id, structuredClone(goal));
    return true;
  },
  async remove(userId, id) {
    return box(userId).delete(id);
  },
  async markReached(userId, goalId, ids, day) {
    const g = box(userId).get(goalId);
    if (!isPlan(g)) return false;
    box(userId).set(goalId, applyReached(g, ids, day));
    return true;
  },
};

// ---------- Postgres (Neon) ----------
// One statement: insert or replace the goal with its whole plan – only if the goal exists already or the student
// has fewer than MAX_GOALS goals. No row back = too many goals.
const UPSERT_PLAN = `INSERT INTO goals (id, user_id, type, level, title, start_date, end_date, scope, plan)
  SELECT $1, $2::uuid, $3, $4, $5, $6::date, $7::date, '{}'::jsonb, $8::jsonb
  WHERE EXISTS (SELECT 1 FROM goals WHERE user_id = $2::uuid AND id = $1)
     OR (SELECT count(*) FROM goals WHERE user_id = $2::uuid) < $9::int
  ON CONFLICT (user_id, id) DO UPDATE SET type = EXCLUDED.type, level = EXCLUDED.level, title = EXCLUDED.title,
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, scope = EXCLUDED.scope, plan = EXCLUDED.plan
  RETURNING id`;
export const UPSERT_PLAN_SQL = UPSERT_PLAN; // for scripts/check-plan.mjs

// Latching (R11): set reachedAt on the named milestones, ONLY where it is still empty – one statement, so two runs at
// the same time or the same run twice do no harm. Touches nothing else in the plan, and only a plan that has parts.
// $1 user, $2 goal, $3 milestone ids, $4 the day.
const MARK_REACHED = `UPDATE goals SET plan = jsonb_set(plan, '{subPlans}', COALESCE((
    SELECT jsonb_agg(jsonb_set(sp, '{milestones}', COALESCE((
      SELECT jsonb_agg(CASE WHEN (m->>'id') = ANY($3::text[]) AND (m->>'reachedAt') IS NULL
                            THEN m || jsonb_build_object('reachedAt', $4::text) ELSE m END ORDER BY mo)
      FROM jsonb_array_elements(sp->'milestones') WITH ORDINALITY AS ms(m, mo)
    ), '[]'::jsonb)) ORDER BY so)
    FROM jsonb_array_elements(plan->'subPlans') WITH ORDINALITY AS ps(sp, so)
  ), '[]'::jsonb))
  WHERE user_id = $1::uuid AND id = $2 AND jsonb_typeof(plan->'subPlans') = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(plan->'subPlans') AS e(sp), jsonb_array_elements(e.sp->'milestones') AS f(m)
                WHERE (f.m->>'id') = ANY($3::text[]) AND (f.m->>'reachedAt') IS NULL)
  RETURNING id`;
export const MARK_REACHED_SQL = MARK_REACHED; // for scripts/check-plan.mjs

const dbStore = {
  async list(userId) {
    await ensureSchema();
    const [goals, milestones] = await Promise.all([
      sql().query(
        `SELECT id, type, level, title, start_date::text AS start_date, end_date::text AS end_date, scope, plan
         FROM goals WHERE user_id = $1 ORDER BY start_date, created_at LIMIT ${MAX_GOALS}`,
        [userId],
      ),
      sql().query(
        `SELECT m.id, m.goal_id, m.due_date::text AS due_date, m.title, m.target, m.status
         FROM milestones m JOIN goals g ON g.user_id = m.user_id AND g.id = m.goal_id
         WHERE m.user_id = $1 AND g.plan IS NULL ORDER BY m.due_date, m.target`,
        [userId],
      ),
    ]);
    return goals.map((g) => (g.plan ? planView({ ...g.plan, id: g.id }) : {
      id: g.id, type: g.type, level: g.level, title: g.title, startDate: g.start_date, endDate: g.end_date,
      scope: { section: g.scope?.section || null, list: g.scope?.list || null, rules: Array.isArray(g.scope?.rules) ? g.scope.rules : [] },
      milestones: milestones.filter((m) => m.goal_id === g.id)
        .map((m) => ({ id: m.id, date: m.due_date, title: m.title, target: Number(m.target), status: m.status === 'done' ? 'done' : 'open' })),
    })).filter(Boolean);
  },
  async save(userId, goal) {
    await ensureSchema();
    if (isPlan(goal)) {
      const rows = await sql().query(UPSERT_PLAN, [
        goal.id, userId, goal.template, goal.level, goal.title, goal.startDate, goal.endDate, JSON.stringify(goal), MAX_GOALS,
      ]);
      // a converted old goal (R12): its old "% ready" milestones are deleted for good (D6); for a new goal this deletes nothing
      if (rows.length) await sql().query('DELETE FROM milestones WHERE user_id = $1 AND goal_id = $2', [userId, goal.id]);
      return rows.length > 0;
    }
    // ---- old-style goal (kept only so an old goal can still be saved or tested; the goal form is gone, R12) ----
    const count = await sql().query(
      'SELECT count(*)::int AS n, COALESCE(bool_or(id = $2), false) AS has FROM goals WHERE user_id = $1',
      [userId, goal.id],
    );
    if (!count[0]?.has && (count[0]?.n || 0) >= MAX_GOALS) return false;
    await sql().query(
      `INSERT INTO goals (id, user_id, type, level, title, start_date, end_date, scope)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::jsonb)
       ON CONFLICT (user_id, id) DO UPDATE SET type = EXCLUDED.type, level = EXCLUDED.level, title = EXCLUDED.title,
         start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, scope = EXCLUDED.scope, plan = NULL`,
      [goal.id, userId, goal.type, goal.level, goal.title, goal.startDate, goal.endDate, JSON.stringify(goal.scope)],
    );
    // the milestones are replaced as a whole (one statement to delete, one to insert)
    await sql().query('DELETE FROM milestones WHERE user_id = $1 AND goal_id = $2', [userId, goal.id]);
    if (goal.milestones.length) {
      const params = [userId, goal.id];
      const values = goal.milestones.map((m, i) => {
        params.push(m.id, m.date, m.title, m.target, m.status);
        const p = 3 + i * 5;
        return `($1, $2, $${p}, $${p + 1}::date, $${p + 2}, $${p + 3}::int, $${p + 4})`;
      });
      await sql().query(`INSERT INTO milestones (user_id, goal_id, id, due_date, title, target, status) VALUES ${values.join(', ')}`, params);
    }
    return true;
  },
  async markReached(userId, goalId, ids, day) {
    await ensureSchema();
    const rows = await sql().query(MARK_REACHED, [userId, goalId, ids, day]);
    return rows.length > 0;
  },
  async remove(userId, id) {
    await ensureSchema();
    const rows = await sql().query('DELETE FROM goals WHERE user_id = $1 AND id = $2 RETURNING id', [userId, id]);
    return rows.length > 0;
  },
};

export const goalsStore = () => (databaseUrl() ? dbStore : memoryStore);
