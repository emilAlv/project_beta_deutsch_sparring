import { allTopics } from '../../../lib/topics';
import { generate, coachModelSettings } from '../../../lib/gemini';
import { parseModelJson, salvageMessage } from '../../../lib/reply';
import { checkClassCode, overDailyLimit } from '../../../lib/guard';
import { requireUser } from '../../../lib/auth';
import { fail, reasonCode, replyShape, readJsonBody } from '../../../lib/route-guard';
import { homeData, planContext } from '../../../lib/home-data';
import { goalActions, NOTES } from '../../../lib/coach-goal';
import { todayKey } from '../../../lib/goals';
import { COACH_SCHEMA, buildCoachPrompt, coachContext, GREETING_TURN, pickToday } from '../../../lib/coach-prompt';
import { normalizeCoach, turnsForModel, withPlanNote, startsPlanChanges } from '../../../lib/coach';
import { mockCoach } from '../../../lib/coach-mock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DEADLINE_MS = 55_000; // stay below maxDuration so we can still answer with JSON

const DATA_TIMEOUT_MS = 8_000; // loading the goals and numbers from the database

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'data_timeout' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const MAX_BYTES_ACCOUNT = 30_000; // logged in: only the chat turns come from the browser
const MAX_BYTES_LOCAL = 400_000; // accounts off: plus the browser's goals, word scores and answer log (like /api/stats)
const MAX_TURNS = 10;

export async function POST(req) {
  try {
    return await handle(req);
  } catch (e) {
    console.error('coach route crashed:', e?.message);
    return fail('server', 500, reasonCode(e));
  }
}

async function handle(req) {
  const deadline = Date.now() + DEADLINE_MS;
  // with accounts: only for logged-in students
  const { user, response } = await requireUser(req);
  if (response) return response;

  const { body, response: bad } = await readJsonBody(req, user ? MAX_BYTES_ACCOUNT : MAX_BYTES_LOCAL);
  if (bad) return bad;

  // the class code was checked once at sign-up when accounts are on
  if (!user && !checkClassCode(body.classCode)) return fail('bad_code', 401);

  // --- the conversation: the last few turns; the last one must be from the student (or the coach starts) ---
  const greeting = body.kind === 'greeting';
  const turns = turnsForModel(Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [], MAX_TURNS);
  if (!greeting && turns.at(-1)?.role !== 'user') return fail('no_message', 400);
  const lastUser = greeting ? '' : turns.at(-1).text;

  if (overDailyLimit(req, body.clientId, user?.id)) {
    return fail('limit', 429);
  }

  // --- what the coach knows: goals, numbers (worked out by the app), today ---
  const name = String(user ? user.username : body.name || 'there').slice(0, 40);
  const today = pickToday(body.today, todayKey(new Date()));
  const topics = allTopics().map(({ keywords, ...t }) => t);
  let home;
  try {
    home = await withTimeout(homeData(user, body), DATA_TIMEOUT_MS);
  } catch (e) {
    console.error('coach: numbers unavailable:', e?.message); // full text stays in the server log
    return fail('data', 503, e?.code === 'data_timeout' ? 'timeout' : 'db');
  }

  // --- get the answer (demo script or Gemini) ---
  let raw_answer;
  let aiError = null; // set when the answer was cut off: we still try to rescue the message
  try {
    raw_answer = process.env.MOCK === '1'
      ? mockCoach({ text: lastUser, kind: greeting ? 'greeting' : 'chat', name, home, topics, today, history: turns })
      : await askGemini();
  } catch (e) {
    console.error('Coach failed:', e.status, e.reason || '');
    if (e.partial) {
      aiError = e;
      raw_answer = e.partial; // cut off after both tries: use what there is (below)
    } else if (e.status === 429) {
      return fail('quota', 429);
    } else if (e.status === 504) {
      return fail('timeout', 504, 'timeout');
    } else if (e.status === 'config') {
      return fail('config', 500);
    } else {
      return fail('model', 502, reasonCode(e));
    }
  }

  async function askGemini() {
    if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('GEMINI_API_KEY is missing on the server.'), { status: 'config' });
    // Gemini wants turns to alternate and to start and end with the student
    const contents = [];
    const push = (role, text) => {
      const last = contents.at(-1);
      if (last && last.role === role) last.parts[0].text += `\n${text}`;
      else contents.push({ role, parts: [{ text }] });
    };
    if (turns[0]?.role !== 'user') push('user', 'Hello.');
    for (const m of turns) push(m.role, m.role === 'model' ? JSON.stringify({ message: m.text }) : m.text);
    if (greeting) push('user', GREETING_TURN);
    while (contents.length && contents.at(-1).role !== 'user') contents.pop();
    const system = buildCoachPrompt({ name, context: coachContext({ home, topics, today }) });
    return generate({ system, contents, schema: COACH_SCHEMA, deadline, ...coachModelSettings() });
  }

  // --- turn it into clean data for the screen ---
  const parsed = typeof raw_answer === 'string' ? parseModelJson(raw_answer) : raw_answer;
  // a goal proposal or a plan change: the app builds the plan from the template (names and dates never come from the model)
  let actions = null;
  if (parsed && typeof parsed === 'object' && (parsed.proposeGoal || parsed.planChanges)) {
    try {
      const ctx = await withTimeout(planContext(user, body, today), DATA_TIMEOUT_MS);
      actions = goalActions(parsed, { goals: home.goals, ctx, today, lastUser });
    } catch (e) {
      console.error('coach: plan could not be built:', e?.message);
      actions = { goalProposal: null, planChanges: null, note: NOTES.default };
    }
  }
  const coach = normalizeCoach(parsed, { topics, actions });
  if (coach) return Response.json({ coach });
  // invalid or cut-off JSON: show at least the message (and say if a plan proposal got lost)
  console.warn('Coach answer was not valid JSON:', replyShape(raw_answer));
  const text = salvageMessage(raw_answer);
  if (!text) return fail('model', 502, aiError ? reasonCode(aiError) : 'ai-unreadable');
  const message = text.slice(0, 1200);
  return Response.json({ coach: { message: startsPlanChanges(raw_answer) ? withPlanNote(message) : message, suggestedSession: null, goalProposal: null, planChanges: null, quickReplies: [] } });
}
