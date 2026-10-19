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
  // Progress (Task 8). The id of a session comes from the browser, so it is only unique per student.
  `CREATE TABLE IF NOT EXISTS sessions (
    id text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    total int NOT NULL DEFAULT 0,
    score jsonb,
    PRIMARY KEY (user_id, id)
  )`,
  'CREATE INDEX IF NOT EXISTS sessions_user_started_idx ON sessions (user_id, started_at DESC)',
  `CREATE TABLE IF NOT EXISTS answers (
    id bigserial PRIMARY KEY,
    session_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    n int NOT NULL,
    task text,
    word_id text,
    question text,
    student_answer text,
    corrected text,
    rule text,
    error_type text,
    correct boolean NOT NULL DEFAULT false,
    skipped boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // the same answer sent twice (a retry) is saved once
  'CREATE UNIQUE INDEX IF NOT EXISTS answers_session_n_idx ON answers (user_id, session_id, n)',
  'CREATE INDEX IF NOT EXISTS answers_user_created_idx ON answers (user_id, created_at)',
  `CREATE TABLE IF NOT EXISTS word_scores (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id text NOT NULL,
    v smallint,
    v_streak int,
    v_due timestamptz,
    g smallint,
    g_streak int,
    g_due timestamptz,
    last_practised timestamptz,
    PRIMARY KEY (user_id, word_id)
  )`,
  // Goals and their milestones (Task 9). The id of a goal comes from the browser, so it is only unique per student.
  `CREATE TABLE IF NOT EXISTS goals (
    id text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    level text NOT NULL,
    title text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS milestones (
    id text NOT NULL,
    goal_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    due_date date NOT NULL,
    title text NOT NULL,
    target smallint NOT NULL,
    status text NOT NULL DEFAULT 'open',
    PRIMARY KEY (user_id, goal_id, id),
    FOREIGN KEY (user_id, goal_id) REFERENCES goals (user_id, id) ON DELETE CASCADE
  )`,
  // The coach's chat on the Home page (Task 10): the last 30 messages of each student. "data" holds the
  // suggested session / plan changes / quick replies of a coach message. The id comes from the browser.
  `CREATE TABLE IF NOT EXISTS coach_messages (
    id text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL,
    text text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    pos int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
  )`,
];

// Vercel's Neon integration sets DATABASE_URL and POSTGRES_URL; either works.
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}
