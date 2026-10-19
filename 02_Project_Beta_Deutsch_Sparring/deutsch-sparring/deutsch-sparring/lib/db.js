// The one database connection (Neon Postgres) + the tiny migration. Server only.
import { neon } from '@neondatabase/serverless';
import { SCHEMA, databaseUrl } from './schema.mjs';

let client = null;
export const sql = () => (client ??= neon(databaseUrl()));

// the tiny migration, once per server start (tried again if it failed)
let ready = null;
export function ensureSchema() {
  ready ??= (async () => {
    for (const statement of SCHEMA) await sql().query(statement);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
