// A logged-in student's progress, kept on the server (Task 8): sessions, answers, word scores.
// Server only. The database (Neon) – or, with AUTH_MEMORY=1 for local tests, a list in memory.
//
// The SERVER is the authority for word scores: the browser only says "this answer, about this
// word"; applyAnswer (lib/scores.js) does the arithmetic here. Everything coming from the browser
// is cleaned and size-limited first (the clean* functions below).
import { databaseUrl } from './schema.mjs';
import { sql, ensureSchema } from './db';
import { applyAnswer } from './scores';
import { getWord } from './words';
import { cleanRule, topicForRule } from './rules';
import { isCurriculumId } from './curriculum';
import { listLessons } from './content';
import { grammarStatsFromAnswers, STATS_WINDOW } from './grammar-stats';
import { aggregateAnswers, cleanRuleRows, WINDOW_DAYS } from './home-stats';

const MAX_SCORE_ROWS = 2000;
const DAY = 86_400_000;

// ---------- cleaning what the browser sends ----------
const text = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
const int = (x, lo, hi, dflt = 0) => {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

export const cleanId = (x) => {
  const id = typeof x === 'string' ? x : '';
  return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : null;
};

// the settings of a session: flat, short values only (strings, numbers, true/false, lists of short strings)
export function cleanSettings(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 30)) {
    if (!/^[A-Za-z0-9_]{1,30}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 160);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean' || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).filter((x) => typeof x === 'string').map((x) => x.slice(0, 60));
  }
  return out;
}

// the session card shown in the history (same fields as the browser's own history entries)
export function cleanEntry(raw, fallbackTime = Date.now()) {
  const e = isObj(raw) ? raw : {};
  return {
    topicId: text(e.topicId, 120) || null,
    topicName: text(e.topicName, 160),
    level: text(e.level, 4) || undefined,
    difficulty: text(e.difficulty, 10) || undefined,
    done: int(e.done, 0, 99),
    answered: int(e.answered, 0, 99),
    correct: int(e.correct, 0, 99),
    skipped: int(e.skipped, 0, 99),
    endedEarly: e.endedEarly === true,
    updatedAt: int(e.updatedAt, 0, 8.64e15, fallbackTime),
    questions: (Array.isArray(e.questions) ? e.questions : [])
      .map((question) => text(question, 500))
      .filter(Boolean)
      .slice(-50),
    wordIds: (Array.isArray(e.wordIds) ? e.wordIds : [])
      .map((id) => text(id, 120))
      .filter(Boolean)
      .slice(0, 60),
    mistakes: (Array.isArray(e.mistakes) ? e.mistakes : []).slice(0, 5).map((m) => ({
      studentAnswer: text(m?.studentAnswer, 200),
      corrected: text(m?.corrected, 200),
      rule: text(m?.rule, 80),
    })),
  };
}

// → { id, settings, total, entry, finished } or null
export function cleanSession(raw) {
  const id = cleanId(raw?.id);
  if (!id) return null;
  return {
    id,
    settings: cleanSettings(raw.settings),
    total: int(raw.total, 0, 99),
    entry: raw.entry == null ? null : cleanEntry(raw.entry),
    finished: raw.finished === true,
  };
}

// → { sessionId, n, task, wordId, question, studentAnswer, corrected, rule, errorType, correct, skipped, hinted, difficulty, topicId, hasG } or null
export function cleanAnswer(raw) {
  const sessionId = cleanId(raw?.sessionId);
  const n = int(raw?.n, 0, 99);
  if (!sessionId || n < 1) return null;
  const wordId = text(raw.wordId, 120);
  return {
    sessionId,
    n,
    task: ['flashcard', 'grammar'].includes(raw.task) ? raw.task : null,
    wordId: wordId && getWord(wordId) ? wordId : null, // only words that exist
    hasG: raw.hasG !== false,
    question: text(raw.question, 400),
    studentAnswer: text(raw.studentAnswer, 600),
    corrected: text(raw.corrected, 600),
    rule: cleanRule(text(raw.rule, 200)) || '', // a word is no grammar rule (lib/rules.js); old browsers may still send one
    errorType: text(raw.errorType, 40) || null,
    correct: raw.correct === true,
    skipped: raw.skipped === true,
    hinted: raw.hinted === true,
    difficulty: ['easy', 'medium', 'hard'].includes(raw.difficulty) ? raw.difficulty : null,
    topicId: topicOf(raw, cleanRule(text(raw.rule, 200))),
  };
}

