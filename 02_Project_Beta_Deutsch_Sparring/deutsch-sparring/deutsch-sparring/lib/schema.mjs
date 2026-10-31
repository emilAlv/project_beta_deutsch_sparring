import { ruleTopicPairs } from './rules.js';

// ---------------------------------------------------------------------------------------------
// The database, as a numbered list of steps (review R3). Think of it as a build-log: step 1 made the
// first tables, step 2 added columns to "answers", and so on. The table `schema_version` remembers
// the number of the last step that was done, so the app only asks ONE question at start-up
// ("which step is the database at?") instead of sending every statement again.
//
// Rules for a step:
//   - never change or delete an old step; add a new one at the END of MIGRATIONS (next number);
//   - write every statement so it is safe to run again (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS …);
//   - all statements of a step run in ONE transaction together with the note "step N is done",
//     so a step is either completely done or not at all.
// How to add a column: see README.md ("How to add a column").
// ---------------------------------------------------------------------------------------------

// the note-book itself; it is created inside every step (harmless if it exists), so the very first
// deploy on an empty database works, and so does the live database that has no note-book yet
const VERSION_TABLE = `CREATE TABLE IF NOT EXISTS schema_version (
    version int PRIMARY KEY,
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
const RECORD_STEP = 'INSERT INTO schema_version (version, name) VALUES ($1::int, $2) ON CONFLICT (version) DO NOTHING';

export const MIGRATIONS = [
  {
    version: 1,
    name: 'first tables: users, sessions, answers, word scores, goals, milestones, coach messages',
    statements: [
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
    ],
  },
  {
    version: 2,
    name: 'answers: hinted, difficulty, topic (with backfill of old answers)',
    statements: [
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
    ],
  },
  {
    version: 3,
    name: 'goals: plan',
    statements: [
  // Review R10 (redesign §4.1, D7): the whole plan of a goal (parts and milestones) as one value, saved with one UPSERT.
  // Empty for old-style goals (their milestones stay in the milestones table until they are converted, R12).
  // Safe to run again on the live database.
  'ALTER TABLE goals ADD COLUMN IF NOT EXISTS plan jsonb',
    ],
  },
  {
    version: 4,
    name: 'usage: shared counters for the limits',
    statements: [
  // Review R1: the daily AI limit, class-code / log-in / sign-up tries and the write caps, counted in the database so
  // every server copy on Vercel sees the same numbers. One row per day and counter; the key holds no secret and no
  // raw network address (lib/guard.js scrambles it). Old days are deleted now and then (lib/guard.js CLEANUP_SQL).
  `CREATE TABLE IF NOT EXISTS usage (
    day date NOT NULL,
    key text NOT NULL,
    n int NOT NULL DEFAULT 0,
    PRIMARY KEY (day, key)
  )`,
    ],
  },
  {
    version: 5,
    name: 'word_scores: article and plural scores (with backfill)',
    statements: [
  // Word scores per part: v = Meaning (the old column, unchanged), a = Article (nouns), p = Plural (nouns).
  // Same three columns as v: the score, the streak (right answers in a row) and when it is due again.
  // Safe to run again on the live database.
  'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS a smallint',
  'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS a_streak int',
  'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS a_due timestamptz',
  'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS p smallint',
  'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS p_streak int',
  'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS p_due timestamptz',
  // The old v meant "article + word", so it becomes the starting Article score too. Only rows that have no Article
  // score yet, so running it again changes nothing (and never touches a score the student has earned since). Plural starts empty.
  'UPDATE word_scores SET a = v, a_streak = v_streak, a_due = v_due WHERE a IS NULL AND v IS NOT NULL',
    ],
  },
  {
    version: 6,
    name: 'word_scores: the gap of a 10 (v_iv, a_iv, p_iv, g_iv) and when Meaning last rose (v_up)',
    statements: [
      // iv = days until a 10 comes back again (21, doubling to 180); empty = not a 10 / not known yet (counts as 21).
      // v_up = when the Meaning score last rose (it can rise once per calendar day). Safe to run again.
      'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS v_iv smallint',
      'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS a_iv smallint',
      'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS p_iv smallint',
      'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS g_iv smallint',
      'ALTER TABLE word_scores ADD COLUMN IF NOT EXISTS v_up timestamptz',
    ],
  },
  // next step: { version: 7, name: '…', statements: ['ALTER TABLE … ADD COLUMN IF NOT EXISTS …'] },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

// every statement of every step in order (what the checks and scripts read; safe to run again)
export const SCHEMA = [VERSION_TABLE, ...MIGRATIONS.flatMap((m) => m.statements)];

// Which step is the database at? 0 = none yet (fresh database, or the live one from before R3).
export async function currentVersion(sql) {
  try {
    const rows = await sql.query('SELECT COALESCE(max(version), 0)::int AS v FROM schema_version');
    return Number(rows[0]?.v) || 0;
  } catch (e) {
    if (e?.code === '42P01' || /schema_version.*does not exist/i.test(String(e?.message))) return 0; // no note-book yet
    throw e;
  }
}

// Run the steps the database has not had yet, each in one transaction; → { from, to }.
// `sql` is a neon() function (or anything with .query() and .transaction()).
export async function migrate(sql, { onStep } = {}) {
  const from = await currentVersion(sql);
  let to = from;
  for (const step of MIGRATIONS.filter((m) => m.version > from)) {
    await sql.transaction((t) => [
      t.query(VERSION_TABLE),
      ...step.statements.map((statement) => t.query(statement)),
      t.query(RECORD_STEP, [step.version, step.name]),
    ]);
    to = step.version;
    onStep?.(step);
  }
  return { from, to };
}

// Done by hand only (`node scripts/db-migrate.mjs --trim-old-texts`), never by the app: empties the question and
// answer TEXTS of answers older than $1 days. Numbers, the rule, topic, correct/skipped flags and created_at stay.
// Safe to run again (rows that are already empty are not touched). Returns one row per changed answer.
export const TRIM_OLD_TEXTS_SQL = `UPDATE answers SET question = NULL, student_answer = NULL, corrected = NULL
  WHERE created_at < now() - ($1::int * interval '1 day')
    AND (question IS NOT NULL OR student_answer IS NOT NULL OR corrected IS NOT NULL)
  RETURNING id`;
export const TRIM_OLD_TEXTS_DAYS = 90;

// The limit counters (table usage, step 4) are only needed for today and the current 15-minute / hour windows:
// rows more than two days older than $1 (today, UTC) are deleted – now and then by lib/guard.js, and by
// scripts/db-migrate.mjs. Safe to run again.
export const USAGE_CLEANUP_SQL = 'DELETE FROM usage WHERE day < $1::date - 2';

// Vercel's Neon integration sets DATABASE_URL and POSTGRES_URL; either works.
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}
