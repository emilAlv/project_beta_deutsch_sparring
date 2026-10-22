// A logged-in student's coach messages (the last 30), kept on the server (Task 10). Server only.
// The database (Neon) – or, with AUTH_MEMORY=1 for local tests, a list in memory.
// Messages are cleaned first (cleanStoredMessages in lib/coach.js); every query is parameterised and always
// restricted to the student's own user_id (taken from the login cookie, never from the request).
import { databaseUrl } from './schema.mjs';
import { sql, ensureSchema } from './db';
import { MAX_MESSAGES } from './coach.js';

// ---------- in memory (AUTH_MEMORY=1) ----------
const mem = (globalThis.__wortMemoryCoach ??= new Map()); // userId → [message]

const memoryStore = {
  async list(userId) {
    return structuredClone(mem.get(userId) || []);
  },
  async replace(userId, messages) {
    mem.set(userId, structuredClone(messages.slice(-MAX_MESSAGES)));
  },
};

// ---------- Postgres (Neon) ----------
const dbStore = {
  async list(userId) {
    await ensureSchema();
    const rows = await sql().query(
      `SELECT id, role, text, data, (extract(epoch from created_at) * 1000)::bigint AS at
       FROM coach_messages WHERE user_id = $1 ORDER BY created_at, pos LIMIT ${MAX_MESSAGES}`,
      [userId],
    );
    return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, at: Number(r.at), ...(r.data || {}) }));
  },
  // the saved list is replaced as a whole: new and changed messages are written, the others deleted
  async replace(userId, messages) {
    await ensureSchema();
    const list = messages.slice(-MAX_MESSAGES);
    const queries = [];
    if (list.length) {
      const params = [userId];
      const values = list.map((m, i) => {
        const { id, role, text, at, ...data } = m;
        params.push(id, role, text, JSON.stringify(data), i, at);
        const p = 2 + i * 6;
        return `($1, $${p}, $${p + 1}, $${p + 2}, $${p + 3}::jsonb, $${p + 4}::int, to_timestamp($${p + 5}::double precision / 1000))`;
      });
      queries.push([
        `INSERT INTO coach_messages (user_id, id, role, text, data, pos, created_at) VALUES ${values.join(', ')}
         ON CONFLICT (user_id, id) DO UPDATE SET role = EXCLUDED.role, text = EXCLUDED.text, data = EXCLUDED.data,
           pos = EXCLUDED.pos, created_at = EXCLUDED.created_at`,
        params,
      ]);
    }
    queries.push(['DELETE FROM coach_messages WHERE user_id = $1 AND NOT (id = ANY($2::text[]))', [userId, list.map((m) => m.id)]]);
    // write and clean-up in ONE transaction: the saved chat is never left half-replaced (R3)
    await sql().transaction((t) => queries.map(([text, params]) => t.query(text, params)));
  },
};

export const coachStore = () => (databaseUrl() ? dbStore : memoryStore);
