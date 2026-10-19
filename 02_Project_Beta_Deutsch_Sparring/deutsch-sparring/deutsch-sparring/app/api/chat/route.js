import { getLesson, getKnownGrammar, guessTopic, FREE_TOPIC } from '../../../lib/content';
import { allTopics } from '../../../lib/topics';
import { getWords, getWord, wordTopicFilter, sourcesFor, wordLine, WORD_LINE_HEADER } from '../../../lib/words';
import { pickWords, wordsNeeded } from '../../../lib/scores';
import { GRAMMAR_POINTS, cleanGrammar, wantsSentenceTasks } from '../../../lib/grammar';
import { buildSystemPrompt } from '../../../lib/prompt';
import { generate } from '../../../lib/gemini';
import { mockReply } from '../../../lib/mock';
import {
  RESPONSE_SCHEMA, DIFFICULTY_DE, LEVELS, normalizeReply, parseModelJson, salvageMessage,
} from '../../../lib/reply';
import { checkClassCode, overDailyLimit } from '../../../lib/guard';
import { QUESTION_MIN, QUESTION_MAX } from '../../../lib/intents';
import { requireUser } from '../../../lib/auth';
import { cleanVariant, replyToVariant, toVariant } from '../../../lib/variants';
import { progress, cleanScores } from '../../../lib/progress';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DEADLINE_MS = 55_000; // stay below maxDuration so we can still answer with JSON

const MAX_HISTORY = 30;
const MAX_CHARS = 1500;
const MAX_MODEL_CHARS = 4000; // the tutor's own (JSON) turns are longer

const MAX_WORD_IDS = 60;
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
  // with accounts: only for logged-in students (their name = their username)
  const { user, response } = await requireUser(req);
  if (response) return response;
  let body;
  try {
    body = await req.json();
  } catch {
    return fail('Ungültige Anfrage.', 400);
  }
  const { classCode, messages } = body || {};
  const name = user ? user.username : body?.name;

  // the class code was checked once at sign-up when accounts are on
  if (!user && !checkClassCode(classCode)) return fail('Falscher Klassen-Code.', 401, 'bad_code');
  if (!Array.isArray(messages) || messages.length === 0) return fail('Keine Nachricht.', 400);
  if (overDailyLimit(req, body.clientId, user?.id)) {
    return fail('Tageslimit erreicht. Morgen geht es weiter – bis dann! 👋', 429, 'limit');
  }

  // --- what the browser says about the current state (all values checked) ---
  // The browser owns the session: it counts the questions and decides when it ends.
  const s = body.settings || {};
  // grammar = the grammar points chosen for each word (lib/grammar.js). A browser that only knows the old
  // "sentences" switch sends no list: switched on = all points. "sentences" is derived from the points:
  // true when a sentence task follows each flashcard.
  const grammar = cleanGrammar(s.grammar) ?? (s.sentences === true ? GRAMMAR_POINTS : []);
  const settings = {
    level: LEVELS.includes(s.level) ? s.level : 'B1',
    difficulty: DIFFICULTY_DE[s.difficulty] ? s.difficulty : 'medium',
    direction: ['en-de', 'de-en', 'mixed'].includes(s.direction) ? s.direction : 'en-de',
    grammar,
    sentences: wantsSentenceTasks(grammar),
    // 'ch' (Swiss: ss) | 'de' (German: ß); anything else = 'ch'
    variant: cleanVariant(s.variant),
  };
  const ses = body.session || {};
  const lessons = allTopics();
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
    openWordId: String(ses.openWordId || '').slice(0, 120),
    openTask: ['flashcard', 'grammar'].includes(ses.openTask) ? ses.openTask : null,
    finished: ses.finished === true,
    skippedNumber: count(ses.skippedNumber, 60),
    skippedLine: String(ses.skippedLine || '').slice(0, 300),
    skippedWordId: String(ses.skippedWordId || '').slice(0, 120),
    skippedTask: ['flashcard', 'grammar'].includes(ses.skippedTask) ? ses.skippedTask : null,
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
  const asked = (Array.isArray(body.asked) ? body.asked : []).slice(-50).map((x) => String(x).slice(0, 120)).filter(Boolean);
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 6).map((n) => String(n).slice(0, 80));

  // --- vocabulary: only the words this session needs, picked by the app from the student's scores ---
  // The first request of a session has no word ids yet: the server picks them (lib/scores.js) and
  // sends the ids back; the browser returns them with every later request, so the words stay the same.
  let words = [];
  const filter = topicId ? wordTopicFilter(topicId) : null;
  if (filter) {
    const sent = (Array.isArray(body.wordIds) ? body.wordIds : []).slice(0, MAX_WORD_IDS).map((id) => getWord(String(id))).filter(Boolean);
    if (sent.length) {
      words = sent;
    } else {
      // logged in: the scores come from the database (the browser is not trusted); else the browser's own
      let scores;
      if (user) {
        try {
          scores = await progress().scores(user.id, null);
        } catch (e) {
          console.error('word scores unavailable:', e?.message);
          scores = {};
        }
      } else {
        scores = cleanScores(body.scores);
      }
      const query = {
        words: getWords(),
        scores,
        level: settings.level,
        sources: sourcesFor(['goethe', 'kurs'].includes(body.source) ? body.source : 'both'),
        ...filter,
        count: wordsNeeded(session.total, settings.sentences),
        now: Date.now(),
      };
      words = pickWords(query);
      // nothing at this level in this list: use the other levels rather than an empty session
      if (!words.length) words = pickWords({ ...query, level: undefined });
    }
  }
  const ctx = { level: settings.level, difficulty: settings.difficulty, topicIds, topicId, wordIds: new Set(words.map((w) => w.id)), openTask: session.openTask };

  // --- get the tutor's answer (demo script or Gemini) ---
  let text;
  try {
    text = process.env.MOCK === '1'
      ? await mockReply({ text: lastUser, settings, session, progress, words, topics: catalog, topic: catalog.find((t) => t.id === topicId) || null })
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
      lesson: filter ? null : getLesson(topicId),
      words: filter ? { header: WORD_LINE_HEADER, lines: words.map(wordLine) } : null,
      knownGrammar: getKnownGrammar(),
      catalog,
      settings: { ...settings, difficulty: DIFFICULTY_DE[settings.difficulty] },
      session,
      progress,
      mistakes,
      notes,
      guessed,
      asked,
    });
    return generate({ system, contents: recent, schema: RESPONSE_SCHEMA, deadline });
  }

  // --- turn it into clean data for the screen ---
  const parsed = parseModelJson(text);
  // the tutor's text in the student's spelling (ss / ß); the student's own answer is never changed
  const reply = replyToVariant(normalizeReply(parsed, ctx), settings.variant);
  if (!reply) {
    // invalid JSON: the browser shows the text as a normal message and keeps the panel as it is
    console.warn('Tutor answer was not valid JSON:', String(text).slice(0, 300));
    return Response.json({ reply: null, text: toVariant(salvageMessage(text) || String(text).slice(0, 2000), settings.variant), words: wordInfo() });
  }
  // modelText = what the browser sends back as this tutor turn next time (without the bulky parts)
  const { grammarFocus, options, ...essentials } = parsed;
  return Response.json({ reply, modelText: JSON.stringify(essentials), words: wordInfo() });

  // the picked words for the browser to keep: id + type + the word as shown on the summary screen (phrases have no grammar score)
  function wordInfo() {
    return filter ? words.map((w) => ({ id: w.id, type: w.type, label: (w.noun ? `${w.article} ${w.noun}` : w.de || w.id).slice(0, 60) })) : undefined;
  }
}
