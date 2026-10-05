import { getLesson, getKnownGrammar, listLessons } from '../../../lib/content';
import { buildSystemPrompt } from '../../../lib/prompt';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODES = ['Grammatik', 'Wortschatz', 'Gemischt'];
const MAX_HISTORY = 40;
const MAX_CHARS = 1500;

// Simple per-person daily limit (memory only: resets when the server restarts; good enough for a class).
const usage = new Map();
function overLimit(key) {
  const limit = Number(process.env.DAILY_LIMIT || 150);
  const day = new Date().toISOString().slice(0, 10);
  const entry = usage.get(key);
  if (!entry || entry.day !== day) {
    usage.set(key, { day, n: 1 });
    return false;
  }
  entry.n += 1;
  return entry.n > limit;
}

async function callGemini(model, system, contents) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Gemini error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
  if (!text) throw Object.assign(new Error('Leere Antwort vom Modell'), { status: 502 });
  return text;
}

function mockReply(messages, count) {
  const n = messages.filter((m) => m.role === 'user').length;
  if (n === 1) return `Hallo! Schön, dass du übst. 😊\n\n**Aufgabe 1/${count}**\nDas Handy liegt auf ___ Tisch (der).`;
  return `✘ Fast!\nRichtig ist: **dem**\nRegel: liegen = Wo? → Dativ.\nBeispiel: Die Katze liegt auf **dem** Sofa.\n\n**Aufgabe ${Math.min(n, count)}/${count}**\nIch lege das Buch auf ___ Tisch (der).`;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }
  const { name, topicId, mode, count, messages, classCode } = body || {};

  if (process.env.CLASS_CODE && classCode !== process.env.CLASS_CODE) {
    return Response.json({ error: 'Falscher Klassen-Code.', code: 'bad_code' }, { status: 401 });
  }
  const lesson = getLesson(topicId);
  if (!lesson) return Response.json({ error: 'Thema nicht gefunden.' }, { status: 404 });
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'Keine Nachricht.' }, { status: 400 });
  }

  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (overLimit(ip)) {
    return Response.json(
      { error: 'Tageslimit erreicht. Morgen geht es weiter – bis dann! 👋' },
      { status: 429 }
    );
  }

  const safeName = String(name || 'du').slice(0, 40);
  const safeMode = MODES.includes(mode) ? mode : 'Gemischt';
  const safeCount = [5, 10].includes(Number(count)) ? Number(count) : 5;
  const recent = messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.text || '').slice(0, MAX_CHARS) }],
  }));
  while (recent.length && recent[0].role !== 'user') recent.shift();

  if (process.env.MOCK === '1') {
    return Response.json({ reply: mockReply(messages, safeCount) });
  }
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'GEMINI_API_KEY fehlt auf dem Server.' }, { status: 500 });
  }

  const title = listLessons().find((l) => l.id === topicId)?.title || topicId;
  const system = buildSystemPrompt({
    name: safeName,
    lesson,
    knownGrammar: getKnownGrammar(),
    mode: safeMode,
    count: safeCount,
    title,
  });

  const primary = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
  try {
    const reply = await callGemini(primary, system, recent);
    return Response.json({ reply });
  } catch (e) {
    if (fallback && fallback !== primary && [429, 500, 503, 404].includes(e.status)) {
      try {
        const reply = await callGemini(fallback, system, recent);
        return Response.json({ reply });
      } catch (e2) {
        e = e2;
      }
    }
    console.error('Gemini failed:', e.status, e.message);
    const busy = e.status === 429;
    return Response.json(
      {
        error: busy
          ? 'Das kostenlose KI-Kontingent ist gerade erschöpft. Bitte versuche es in ein paar Minuten nochmal.'
          : 'Der Tutor ist gerade nicht erreichbar. Bitte versuche es nochmal.',
      },
      { status: busy ? 429 : 502 }
    );
  }
}