// the grammar topic of an answer (lib/rules.js topicForRule); a lesson id from the browser must be a real lesson
function topicOf(raw, rule) {
  const kind = raw.kind === 'grammar' ? 'grammar' : 'vocab';
  const id = text(raw.topicId, 80);
  const t = topicForRule(rule, id, kind);
  if (t && t === id && !isCurriculumId(t) && !listLessons().some((l) => l.id === t)) return topicForRule(rule);
  return t;
}

// word scores: only known word ids, only numbers → { [wordId]: { v:{s,k,due}, g:{s,k,due}, last } }
export function cleanScores(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  const num = (x) => (x != null && Number.isFinite(Number(x)) ? Number(x) : null);
  for (const id of Object.keys(raw).slice(0, MAX_SCORE_ROWS)) {
    if (!getWord(id) || !isObj(raw[id])) continue;
    const rec = {};
    for (const kind of ['v', 'g']) {
      const x = raw[id][kind];
      if (x && num(x.s) != null) rec[kind] = { s: num(x.s), k: num(x.k) ?? 0, due: num(x.due) };
    }
    if (!rec.v && !rec.g) continue;
    if (num(raw[id].last) != null) rec.last = num(raw[id].last);
    out[id] = rec;
  }
  return out;
}

// the browser's old history (last sessions + streak) → { sessions: [{ id, settings, total, entry, finished }], streak }
export function cleanHistory(raw) {
  const sessions = (Array.isArray(raw?.sessions) ? raw.sessions : []).slice(0, 5)
    .map((s) => {
      const c = cleanSession({ ...s, entry: s, total: s?.total, finished: true });
      return c && c.entry.answered + c.entry.skipped > 0 ? { ...c, total: c.total || c.entry.done } : null;
    })
    .filter(Boolean);
  const lastDay = typeof raw?.streak?.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.streak.lastDay) ? raw.streak.lastDay : null;
  return { sessions, streak: { count: lastDay ? int(raw.streak.count, 0, 3650) : 0, lastDay } };
}

// ---------- streak (days with at least one answer, in the student's own time zone) ----------
// tz = minutes as in Date.getTimezoneOffset() (e.g. -120 for summer time in Germany)
const dayNum = (ms, tz) => Math.floor((ms - tz * 60_000) / DAY);
const dayKey = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const keyNum = (key) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY);

// → { count, lastDay } like the browser's streak. base = the streak imported from the browser (or null)
export function computeStreak(times, base, tz = 0) {
  const days = new Set(times.map((t) => dayNum(t, tz)));
  if (base?.lastDay && base.count > 0) {
    const end = keyNum(base.lastDay);
    for (let i = 0; i < base.count; i += 1) days.add(end - i);
  }
  if (!days.size) return { count: 0, lastDay: null };
  const last = Math.max(...days);
  let count = 0;
  while (days.has(last - count)) count += 1;
  return { count, lastDay: dayKey(last) };
}

// ---------- word records <-> database rows ----------
const ms = (x) => (x == null ? null : new Date(x).getTime());
const iso = (x) => (x == null || !Number.isFinite(x) ? null : new Date(x).toISOString());

function rowToRec(r) {
  const rec = {};
  if (r.v != null) rec.v = { s: Number(r.v), k: Number(r.v_streak) || 0, due: ms(r.v_due) };
  if (r.g != null) rec.g = { s: Number(r.g), k: Number(r.g_streak) || 0, due: ms(r.g_due) };
  if (r.last_practised) rec.last = ms(r.last_practised);
  return rec;
}

