// The one database connection (Neon Postgres) + the migration check. Server only.
import { neon } from '@neondatabase/serverless';
import { migrate, databaseUrl } from './schema.mjs';

let client = null;
// (scripts/check-saves.mjs hands in a fake connection through globalThis.__wortTestSql; only when WORT_CHECK=1)
export const sql = () => (client ??= (process.env.WORT_CHECK === '1' && globalThis.__wortTestSql) || neon(databaseUrl()));

// Once per server start: ask which migration step the database is at (ONE query) and, only if it is behind, run
// the missing steps (lib/schema.mjs). Tried again if it failed.
let ready = null;
export function ensureSchema() {
  ready ??= migrate(sql()).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
