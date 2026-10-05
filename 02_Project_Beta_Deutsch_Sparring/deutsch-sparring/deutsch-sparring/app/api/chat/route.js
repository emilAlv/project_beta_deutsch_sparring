import { getLesson, getKnownGrammar, listLessons, guessTopic, FREE_TOPIC } from '../../../lib/content';
import { buildSystemPrompt } from '../../../lib/prompt';
import { generate } from '../../../lib/gemini';
import { mockReply } from '../../../lib/mock';
import {
  RESPONSE_SCHEMA, DIFFICULTY_DE, LEVELS, normalizeReply, parseModelJson, salvageMessage,
} from '../../../lib/reply';
import { checkClassCode, overDailyLimit, clientKey } from '../../../lib/guard';

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
  const s = body.settings || {};
  const settings = {
    level: LEVELS.includes(s.level) ? s.level : 'B1',
    difficulty: DIFFICULTY_DE[s.difficulty] ? s.difficulty : 'medium',
  };
  const ses = body.session || {};
  const lessons = listLessons();
  const catalog = [...lessons, FREE_TOPIC];
  const topicIds = new Set(catalog.map((t) => t.id));
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.text || '';

  let topicId = topicIds.has(ses.topicId) ? ses.topicId : null;
  let guessed = false;
  if (!topicId) {
    topicId = guessTopic(lastUser, lessons);
    guessed = Boolean(topicId);
  }
  const session = {
    topicId,
    scenario: String(ses.scenario || '').slice(0, 60) || null,
    exerciseNumber: Number(ses.exerciseNumber) > 0 ? Math.min(Number(ses.exerciseNumber), 30) : 0,
    exerciseLine: String(ses.exerciseLine || '').slice(0, 300),
    total: Number(ses.total) > 0 ? Math.min(Number(ses.total), 30) : 8,
    started: Boolean(ses.started),
  };
  const p = body.progress || {};
  const progress = {
    answered: Math.max(0, Number(p.answered) || 0),
    correct: Math.max(0, Number(p.correct) || 0),
  };
  const mistakes = (Array.isArray(body.mistakes) ? body.mistakes : []).slice(0, 8).map((m) => ({
    studentAnswer: String(m?.studentAnswer || '').slice(0, 200),
    corrected: String(m?.corrected || '').slice(0, 200),
    rule: String(m?.rule || '').slice(0, 80),
  }));
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 6).map((n) => String(n).slice(0, 80));
  const ctx = { level: settings.level, difficulty: settings.difficulty, topicIds, topicId };

  // --- get the tutor's answer (demo script or Gemini) ---
  let text;
  if (process.env.MOCK === '1') {
    text = await mockReply({ text: lastUser, settings, session, progress, topicId });
  } else {
    if (!process.env.GEMINI_API_KEY) return fail('GEMINI_API_KEY fehlt auf dem Server.', 500);

    const recent = messages.slice(-MAX_HISTORY).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text || '').slice(0, m.role === 'assistant' ? MAX_MODEL_CHARS : MAX_CHARS) }],
    }));
    while (recent.length && recent[0].role !== 'user') recent.shift();
    if (!recent.length) return fail('Keine Nachricht.', 400);

    const system = buildSystemPrompt({
      name: String(name || 'du').slice(0, 40),
      lesson: getLesson(topicId),
      knownGrammar: getKnownGrammar(),
      catalog,
      settings: { level: settings.level, difficulty: DIFFICULTY_DE[settings.difficulty] },
      session,
      progress,
      mistakes,
      notes,
      guessed,
    });

    try {
      text = await generate({ system, contents: recent, schema: RESPONSE_SCHEMA, deadline });
    } catch (e) {
      console.error('Gemini failed:', e.status, e.message);
      if (e.status === 429) {
        return fail('Das kostenlose KI-Kontingent ist gerade erschöpft. Bitte versuche es in ein paar Minuten nochmal.', 429, 'quota');
      }
      if (e.status === 504) return fail('Der Tutor hat zu lange gebraucht. Bitte versuche es nochmal.', 504, 'timeout');
      return fail('Der Tutor ist gerade nicht erreichbar. Bitte versuche es nochmal.', 502, 'model');
    }
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
