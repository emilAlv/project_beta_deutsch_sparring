// Brings the database up to date (safe to run again: nothing is changed if it is already up to date).
// The app also does this by itself on first use; this script is for doing it on purpose.
//
//   node scripts/db-migrate.mjs                    → run the missing migration steps (lib/schema.mjs) and delete
//                                                    limit counters older than two days (table usage)
//   node scripts/db-migrate.mjs --trim-old-texts   → ALSO empty the question/answer texts of answers older than
//                                                    90 days (add --days=N to use another number, at least 30)
//
// The trim step is never run by the app, only when you type the flag. It keeps every number and created_at, so
// the statistics do not change; it prints only HOW MANY answers it changed, never their content.
// It cannot be undone, so make a backup (Neon: branch / restore) first if you are unsure.
//
// Needs DATABASE_URL (or POSTGRES_URL) – in the environment or in .env.local.
import { neon } from '@neondatabase/serverless';
import { migrate, databaseUrl, TRIM_OLD_TEXTS_SQL, TRIM_OLD_TEXTS_DAYS, USAGE_CLEANUP_SQL } from '../lib/schema.mjs';

try {
  process.loadEnvFile?.('.env.local');
} catch {}

const args = process.argv.slice(2);
const known = (a) => a === '--trim-old-texts' || /^--days=\d+$/.test(a);
const unknown = args.filter((a) => !known(a));
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}. Known: --trim-old-texts [--days=N]`);
  process.exit(1);
}
const trim = args.includes('--trim-old-texts');
const days = Number(args.find((a) => a.startsWith('--days='))?.slice(7) ?? TRIM_OLD_TEXTS_DAYS);
if (trim && !(days >= 30)) {
  console.error('--days must be 30 or more (this cannot be undone).');
  process.exit(1);
}

const url = databaseUrl();
if (!url) {
  console.error('No database address found. Put DATABASE_URL=… into .env.local (see docs/security-accounts.md).');
  process.exit(1);
}

const sql = neon(url);
const { from, to } = await migrate(sql, { onStep: (s) => console.log(`Step ${s.version} done: ${s.name}`) });
console.log(from === to ? `Database already up to date (step ${to}).` : `Database updated: step ${from} → step ${to}.`);
const [{ n }] = await sql.query('SELECT count(*)::int AS n FROM users');
console.log(`Database ready. Accounts: ${n}.`);
// old limit counters (more than two days old) are not needed any more
await sql.query(USAGE_CLEANUP_SQL, [new Date().toISOString().slice(0, 10)]);

if (trim) {
  const rows = await sql.query(TRIM_OLD_TEXTS_SQL, [days]);
  console.log(`Trimmed the question/answer texts of ${rows.length} answer(s) older than ${days} days.`);
}