const SCORE_COLUMNS = 'user_id, word_id, v, v_streak, v_due, g, g_streak, g_due, last_practised';
const scoreParams = (userId, wordId, rec) => [
  userId, wordId,
  rec.v?.s ?? null, rec.v?.k ?? null, iso(rec.v?.due),
  rec.g?.s ?? null, rec.g?.k ?? null, iso(rec.g?.due),
  iso(rec.last),
];
const UPSERT_SCORE = `INSERT INTO word_scores (${SCORE_COLUMNS})
  VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8::timestamptz, $9::timestamptz)
  ON CONFLICT (user_id, word_id) DO UPDATE SET v = EXCLUDED.v, v_streak = EXCLUDED.v_streak, v_due = EXCLUDED.v_due,
    g = EXCLUDED.g, g_streak = EXCLUDED.g_streak, g_due = EXCLUDED.g_due, last_practised = EXCLUDED.last_practised`;

const entryOf = (id, settings, entry) => ({ id, settings: settings || {}, ...(entry || {}) });

// ---------- in memory (AUTH_MEMORY=1) ----------
const mem = (globalThis.__wortMemoryProgress ??= new Map());
const box = (userId) => {
  if (!mem.has(userId)) mem.set(userId, { sessions: new Map(), answers: [], scores: new Map(), base: null, imported: false });
  return mem.get(userId);
};

const memoryStore = {
  async upsertSession(userId, s) {
    const b = box(userId);
    const old = b.sessions.get(s.id);
    b.sessions.set(s.id, {
      id: s.id,
      settings: Object.keys(s.settings).length ? s.settings : old?.settings || {},
      total: s.total || old?.total || 0,
      startedAt: old?.startedAt || Date.now(),
      endedAt: old?.endedAt || (s.finished ? Date.now() : null),
      entry: s.entry || old?.entry || null,
    });
  },
  async addAnswer(userId, a, scoreInput) {
    const b = box(userId);
    if (b.answers.some((x) => x.sessionId === a.sessionId && x.n === a.n)) return { saved: false, rec: null };
    if (!b.sessions.has(a.sessionId)) b.sessions.set(a.sessionId, { id: a.sessionId, settings: {}, total: 0, startedAt: Date.now(), endedAt: null, entry: null });
    b.answers.push({ ...a, createdAt: Date.now() });
    let rec = null;
    if (a.wordId) {
      rec = applyAnswer(b.scores.get(a.wordId), scoreInput, Date.now());
      b.scores.set(a.wordId, rec);
    }
    return { saved: true, rec };
  },
  async history(userId, tz) {
    const b = box(userId);
    const sessions = [...b.sessions.values()].filter((s) => s.entry && s.entry.answered + s.entry.skipped > 0)
      .sort((x, y) => y.startedAt - x.startedAt).slice(0, 5)
      .map((s) => entryOf(s.id, s.settings, { ...s.entry, total: s.total }));
    return { sessions, streak: computeStreak(b.answers.map((x) => x.createdAt), b.base, tz) };
  },
  async scores(userId, ids) {
    const b = box(userId);
    const out = {};
    for (const [id, rec] of b.scores) if (!ids || ids.includes(id)) out[id] = rec;
    return out;
  },
  async answerStats(userId) {
    const since = Date.now() - WINDOW_DAYS * DAY;
    return aggregateAnswers(box(userId).answers.filter((a) => a.createdAt >= since));
  },
  async grammarStats(userId) {
    return grammarStatsFromAnswers(box(userId).answers.map((a) => ({ ...a, t: a.createdAt })));
  },
  async hasData(userId) {
    const b = box(userId);
    return b.imported || b.sessions.size > 0 || b.scores.size > 0;
  },
  async importData(userId, { history, scores }) {
    if (await this.hasData(userId)) return false;
    const b = box(userId);
    b.imported = true;
    history.sessions.forEach((s, i) => {
      b.sessions.set(s.id, { id: s.id, settings: s.settings, total: s.total, startedAt: s.entry.updatedAt - i, endedAt: s.entry.updatedAt, entry: s.entry });
    });
    if (history.streak.lastDay) b.base = history.streak;
    for (const [id, rec] of Object.entries(scores)) b.scores.set(id, rec);
    return true;
  },
};

