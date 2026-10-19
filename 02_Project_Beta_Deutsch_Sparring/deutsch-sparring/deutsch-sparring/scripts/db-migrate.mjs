// Creates the database tables (safe to run again: nothing is changed if they exist).
// The app also does this by itself on first use; this script is for doing it on purpose.
//
//   node scripts/db-migrate.mjs
//
// Needs DATABASE_URL (or POSTGRES_URL) – in the environment or in .env.local.
import { neon } from '@neondatabase/serverless';
import { SCHEMA, databaseUrl } from '../lib/schema.mjs';

try {
  process.loadEnvFile?.('.env.local');
} catch {}

const url = databaseUrl();
if (!url) {
  console.error('No database address found. Put DATABASE_URL=… into .env.local (see docs/security-accounts.md).');
  process.exit(1);
}

const sql = neon(url);
for (const statement of SCHEMA) await sql.query(statement);
const [{ n }] = await sql.query('SELECT count(*)::int AS n FROM users');
console.log(`Database ready. Accounts: ${n}.`);
