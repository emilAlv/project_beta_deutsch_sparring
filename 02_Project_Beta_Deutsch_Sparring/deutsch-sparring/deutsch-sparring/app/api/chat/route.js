import { getLesson, getKnownGrammar, listLessons, guessTopic, FREE_TOPIC } from '../../../lib/content';
import { buildSystemPrompt } from '../../../lib/prompt';
import { generate } from '../../../lib/gemini';
import { mockReply } from '../../../lib/mock';
import {
  RESPONSE_SCHEMA, DIFFICULTY_DE, LEVELS, normalizeReply, parseModelJson, salvageMessage,
} from '../../../lib/reply';
import { checkClassCode, overDailyLimit, clientKey } from '../../../lib/guard';
import { QUESTION_MIN, QUESTION_MAX } from '../../../lib/intents';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DEADLINE_MS = 55_000; // stay below maxDuration so we can still answer with JSON

const MAX_HISTORY = 30;
const MAX_CHARS = 1500;
const MAX_MODEL_CHARS = 4000; // the tutor's own (JSON) turns are longer

const fail = (error, status, code) => Response.json({ error, code }, { status });

export async function POST(req) {
  try {
    return await handle(req);
  } catch (e) {
    console.error('chat route crashed:', e);
    return fail('Der Tutor ist gerade nicht erreichbar. Bitte versuche es nochmal.', 500);
  }
}

async function handle(req) {
  const deadline = Date.now() + DEADLINE_MS;
  let body;
  try {
    body = await req.json();
  } catch {
    return fail('Ungültige Anfrage.', 400);
  }
  const { name, classCode, messages } = body || {};

  if (!checkClassCode(classCode)) return fail('Falscher Klassen-Code.', 401, 'bad_code');
  if (!Array.isArray(messages) || messages.length === 0) return fail('Keine Nachricht.', 400);
  if (overDailyLimit(clientKey(req))) {
    return fail('Tageslimit erreicht. Morgen geht es weiter – bis dann! 👋', 429, 'limit');
  }

  // --- what the browser says about the current state (all values checked) ---
  // The browser owns the session: it counts the questions and decides when it ends.
  const s = body.settings || {};
  const settings = {
    level: LEVELS.includes(s.level) ? s.level : 'B1',
    difficulty: DIFFICULTY_DE[s.difficulty] ? s.difficulty : 'medium',
    direction: ['en-de', 'de-en', 'mixed'].includes(s.direction) ? s.direction : 'en-de',
    sentences: s.sentences === true,
  };
  const ses = body.session || {};
  const lessons = listLessons();
  const catalog = [...lessons, FREE_TOPIC];
  const topicIds = new Set(catalog.map((t) => t.id));
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.text || '';
  const count = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

  const p = body.progress || {};
  const progress = {
    done: count(p.done, 60),
    answered: count(p.answered, 60),
    correct: count(p.correct, 60),
    skipped: count(p.skipped, 60),
  };
  const session = {
    topicId: topicIds.has(ses.topicId) ? ses.topicId : null,
    total: Math.max(QUESTION_MIN, Math.min(QUESTION_MAX, count(ses.total, 99) || QUESTION_MIN)),
    openNumber: count(ses.openNumber, 60),
    openLine: String(ses.openLine || '').slice(0, 300),
    openDirection: ['en-de', 'de-en'].includes(ses.openDirection) ? ses.openDirection : null,
    finished: ses.finished === true,
    skippedNumber: count(ses.skippedNumber, 60),
    skippedLine: String(ses.skippedLine || '').slice(0, 300),
  };
  // nothing chosen yet: guess the lesson from the wish ("Dativ und Akkusativ, Stufe mittel")
  let guessed = false;
  if (!session.topicId && !session.openNumber && !progress.done) {
    session.topicId = guessTopic(lastUser, lessons);
    guessed = Boolean(session.topicId);
  }
  const topicId = session.topicId;
  const mistakes = (Array.isArray(body.mistakes) ? body.mistakes : []).slice(0, 8).map((m) => ({
    studentAnswer: String(m?.studentAnswer || '').slice(0, 200),
    corrected: String(m?.corrected || '').slice(0, 200),
    rule: String(m?.rule || '').slice(0, 80),
  }));
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 6).map((n) => String(n).slice(0, 80));
  const ctx = { level: settings.level, difficulty: settings.difficulty, topicIds, topicId };

  // --- get the tutor's answer (demo script or Gemini) ---
  let text;
  try {
    text = process.env.MOCK === '1'
      ? await mockReply({ text: lastUser, settings, session, progress, topic: catalog.find((t) => t.id === topicId) || null })
      : await askGemini();
  } catch (e) {
    console.error('Tutor failed:', e.status, e.message);
    if (e.status === 429) {
      return fail('Das kostenlose KI-Kontingent ist gerade erschöpft. Bitte versuche es in ein paar Minuten nochmal.', 429, 'quota');
    }
    if (e.status === 504) return fail('Der Tutor hat zu lange gebraucht. Bitte versuche es nochmal.', 504, 'timeout');
    if (e.status === 'config') return fail(e.message, 500, 'config');
    return fail('Der Tutor ist gerade nicht erreichbar. Bitte versuche es nochmal.', 502, 'model');
  }

  async function askGemini() {
    if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('GEMINI_API_KEY fehlt auf dem Server.'), { status: 'config' });

    // Gemini wants user and model turns to alternate: two student messages in a row (after an
    // error or a cancelled request) are merged into one turn.
    const recent = [];
    for (const m of messages.slice(-MAX_HISTORY)) {
      const role = m.role === 'assistant' ? 'model' : 'user';
      const text = String(m.text || '').slice(0, role === 'model' ? MAX_MODEL_CHARS : MAX_CHARS);
      if (!text) continue;
      const last = recent[recent.length - 1];
      if (last && last.role === role) last.parts[0].text += `\n${text}`;
      else recent.push({ role, parts: [{ text }] });
    }
    while (recent.length && recent[0].role !== 'user') recent.shift();
    while (recent.length && recent[recent.length - 1].role !== 'user') recent.pop();
    if (!recent.length) throw Object.assign(new Error('Keine Nachricht vom Lernenden.'), { status: 400 });

    const system = buildSystemPrompt({
      name: String(name || 'du').slice(0, 40),
      lesson: getLesson(topicId),
      knownGrammar: getKnownGrammar(),
      catalog,
      settings: { ...settings, difficulty: DIFFICULTY_DE[settings.difficulty] },
      session,
      progress,
      mistakes,
      notes,
      guessed,
    });
    return generate({ system, contents: recent, schema: RESPONSE_SCHEMA, deadline });
  }

  // --- turn it into clean data for the screen ---
  const parsed = parseModelJson(text);
  const reply = normalizeReply(parsed, ctx);
  if (!reply) {
    // invalid JSON: the browser shows the text as a normal message and keeps the panel as it is
    console.warn('Tutor answer was not valid JSON:', String(text).slice(0, 300));
    return Response.json({ reply: null, text: salvageMessage(text) || String(text).slice(0, 2000) });
  }
  // modelText = what the browser sends back as this tutor turn next time (without the bulky parts)
  const { grammarFocus, options, ...essentials } = parsed;
  return Response.json({ reply, modelText: JSON.stringify(essentials) });
}