// ---------- Postgres (Neon) ----------
const dbStore = {
  async upsertSession(userId, s) {
    await ensureSchema();
    // a new row starts now; an existing row keeps its settings unless new ones come; ended_at is set once
    await sql().query(
      `INSERT INTO sessions (id, user_id, settings, total, score, ended_at)
       VALUES ($1, $2, $3::jsonb, $4::int, $5::jsonb, CASE WHEN $6::boolean THEN now() END)
       ON CONFLICT (user_id, id) DO UPDATE SET
         settings = CASE WHEN $3::jsonb = '{}'::jsonb THEN sessions.settings ELSE $3::jsonb END,
         total = CASE WHEN $4::int = 0 THEN sessions.total ELSE $4::int END,
         score = COALESCE($5::jsonb, sessions.score),
         ended_at = COALESCE(sessions.ended_at, CASE WHEN $6::boolean THEN now() END)`,
      [s.id, userId, JSON.stringify(s.settings), s.total, s.entry ? JSON.stringify(s.entry) : null, s.finished],
    );
  },
  async addAnswer(userId, a, scoreInput) {
    await ensureSchema();
    await sql().query('INSERT INTO sessions (id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [a.sessionId, userId]);
    const inserted = await sql().query(
      `INSERT INTO answers (session_id, user_id, n, task, word_id, question, student_answer, corrected, rule, error_type, correct, skipped, hinted, difficulty, topic_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT DO NOTHING RETURNING id`,
      [a.sessionId, userId, a.n, a.task, a.wordId, a.question, a.studentAnswer, a.corrected, a.rule, a.errorType, a.correct, a.skipped, a.hinted, a.difficulty, a.topicId],
    );
    if (!inserted.length) return { saved: false, rec: null };
    let rec = null;
    if (a.wordId) {
      const rows = await sql().query(`SELECT ${SCORE_COLUMNS} FROM word_scores WHERE user_id = $1 AND word_id = $2`, [userId, a.wordId]);
      rec = applyAnswer(rows[0] ? rowToRec(rows[0]) : undefined, scoreInput, Date.now());
      await sql().query(UPSERT_SCORE, scoreParams(userId, a.wordId, rec));
    }
    return { saved: true, rec };
  },
  async history(userId, tz) {
    await ensureSchema();
    const [rows, hours, users] = await Promise.all([
      sql().query(
        `SELECT id, settings, total, score FROM sessions
         WHERE user_id = $1 AND score IS NOT NULL AND COALESCE((score->>'answered')::int + (score->>'skipped')::int, 0) > 0
         ORDER BY started_at DESC LIMIT 5`,
        [userId],
      ),
      sql().query(
        `SELECT DISTINCT date_trunc('hour', created_at) AS h FROM answers
         WHERE user_id = $1 AND created_at > now() - interval '400 days'`,
        [userId],
      ),
      sql().query('SELECT settings FROM users WHERE id = $1', [userId]),
    ]);
    const base = users[0]?.settings?.importedStreak || null;
    return {
      sessions: rows.map((r) => entryOf(r.id, r.settings, { ...r.score, total: r.total })),
      streak: computeStreak(hours.map((r) => ms(r.h)), base, tz),
    };
  },
  async scores(userId, ids) {
    await ensureSchema();
    const rows = ids
      ? await sql().query(`SELECT ${SCORE_COLUMNS} FROM word_scores WHERE user_id = $1 AND word_id = ANY($2::text[])`, [userId, ids])
      : await sql().query(`SELECT ${SCORE_COLUMNS} FROM word_scores WHERE user_id = $1 LIMIT ${MAX_SCORE_ROWS * 4}`, [userId]);
    return Object.fromEntries(rows.map((r) => [r.word_id, rowToRec(r)]));
  },
  async answerStats(userId) {
    await ensureSchema();
    const window = `user_id = $1 AND created_at > now() - interval '${WINDOW_DAYS} days'`;
    const [tot, rules, words] = await Promise.all([
      sql().query(
        `SELECT count(DISTINCT session_id)::int AS sessions, count(*)::int AS total,
                count(*) FILTER (WHERE correct)::int AS correct, count(*) FILTER (WHERE skipped)::int AS skipped
         FROM answers WHERE ${window}`,
        [userId],
      ),
      sql().query(
        `SELECT rule, count(*)::int AS n, count(*) FILTER (WHERE correct)::int AS ok FROM answers
         WHERE ${window} AND NOT skipped AND COALESCE(rule, '') <> ''
           AND task IS DISTINCT FROM 'flashcard' AND NOT (word_id IS NOT NULL AND error_type IN ('vocab', 'article'))
         GROUP BY rule ORDER BY n DESC LIMIT 400`,
        [userId],
      ),
      sql().query(
        `SELECT word_id AS id, count(*)::int AS n, count(*) FILTER (WHERE correct)::int AS ok FROM answers
         WHERE ${window} AND NOT skipped AND word_id IS NOT NULL GROUP BY word_id ORDER BY n DESC LIMIT 1000`,
        [userId],
      ),
    ]);
    const t = tot[0] || {};
    return { sessions: t.sessions || 0, total: t.total || 0, correct: t.correct || 0, skipped: t.skipped || 0, rules: cleanRuleRows(rules).slice(0, 80), words };
  },
  // the last 40 counted answers per topic (skip = wrong, hinted = 0.5, Leicht left out) → { [topicId]: { n, points, pct, recent } }
  async grammarStats(userId) {
    await ensureSchema();
    const rows = await sql().query(
      `SELECT topic_id, correct, skipped, hinted, extract(epoch FROM created_at) * 1000 AS t FROM (
         SELECT topic_id, correct, skipped, hinted, created_at,
                row_number() OVER (PARTITION BY topic_id ORDER BY created_at DESC, id DESC) AS rn
         FROM answers WHERE user_id = $1 AND topic_id IS NOT NULL AND COALESCE(difficulty, '') <> 'easy'
       ) x WHERE rn <= ${STATS_WINDOW}`,
      [userId],
    );
    return grammarStatsFromAnswers(rows.map((r) => ({ topicId: r.topic_id, correct: r.correct, skipped: r.skipped, hinted: r.hinted, t: Number(r.t) })));
  },
  async hasData(userId) {
    await ensureSchema();
    const rows = await sql().query(
      `SELECT (EXISTS (SELECT 1 FROM sessions WHERE user_id = $1)
            OR EXISTS (SELECT 1 FROM word_scores WHERE user_id = $1)
            OR COALESCE((SELECT settings ? 'imported' FROM users WHERE id = $1), false)) AS has`,
      [userId],
    );
    return Boolean(rows[0]?.has);
  },
  async importData(userId, { history, scores }) {
    if (await this.hasData(userId)) return false;
    // mark first, so two tabs importing at once cannot both win
    const marked = await sql().query(
      `UPDATE users SET settings = settings || $2::jsonb WHERE id = $1 AND NOT (settings ? 'imported') RETURNING id`,
      [userId, JSON.stringify({ imported: true, ...(history.streak.lastDay ? { importedStreak: history.streak } : {}) })],
    );
    if (!marked.length) return false;
    for (const [i, s] of history.sessions.entries()) {
      await sql().query(
        `INSERT INTO sessions (id, user_id, settings, total, score, started_at, ended_at)
         VALUES ($1, $2, $3::jsonb, $4::int, $5::jsonb, $6::timestamptz, $6::timestamptz) ON CONFLICT DO NOTHING`,
        [s.id, userId, JSON.stringify(s.settings), s.total, JSON.stringify(s.entry), new Date(s.entry.updatedAt - i).toISOString()],
      );
    }
    const entries = Object.entries(scores);
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      const params = [];
      const values = chunk.map(([id, rec], j) => {
        params.push(...scoreParams(userId, id, rec));
        const p = j * 9;
        return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}::timestamptz, $${p + 6}, $${p + 7}, $${p + 8}::timestamptz, $${p + 9}::timestamptz)`;
      });
      await sql().query(`INSERT INTO word_scores (${SCORE_COLUMNS}) VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`, params);
    }
    return true;
  },
};

export const progress = () => (databaseUrl() ? dbStore : memoryStore);
