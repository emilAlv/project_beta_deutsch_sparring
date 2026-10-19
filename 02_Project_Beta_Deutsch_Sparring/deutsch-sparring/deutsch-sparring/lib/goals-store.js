// A logged-in student's goals and milestones, kept on the server (Task 9). Server only.
// The database (Neon) – or, with AUTH_MEMORY=1 for local tests, a list in memory.
// Goals are always cleaned first (cleanGoal in lib/goals.js); every query is parameterised and
// always restricted to the student's own user_id (taken from the login cookie, never from the request).
import { databaseUrl } from './schema.mjs';
import { sql, ensureSchema } from './db';
import { MAX_GOALS } from './goals';

// ---------- in memory (AUTH_MEMORY=1) ----------
const mem = (globalThis.__wortMemoryGoals ??= new Map()); // userId → Map(goalId → goal)
const box = (userId) => {
  if (!mem.has(userId)) mem.set(userId, new Map());
  return mem.get(userId);
};

const memoryStore = {
  async list(userId) {
    return [...box(userId).values()].map((g) => structuredClone(g)).sort((a, b) => a.startDate.localeCompare(b.startDate));
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
};

// ---------- Postgres (Neon) ----------
const dbStore = {
  async list(userId) {
    await ensureSchema();
    const [goals, milestones] = await Promise.all([
      sql().query(
        `SELECT id, type, level, title, start_date::text AS start_date, end_date::text AS end_date, scope
         FROM goals WHERE user_id = $1 ORDER BY start_date, created_at LIMIT ${MAX_GOALS}`,
        [userId],
      ),
      sql().query(
        `SELECT id, goal_id, due_date::text AS due_date, title, target, status
         FROM milestones WHERE user_id = $1 ORDER BY due_date, target`,
        [userId],
      ),
    ]);
    return goals.map((g) => ({
      id: g.id, type: g.type, level: g.level, title: g.title, startDate: g.start_date, endDate: g.end_date,
      scope: { section: g.scope?.section || null, list: g.scope?.list || null, rules: Array.isArray(g.scope?.rules) ? g.scope.rules : [] },
      milestones: milestones.filter((m) => m.goal_id === g.id)
        .map((m) => ({ id: m.id, date: m.due_date, title: m.title, target: Number(m.target), status: m.status === 'done' ? 'done' : 'open' })),
    }));
  },
  async save(userId, goal) {
    await ensureSchema();
    const count = await sql().query(
      'SELECT count(*)::int AS n, COALESCE(bool_or(id = $2), false) AS has FROM goals WHERE user_id = $1',
      [userId, goal.id],
    );
    if (!count[0]?.has && (count[0]?.n || 0) >= MAX_GOALS) return false;
    await sql().query(
      `INSERT INTO goals (id, user_id, type, level, title, start_date, end_date, scope)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::jsonb)
       ON CONFLICT (user_id, id) DO UPDATE SET type = EXCLUDED.type, level = EXCLUDED.level, title = EXCLUDED.title,
         start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, scope = EXCLUDED.scope`,
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
  async remove(userId, id) {
    await ensureSchema();
    const rows = await sql().query('DELETE FROM goals WHERE user_id = $1 AND id = $2 RETURNING id', [userId, id]);
    return rows.length > 0;
  },
};

export const goalsStore = () => (databaseUrl() ? dbStore : memoryStore);
