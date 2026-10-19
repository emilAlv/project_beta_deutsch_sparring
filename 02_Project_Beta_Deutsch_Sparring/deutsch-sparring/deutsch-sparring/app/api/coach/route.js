import { allTopics } from '../../../lib/topics';
import { generate } from '../../../lib/gemini';
import { parseModelJson, salvageMessage } from '../../../lib/reply';
import { checkClassCode, overDailyLimit } from '../../../lib/guard';
import { requireUser, sameOrigin } from '../../../lib/auth';
import { homeData } from '../../../lib/home-data';
import { todayKey } from '../../../lib/goals';
import { COACH_SCHEMA, buildCoachPrompt, coachContext, GREETING_TURN, pickToday } from '../../../lib/coach-prompt';
import { normalizeCoach, turnsForModel } from '../../../lib/coach';
import { mockCoach } from '../../../lib/coach-mock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DEADLINE_MS = 55_000; // stay below maxDuration so we can still answer with JSON

const MAX_BYTES_ACCOUNT = 30_000; // logged in: only the chat turns come from the browser
const MAX_BYTES_LOCAL = 400_000; // accounts off: plus the browser's goals, word scores and answer log (like /api/stats)
const MAX_TURNS = 10;
const MAX_STUDENT_CHARS = 500;

// every error is JSON { error, code }; the page shows its own text for the code
// detail: a short technical reason shown small under the error, so a problem can be reported (never secrets)
const fail = (error, status, code, detail) => Response.json({ error, code, ...(detail ? { detail: cleanDetail(detail) } : {}) }, { status });
const cleanDetail = (d) => String(d).replace(/[a-z]+:\/\/\S+/gi, '[url]').replace(/key=\S+/gi, 'key=[…]').slice(0, 140);

export async function POST(req) {
  try {
    return await handle(req);
  } catch (e) {
    console.error('coach route crashed:', e?.message);
    return fail('The coach is not available right now.', 500, 'server', `crash: ${e?.message}`);
  }
}

async function handle(req) {
  const deadline = Date.now() + DEADLINE_MS;
  // with accounts: only for logged-in students
  const { user, response } = await requireUser(req);
  if (response) return response;
  if (!sameOrigin(req)) return fail('Not allowed.', 403, 'origin');

  const max = user ? MAX_BYTES_ACCOUNT : MAX_BYTES_LOCAL;
  if (Number(req.headers.get('content-length')) > max) return fail('Request too big.', 413, 'too_big');
  const raw = await req.text();
  if (raw.length > max) return fail('Request too big.', 413, 'too_big');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request.', 400, 'bad_body');

  // the class code was checked once at sign-up when accounts are on
  if (!user && !checkClassCode(body.classCode)) return fail('Wrong class code.', 401, 'bad_code');

  // --- the conversation: the last few turns; the last one must be from the student (or the coach starts) ---
  const greeting = body.kind === 'greeting';
  const turns = turnsForModel(Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [], MAX_TURNS)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_STUDENT_CHARS) }));
  if (!greeting && turns.at(-1)?.role !== 'user') return fail('No message.', 400, 'no_message');
  const lastUser = greeting ? '' : turns.at(-1).text;

  if (overDailyLimit(req, body.clientId, user?.id)) {
    return fail('Daily limit reached. Come back tomorrow.', 429, 'limit');
  }

  // --- what the coach knows: goals, numbers (worked out by the app), today ---
  const name = String(user ? user.username : body.name || 'there').slice(0, 40);
  const today = pickToday(body.today, todayKey(new Date()));
  const topics = allTopics().map(({ keywords, ...t }) => t);
  let home;
  try {
    home = await homeData(user, body);
  } catch (e) {
    console.error('coach: numbers unavailable:', e?.message);
    return fail('The coach is not available right now.', 502, 'model', `numbers: ${e?.message}`);
  }

  // --- get the answer (demo script or Gemini) ---
  let raw_answer;
  try {
    raw_answer = process.env.MOCK === '1'
      ? mockCoach({ text: lastUser, kind: greeting ? 'greeting' : 'chat', name, home, topics, today })
      : await askGemini();
  } catch (e) {
    console.error('Coach failed:', e.status, e.message);
    if (e.status === 429) return fail('The free AI quota is used up for now. Try again in a few minutes.', 429, 'quota');
    if (e.status === 504) return fail('The coach took too long.', 504, 'timeout');
    if (e.status === 'config') return fail(e.message, 500, 'config');
    return fail('The coach is not available right now.', 502, 'model', `AI ${e.status}: ${e.message}`);
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
    return generate({ system, contents, schema: COACH_SCHEMA, deadline });
  }

  // --- turn it into clean data for the screen ---
  const parsed = typeof raw_answer === 'string' ? parseModelJson(raw_answer) : raw_answer;
  const coach = normalizeCoach(parsed, { topics, goals: home.goals, today });
  if (coach) return Response.json({ coach });
  // invalid JSON: show at least the text
  console.warn('Coach answer was not valid JSON:', String(raw_answer).slice(0, 300));
  const text = salvageMessage(raw_answer);
  if (!text) return fail('The coach is not available right now.', 502, 'model', `unreadable answer (${String(raw_answer).length} chars)`);
  return Response.json({ coach: { message: text.slice(0, 1200), suggestedSession: null, planChanges: null, quickReplies: [] } });
}
