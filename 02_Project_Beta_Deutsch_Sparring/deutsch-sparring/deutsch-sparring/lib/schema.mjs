// The database tables. Each statement is safe to run again ("IF NOT EXISTS"), so this is the
// whole migration: the app runs it on first use, or run `node scripts/db-migrate.mjs`.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    username text NOT NULL,
    password_hash text NOT NULL,
    salt text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    settings jsonb NOT NULL DEFAULT '{}'::jsonb
  )`,
  // "Anna" and "anna" are the same account
  'CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))',
];

// Vercel's Neon integration sets DATABASE_URL and POSTGRES_URL; either works.
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}
