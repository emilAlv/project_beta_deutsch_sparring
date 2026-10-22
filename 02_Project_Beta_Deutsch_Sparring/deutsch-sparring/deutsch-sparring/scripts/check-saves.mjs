// Checks review R3 "saves that cannot be half-done": goals/milestones, the browser import, the answer + score save
// and the numbered migrations, using a FAKE database connection that can fail on purpose. A transaction in the fake
// is all-or-nothing, like in Postgres. (The real SQL text is tested against a real Postgres by hand – see README.)
//   node scripts/check-saves.mjs
process.removeAllListeners('warning');
import { register } from 'node:module';

// lib/*.js import each other without ".js" – teach plain node to cope (Next.js does this by itself)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (s.startsWith('.')) { try { return await next(s + '.js', c); } catch {} } throw e; }
}`));

process.env.WORT_CHECK = '1';
process.env.DATABASE_URL = 'postgres://fake.invalid/none'; // never contacted: the fake below is used instead
delete process.env.POSTGRES_URL;

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

// ---- the fake database ----
const U = '11111111-1111-1111-1111-111111111111';
let state;
let failOn = null; // (text) => boolean: throw on this statement
let handler = () => [];
const log = [];
function reset() {
  state = { goals: new Map(), milestones: [], sessions: [], scores: new Map(), imported: false, version: 0, answers: [] };
  failOn = null;
}
function run(text, params = []) {
  log.push(text);
  if (failOn?.(text)) throw new Error('boom (test)');
  return handler(text, params);
}
const fake = {
  query: async (text, params) => run(text, params),
  transaction: async (fn) => {
    const snapshot = structuredClone({ ...state, goals: [...state.goals], scores: [...state.scores] });
    const t = { query: (text, params) => ({ text, params }) };
    const list = typeof fn === 'function' ? fn(t) : fn;
    try {
      const out = [];
      for (const q of list) out.push(run(q.text, q.params));
      return out;
    } catch (e) {
      state = { ...snapshot, goals: new Map(snapshot.goals), scores: new Map(snapshot.scores) }; // roll back
      throw e;
    }
  },
};
globalThis.__wortTestSql = fake;

const { migrate, MIGRATIONS, LATEST_VERSION } = await import('../lib/schema.mjs');

// ---- migrations ----
{
  reset();
  const seen = [];
  handler = (text, params) => {
    if (/FROM schema_version/.test(text)) {
      if (!state.hasNotebook) {
        const e = new Error('relation "schema_version" does not exist');
        e.code = '42P01';
        throw e;
      }
      return [{ v: state.version }];
    }
    if (/^INSERT INTO schema_version/.test(text)) { state.hasNotebook = true; state.version = Math.max(state.version, params[0]); }
    seen.push(text.slice(0, 30));
    return [];
  };
  const r = await migrate(fake);
  check('fresh database: all steps run and the version is recorded', r.from === 0 && r.to === LATEST_VERSION && state.version === LATEST_VERSION);
  log.length = 0;
  const r2 = await migrate(fake);
  check('database up to date: exactly ONE query (the version check), nothing else', log.length === 1 && r2.from === r2.to, `${log.length} queries`);
  state.version = 2;
  const ran = [];
  await migrate(fake, { onStep: (s) => ran.push(s.version) });
  check('database at step 2: only the later steps run', ran.join() === MIGRATIONS.filter((m) => m.version > 2).map((m) => m.version).join());
  check('step numbers are 1,2,3… without gaps', MIGRATIONS.every((m, i) => m.version === i + 1));
  check('every statement is safe to run again (IF NOT EXISTS / backfill only fills empty)', MIGRATIONS.flatMap((m) => m.statements)
    .every((s) => /IF NOT EXISTS/.test(s) || /^UPDATE answers/.test(s) || /^UPDATE word_scores SET a = v.* WHERE a IS NULL AND v IS NOT NULL$/.test(s)));
  // a step that fails leaves the version where it was (it ran in one transaction)
  reset();
  state.hasNotebook = true;
  failOn = (text) => /ADD COLUMN IF NOT EXISTS hinted/.test(text);
  let threw = false;
  try { await migrate(fake); } catch { threw = true; }
  check('a failing step throws and its version is NOT recorded', threw && state.version < 2 && state.version === 1 ? true : threw && state.version <= 1);
}

// ---- goals: milestones survive a failed save ----
const { goalsStore } = await import('../lib/goals-store.js');
{
  reset();
  state.version = LATEST_VERSION; // ensureSchema → one version query
  state.hasNotebook = true;
  state.goals.set('g1', { id: 'g1' });
  state.milestones = [{ goal: 'g1', id: 'm1' }, { goal: 'g1', id: 'm2' }];
  handler = (text, params) => {
    if (/FROM schema_version/.test(text)) return [{ v: state.version }];
    if (/^INSERT INTO goals/.test(text)) { state.goals.set(params[0], { id: params[0] }); return [{ id: params[0] }]; }
    if (/^DELETE FROM milestones/.test(text)) { state.milestones = state.milestones.filter((m) => m.goal !== params[1]); return []; }
    if (/^INSERT INTO milestones/.test(text)) { for (let i = 0; i < (params.length - 2) / 5; i += 1) state.milestones.push({ goal: params[1], id: params[2 + i * 5] }); return []; }
    return [];
  };
  const oldGoal = { id: 'g1', type: 'x', level: 'A1', title: 't', startDate: '2026-01-01', endDate: '2026-02-01', scope: {},
    milestones: [{ id: 'n1', date: '2026-01-10', title: 'a', target: 50, status: 'open' }, { id: 'n2', date: '2026-01-20', title: 'b', target: 80, status: 'open' }] };
  failOn = (text) => /^INSERT INTO milestones/.test(text);
  let threw = false;
  try { await goalsStore().save(U, oldGoal); } catch { threw = true; }
  check('failing milestone INSERT: save throws', threw);
  check('failing milestone INSERT: the old milestones are still there (transaction rolled back)', state.milestones.length === 2 && state.milestones[0].id === 'm1');
  failOn = null;
  const ok = await goalsStore().save(U, oldGoal);
  check('retry works: new milestones replace the old ones', ok === true && state.milestones.map((m) => m.id).join() === 'n1,n2');
}

// ---- coach chat: replace is one transaction ----
const { coachStore } = await import('../lib/coach-store.js');
{
  reset();
  state.version = LATEST_VERSION; state.hasNotebook = true;
  state.chat = ['old1', 'old2'];
  handler = (text, params) => {
    if (/FROM schema_version/.test(text)) return [{ v: state.version }];
    if (/^INSERT INTO coach_messages/.test(text)) state.chat = [...state.chat, 'new'];
    if (/^DELETE FROM coach_messages/.test(text)) state.chat = state.chat.filter((x) => x === 'new');
    return [];
  };
  failOn = (text) => /^DELETE FROM coach_messages/.test(text);
  let threw = false;
  try { await coachStore().replace(U, [{ id: 'a', role: 'user', text: 'hi', at: 1 }]); } catch { threw = true; }
  check('coach chat: failing clean-up rolls the whole replace back', threw && state.chat.join() === 'old1,old2');
}

// ---- import from the browser ----
const { progress, cleanHistory, cleanScores, SAVE_ANSWER_AND_SCORE: SAVE_SQL } = await import('../lib/progress.js');
{
  reset();
  state.version = LATEST_VERSION; state.hasNotebook = true;
  handler = (text, params) => {
    if (/FROM schema_version/.test(text)) return [{ v: state.version }];
    if (/EXISTS \(SELECT 1 FROM sessions/.test(text)) return [{ has: state.imported || state.sessions.length > 0 || state.scores.size > 0 }];
    if (/^UPDATE users SET settings/.test(text)) { if (state.imported) return []; state.imported = true; return [{ id: U }]; }
    if (/^INSERT INTO sessions/.test(text)) { state.sessions.push(params[0]); return []; }
    if (/^INSERT INTO word_scores/.test(text)) { state.scores.set('x', 1); state.importSql = { text, params }; if (process.env.SHOW_SQL) console.log(text); return []; }
    return [];
  };
  const history = { sessions: [{ id: 's1', settings: {}, total: 3, entry: { updatedAt: 1000, answered: 2, skipped: 0, done: 3 } }], streak: { count: 2, lastDay: '2026-10-20' } };
  const scores = { w: { v: { s: 3, k: 1, due: null }, a: { s: 3, k: 1, due: null }, p: { s: 1, k: 0, due: 7 }, last: 5 } };
  failOn = (text) => /^INSERT INTO word_scores/.test(text); // fails halfway: after the mark and the sessions
  let threw = false;
  try { await progress().importData(U, { history, scores }); } catch { threw = true; }
  check('import fails halfway: it throws', threw);
  check('import fails halfway: hasData() is still false (nothing marked, nothing half-saved)', (await progress().hasData(U)) === false && state.sessions.length === 0 && !state.imported);
  failOn = null;
  const done = await progress().importData(U, { history, scores });
  check('retry after the failure imports everything', done === true && state.imported && state.sessions.length === 1 && state.scores.size === 1);
  check('import writes v, g, a, p of a word in one row: 15 values for 15 columns', state.importSql?.params.length === 15 && (state.importSql.text.match(/\$\d+/g) || []).length === 15 && state.importSql.params[8] === 3 && state.importSql.params[11] === 1, JSON.stringify(state.importSql?.params));
  check('a second import is refused (data exists)', (await progress().importData(U, { history, scores })) === false);
  void cleanHistory; void cleanScores;
}

// ---- one answer + its word score ----
{
  reset();
  state.version = LATEST_VERSION; state.hasNotebook = true;
  const a = { sessionId: 's1', n: 1, task: 'vocab', wordId: null, question: 'q', studentAnswer: 'a', corrected: '', rule: '', errorType: null, correct: true, skipped: false, hinted: false, difficulty: null, topicId: null };
  let wordRow = null;
  let staleOnce = 0;
  let existing = false;
  let lastParams = null;
  const stmts = [];
  handler = (text, params) => {
    stmts.push(text);
    if (/^WITH ins AS/.test(text)) lastParams = params;
    if (/FROM schema_version/.test(text)) return [{ v: state.version }];
    if (/FROM word_scores w WHERE user_id/.test(text)) return wordRow ? [{ ...wordRow, ver: JSON.stringify(wordRow) }] : [];
    if (/^WITH ins AS/.test(text)) {
      if (staleOnce > 0) { staleOnce -= 1; return [{ inserted: 0 }]; }
      return [{ inserted: existing ? 0 : 1 }];
    }
    if (/^SELECT 1 FROM answers/.test(text)) return existing ? [{ one: 1 }] : [];
    return [];
  };
  const { getWord } = await import('../lib/words.js');
  void getWord;
  const r1 = await progress().addAnswer(U, a, { kind: 'vocab', correct: true });
  check('answer without a word: saved, one statement for answer (no score)', r1.saved === true && r1.rec === null);
  staleOnce = 1;
  const r2 = await progress().addAnswer(U, { ...a, n: 2 }, { kind: 'vocab', correct: true });
  check('score row changed meanwhile (nothing inserted, answer not there): tried again, then saved', r2.saved === true && stmts.filter((s) => /^WITH ins AS/.test(s)).length === 3);
  const withWord = await progress().addAnswer(U, { ...a, n: 5, wordId: 'abbiegen' }, { task: 'vocab', correct: true });
  const maxN = Math.max(...[...SAVE_SQL.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  check('word answer: every $n placeholder has a value (right count, word id in $17, new score in $18+)', withWord.saved && lastParams.length === maxN && lastParams[16] === 'abbiegen' && lastParams[17] === withWord.rec.v.s, `${lastParams?.length} vs ${maxN}`);
  existing = true;
  const r3 = await progress().addAnswer(U, { ...a, n: 2 }, { kind: 'vocab', correct: true });
  check('same answer sent twice: saved:false, no second try', r3.saved === false);
  const sql = (await import('../lib/progress.js')).SAVE_ANSWER_AND_SCORE;
  check('answer + score is ONE statement with a guard on the score row', /WITH ins AS/.test(sql) && /IS NOT DISTINCT FROM \$16/.test(sql) && /EXISTS \(SELECT 1 FROM ins\)/.test(sql));
  check('only $-placeholders in the statement (no pasted values)', !/'[^']*\$\{/.test(sql));
}

// ---- word scores per part (Meaning v / Article a / Plural p / Sentence g): cleaning, row, saved parameters ----
{
  const { cleanAnswer, scoreInputOf } = await import('../lib/progress.js');
  const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const cs = cleanScores({ 'die lampe': { v: { s: 7, k: 1, due: 5 }, a: { s: 4, k: 0, due: 6 }, p: { s: 2, k: 0, due: 7 }, last: 9 }, nope: { v: { s: 1 } } });
  eq('cleanScores keeps v, a, p and drops unknown words', cs, { 'die lampe': { v: { s: 7, k: 1, due: 5 }, a: { s: 4, k: 0, due: 6 }, p: { s: 2, k: 0, due: 7 }, last: 9 } });
  check('cleanScores accepts a record with only an Article score', Object.keys(cleanScores({ 'die lampe': { a: { s: 3 } } })).length === 1);
  const a = cleanAnswer({ sessionId: 's1', n: 1, wordId: 'die lampe', task: 'flashcard', difficulty: 'hard', direction: 'en-de', checks: ['article', 'junk'], parts: { meaning: true, article: 'yes', plural: false } });
  eq('cleanAnswer: checks always hold meaning and only known parts; parts are true / false / null', [a.checks, a.parts, a.direction], [['meaning', 'article'], { meaning: true, article: null, plural: false }, 'en-de']);
  eq('the server works out the tested parts itself (Hard noun, English → German)', scoreInputOf(a).checks, ['meaning', 'article', 'plural']);
  eq('…and from the word, not from the browser (Easy)', scoreInputOf({ ...a, difficulty: 'easy' }).checks, ['meaning']);
  eq('…German → English on Hard: no plural', scoreInputOf({ ...a, direction: 'de-en' }).checks, ['meaning', 'article']);
  eq('…a sentence task: meaning + article', scoreInputOf({ ...a, task: 'grammar' }).checks, ['meaning', 'article']);
  check('no difficulty from the browser: its own list is used', scoreInputOf({ ...a, difficulty: null, checks: ['meaning'] }).checks.join() === 'meaning');

  // a saved answer: the row read from the database (with a and p) is scored, and the new row is written with all 13 score values
  reset();
  state.version = LATEST_VERSION; state.hasNotebook = true;
  const T = (n) => new Date(n).toISOString();
  const wordRow = { user_id: U, word_id: 'die lampe', v: 5, v_streak: 2, v_due: T(1e12), g: null, g_streak: null, g_due: null, a: 5, a_streak: 2, a_due: T(1e12), p: null, p_streak: null, p_due: null, last_practised: T(1e12) };
  let params = null;
  handler = (text, ps) => {
    if (/FROM schema_version/.test(text)) return [{ v: state.version }];
    if (/FROM word_scores w WHERE user_id/.test(text)) return [{ ...wordRow, ver: JSON.stringify(wordRow) }];
    if (/^WITH ins AS/.test(text)) { params = ps; return [{ inserted: 1 }]; }
    return [];
  };
  const out = await progress().addAnswer(U, { ...a, n: 9, hinted: false, correct: false, errorType: 'Wortschatz', rule: 'Plural', skipped: false, hasG: true, studentAnswer: 'die Lampe', corrected: 'die Lampe, die Lampen', question: 'the lamp', topicId: null },
    scoreInputOf({ ...a, correct: false, errorType: 'Wortschatz', rule: 'Plural', parts: null, hinted: false, skipped: false }));
  check('Hard, wrong plural only, row from the database: m 5 → 7, a 5 → 7, p new → 1', out.saved && out.rec.v.s === 7 && out.rec.a.s === 7 && out.rec.p.s === 1, JSON.stringify(out.rec));
  check('the statement gets 30 values; v at $18, g at $21, a at $24, p at $27', params?.length === 30 && params[17] === 7 && params[20] === null && params[23] === 7 && params[26] === 1, JSON.stringify(params?.slice(16)));
  check('the guard text ($16) now contains the a and p columns of the row it read', typeof params?.[15] === 'string' && params[15].includes('"a":5'));
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll save checks passed.');
process.exit(failed ? 1 : 0);
