// Where accounts are kept: the Postgres database (Neon) – or, with AUTH_MEMORY=1 for local
// tests, a list in memory that is gone after a restart. Server only.
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { SCHEMA, databaseUrl } from './schema.mjs';

const COLUMNS = 'id, username, password_hash, salt';

// ---------- in memory (AUTH_MEMORY=1) ----------
// on globalThis so every route of the dev server sees the same list
const mem = (globalThis.__wortMemoryUsers ??= { byId: new Map(), byName: new Map() });

const memoryStore = {
  async findByUsername(username) {
    const id = mem.byName.get(username.toLowerCase());
    return id ? { ...mem.byId.get(id) } : null;
  },
  async findById(id) {
    const u = mem.byId.get(id);
    return u ? { ...u } : null;
  },
  async create({ username, hash, salt }) {
    const key = username.toLowerCase();
    if (mem.byName.has(key)) return null;
    const user = { id: randomUUID(), username, password_hash: hash, salt };
    mem.byId.set(user.id, user);
    mem.byName.set(key, user.id);
    return { ...user };
  },
};

// ---------- Postgres (Neon) ----------
let sqlClient = null;
const sql = () => (sqlClient ??= neon(databaseUrl()));

// the tiny migration, once per server start (tried again if it failed)
let ready = null;
function ensureSchema() {
  ready ??= (async () => {
    for (const statement of SCHEMA) await sql().query(statement);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dbStore = {
  async findByUsername(username) {
    await ensureSchema();
    const rows = await sql().query(`SELECT ${COLUMNS} FROM users WHERE lower(username) = lower($1)`, [username]);
    return rows[0] || null;
  },
  async findById(id) {
    if (!UUID.test(id)) return null;
    await ensureSchema();
    const rows = await sql().query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  // → the new user, or null if the username is taken
  async create({ username, hash, salt }) {
    await ensureSchema();
    const rows = await sql().query(
      `INSERT INTO users (id, username, password_hash, salt) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      [randomUUID(), username, hash, salt],
    );
    return rows[0] || null;
  },
};

export const users = () => (databaseUrl() ? dbStore : memoryStore);
