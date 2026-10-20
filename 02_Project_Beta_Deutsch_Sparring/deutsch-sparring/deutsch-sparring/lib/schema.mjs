import { ruleTopicPairs } from './rules.js';

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
  // Review R8 / decision D7: was a hint used (or "Leicht"), and the difficulty ('easy' | 'medium' | 'hard').
  // May be empty on older answers. Safe to run again on the live database.
  'ALTER TABLE answers ADD COLUMN IF NOT EXISTS hinted boolean',
  'ALTER TABLE answers ADD COLUMN IF NOT EXISTS difficulty text',
  // Review R9: the grammar topic of every answer (a curriculum topic or a situation lesson), for the plan's progress.
  'ALTER TABLE answers ADD COLUMN IF NOT EXISTS topic_id text',
  'CREATE INDEX IF NOT EXISTS answers_user_topic_idx ON answers (user_id, topic_id, created_at DESC)',
  // Fill in the topic of OLD answers; only rows that have none yet, so running it again changes nothing. Nothing is deleted.
  //  1. answers of a grammar session → the topic of that session
  `UPDATE answers a SET topic_id = s.settings->>'topicId' FROM sessions s
     WHERE a.topic_id IS NULL AND s.user_id = a.user_id AND s.id = a.session_id
       AND s.settings->>'kind' = 'grammar' AND COALESCE(s.settings->>'topicId', '') NOT IN ('', 'free')`,
  //  2. the rest with a grammar rule → the lowest-level topic that lists that rule (same list as topicForRule)
  `UPDATE answers a SET topic_id = m.topic_id FROM (VALUES ${ruleTopicPairs().map(([r, t]) => `('${r.replace(/'/g, "''")}', '${t}')`).join(', ')}) AS m(rule_key, topic_id)
     WHERE a.topic_id IS NULL AND lower(regexp_replace(btrim(a.rule), '\\s+', ' ', 'g')) = m.rule_key`,
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
  // Review R10 (redesign §4.1, D7): the whole plan of a goal (parts and milestones) as one value, saved with one UPSERT.
  // Empty for old-style goals (their milestones stay in the milestones table until they are converted, R12).
  // Safe to run again on the live database.
  'ALTER TABLE goals ADD COLUMN IF NOT EXISTS plan jsonb',
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
