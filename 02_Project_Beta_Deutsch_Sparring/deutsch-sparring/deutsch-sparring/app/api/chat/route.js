import { getLesson, getKnownGrammar, guessTopic, topicsForLevel, FREE_TOPIC } from '../../../lib/content';
import { allTopics } from '../../../lib/topics';
import { curriculumEntry, curriculumLesson, knownGrammarText } from '../../../lib/curriculum';
import { getWords, getWord, wordTopicFilter, sourcesFor, wordLine, WORD_LINE_HEADER } from '../../../lib/words';
import { pickWords, wordsNeeded, testedChecks, isNew } from '../../../lib/scores';
import { GRAMMAR_POINTS, cleanGrammar, wantsSentenceTasks } from '../../../lib/grammar';
import { buildSystemPrompt } from '../../../lib/prompt';
import { generate } from '../../../lib/gemini';
import { mockReply } from '../../../lib/mock';
import {
  RESPONSE_SCHEMA, DIFFICULTY_DE, LEVELS, normalizeReply, parseModelJson, salvageMessage,
} from '../../../lib/reply';
import { checkCode, overDailyLimit } from '../../../lib/guard';
import { draftWithNoveltyRetry } from '../../../lib/novelty';
import { pickModels, cleanModelIds } from '../../../lib/exercise-models';
import { QUESTION_MIN, QUESTION_MAX } from '../../../lib/intents';
import { MIXED_TOPIC, MIXED_TOPIC_ID } from '../../../lib/session-settings';
import { buildReviewPlan, cleanReviewPlan } from '../../../lib/mixed-review';
import { cleanErrorLog, mergeErrorLogs, mistakesForTutor } from '../../../lib/error-log';
import { grammarStatsFromLog } from '../../../lib/grammar-stats';
import { modelsFor } from '../../../lib/exercise-models';
import { requireUser } from '../../../lib/auth';
import { cleanVariant, replyToVariant, toVariant } from '../../../lib/variants';
import { progress as progressStore, cleanScores } from '../../../lib/progress';
import { fail, reasonCode, replyShape, readJsonBody, MAX_BYTES_CHAT } from '../../../lib/route-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DEADLINE_MS = 55_000; // stay below maxDuration so we can still answer with JSON

const MAX_HISTORY = 30;
const MAX_CHARS = 1500;
const MAX_MODEL_CHARS = 4000; // the tutor's own (JSON) turns are longer

const MAX_WORD_IDS = 60;

export async function POST(req) {
  try {
    return await handle(req);
  } catch (e) {
    console.error('chat route crashed:', e); // the full text stays in the server log; the browser gets a short code
    return fail('server', 500, reasonCode(e));
  }
}

async function handle(req) {
  const deadline = Date.now() + DEADLINE_MS;
  // with accounts: only for logged-in students (their name = their username)
  const { user, response } = await requireUser(req);
  if (response) return response;
  const { body, response: bad } = await readJsonBody(req, MAX_BYTES_CHAT);
  if (bad) return bad;
  const { classCode, messages } = body || {};
  const name = user ? user.username : body?.name;

  // the class code was checked once at sign-up when accounts are on
  // (wrong codes are counted per network: too many → 429 'code_tries' for the rest of the day)
  if (!user) {
    const code = await checkCode(req, { classCode });
    if (code === 'too_many') return fail('code_tries', 429);
    if (code !== 'ok') return fail('bad_code', 401);
  }
  if (!Array.isArray(messages) || messages.length === 0) return fail('no_message', 400);
  if (await overDailyLimit(req, user?.id)) {
    return fail('limit', 429);
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
    // 'ch' (Swiss Standard German: ss, Velo, Spital) | 'de' (German Standard German: ß);
    // anything else = 'ch'. Neither option is dialect.
    variant: cleanVariant(s.variant),
  };
  const ses = body.session || {};
  const lessons = allTopics();
  const selectableLessons = topicsForLevel(lessons, settings.level);
  // Keep every old id valid for a session already in progress, but only offer/guess topics for its CEFR level.
  const allCatalog = [...lessons, FREE_TOPIC, MIXED_TOPIC];
  const topicIds = new Set(allCatalog.map((t) => t.id));
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
    start: ses.start === true,
    skippedNumber: count(ses.skippedNumber, 60),
    skippedLine: String(ses.skippedLine || '').slice(0, 300),
    skippedWordId: String(ses.skippedWordId || '').slice(0, 120),
    skippedTask: ['flashcard', 'grammar'].includes(ses.skippedTask) ? ses.skippedTask : null,
  };
  // nothing chosen yet: guess the lesson from the wish ("Dativ und Akkusativ, Stufe mittel")
  let guessed = false;
  if (!session.topicId && !session.openNumber && !progress.done) {
    session.topicId = guessTopic(lastUser, selectableLessons);
    guessed = Boolean(session.topicId);
  }
  const topicId = session.topicId;
  const currentTopic = allCatalog.find((t) => t.id === topicId) || null;
  const catalog = [...selectableLessons];
  if (currentTopic && currentTopic.id !== FREE_TOPIC.id && !catalog.some((t) => t.id === currentTopic.id)) catalog.push(currentTopic);
  catalog.push(FREE_TOPIC);
  // the error log (lib/error-log.js): this session's and the browser's mistakes first, then – logged in – the answers table.
  // "Repeat my mistakes", the tutor's RECENT MISTAKES and the Mixed review all read from this one list.
  let errorLog = cleanErrorLog(body.mistakes, 100);
  if (user) {
    try {
      errorLog = mergeErrorLogs([errorLog, await progressStore().errorLog(user.id)], 100);
    } catch (e) {
      console.error('error log unavailable:', e?.message);
    }
  }
  const mistakes = mistakesForTutor(errorLog, 8);
  // "Repeat my mistakes": the mistakes of THIS session that the app sends with the chip (rule / word, never trusted further than text)
  const repeat = (Array.isArray(body.repeatMistakes) ? body.repeatMistakes : []).slice(0, 8).map((m) => ({
    studentAnswer: String(m?.studentAnswer || '').slice(0, 200),
    corrected: String(m?.corrected || '').slice(0, 200),
    rule: String(m?.rule || '').slice(0, 80),
    word: String(m?.word || '').slice(0, 60),
  }));
  const asked = (Array.isArray(body.asked) ? body.asked : []).slice(-50).map((x) => String(x).slice(0, 120)).filter(Boolean);
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 6).map((n) => String(n).slice(0, 80));

  // --- vocabulary: only the words this session needs, picked by the app from the student's scores ---
  // The first request of a session has no word ids yet: the server picks them (lib/scores.js) and
  // sends the ids back; the browser returns them with every later request, so the words stay the same.
  let words = [];
  const fresh = new Set(); // words the student has never practised: the tutor shows them before testing them
  const filter = topicId ? wordTopicFilter(topicId) : null;
  if (filter) {
    const sent = (Array.isArray(body.wordIds) ? body.wordIds : []).slice(0, MAX_WORD_IDS).map((id) => getWord(String(id))).filter(Boolean);
    if (sent.length) {
      words = sent;
      for (const id of (Array.isArray(body.newWordIds) ? body.newWordIds : []).slice(0, MAX_WORD_IDS)) fresh.add(String(id));
    } else {
      // logged in: the scores come from the database (the browser is not trusted); else the browser's own
      let scores;
      if (user) {
        try {
          scores = await progressStore().scores(user.id, null);
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
        difficulty: settings.difficulty, // which scores make a word "weak": Easy Meaning, Medium + Article, Hard + Plural
        now: Date.now(),
      };
      words = pickWords(query);
      // nothing at this level in this list: use the other levels rather than an empty session
      if (!words.length) words = pickWords({ ...query, level: undefined });
      for (const w of words) if (isNew(scores[w.id])) fresh.add(w.id);
    }
  }
  // --- Mixed review (lib/mixed-review.js): the plan is made once, at the first request, from the error log, the topic scores
  // and the word scores; the browser keeps it and sends it back with every request ---
  let reviewPlan = null;
  let review = [];
  if (topicId === MIXED_TOPIC_ID) {
    const grammarTopics = lessons.filter((x) => x.type !== 'Wortschatz');
    const known = new Set(grammarTopics.map((x) => x.id));
    reviewPlan = cleanReviewPlan(body.reviewPlan).filter((it) => (it.kind === 'word' ? Boolean(getWord(it.wordId)) : !it.topicId || known.has(it.topicId)));
    if (!reviewPlan.length) {
      let grammarStats;
      let scores;
      try {
        if (user) {
          [grammarStats, scores] = await Promise.all([progressStore().grammarStats(user.id), progressStore().scores(user.id, null)]);
        } else {
          grammarStats = grammarStatsFromLog(body.review?.rulelog);
          scores = cleanScores(body.review?.scores);
        }
      } catch (e) {
        console.error('mixed review numbers unavailable:', e?.message);
        grammarStats = {};
        scores = {};
      }
      reviewPlan = buildReviewPlan({
        grammarStats, scores, errors: errorLog, topics: grammarTopics, words: getWords(), level: settings.level,
        sources: sourcesFor('both'), total: session.total, difficulty: settings.difficulty, now: Date.now(),
      });
    }
    words = reviewPlan.filter((it) => it.kind === 'word').map((it) => getWord(it.wordId)).filter(Boolean);
    const seenAt = new Map();
    review = reviewPlan.map((it) => {
      if (it.kind === 'word') return { kind: 'word', wordId: it.wordId };
      const entry = it.topicId ? curriculumEntry(it.topicId) : null;
      const title = entry?.title || grammarTopics.find((x) => x.id === it.topicId)?.title || '';
      const at = seenAt.get(it.topicId) || 0; // the same topic twice: the next model
      seenAt.set(it.topicId, at + 1);
      const all = modelsFor(it.topicId);
      return { ...it, title, rule: entry?.rule?.split(/(?<=[.!?])\s+/)[0] || '', ruleNames: entry?.ruleNames || [], model: all.length ? all[at % all.length] : null };
    });
  }
  // --- exercise models (grammar topics): 3–5 patterns the AI turns into NEW exercises (lib/exercise-models.js) ---
  // The first request picks them (rotating: models from recent sessions come last); the browser sends the ids back every time.
  const models = topicId && !filter && !reviewPlan ? pickModels(topicId, { keep: cleanModelIds(body.modelIds), seen: cleanModelIds(body.seenModels), total: session.total }) : [];
  const modelIds = models.map((m) => m.id);

  // the parts the open question tests (Easy: the word · Medium: + article · Hard: + plural), so feedback.parts has exactly those
  const wordById = new Map(words.map((w) => [w.id, w]));
  const openChecks = session.openTask
    ? testedChecks({ task: session.openTask, word: wordById.get(session.openWordId) || getWord(session.openWordId), difficulty: settings.difficulty, direction: session.openDirection || 'en-de' })
    : null;
  const ctx = { level: settings.level, difficulty: settings.difficulty, topicIds, topicId, wordIds: new Set(words.map((w) => w.id)), wordById, openTask: session.openTask, openChecks, focus: body.grammarFocus };

  // --- get the tutor's answer (demo script or Gemini) ---
  let text;
  try {
    if (process.env.MOCK === '1') {
      text = await mockReply({ text: lastUser, settings, session, progress, words, topics: catalog, topic: catalog.find((t) => t.id === topicId) || null, models, reviewPlan });
    } else {
      text = await draftWithNoveltyRetry({
        ask: askGemini,
        parse: parseModelJson,
        previous: [...asked, session.openLine, session.skippedLine],
        copyOf: models,
        openLine: session.openLine,
        deadline,
      });
    }
  } catch (e) {
    console.error('Tutor failed:', e.status, e.reason || '');
    if (e.partial) {
      text = e.partial; // cut off after the tries: the message is rescued below
    } else if (e.status === 429) {
      return fail('quota', 429);
    } else if (e.status === 504) {
      return fail('timeout', 504, 'timeout');
    } else if (e.status === 'config') {
      return fail('config', 500); // a wrong key or model name (from Gemini) or a missing key (from askGemini)
    } else if (e.status === 'no_message') {
      return fail('no_message', 400);
    } else {
      return fail('model', 502, reasonCode(e));
    }
  }

  async function askGemini(extraInstruction = '') {
    if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('GEMINI_API_KEY is missing on the server.'), { status: 'config' });

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
    if (!recent.length) throw Object.assign(new Error('No student message.'), { status: 'no_message' });

    const system = buildSystemPrompt({
      name: String(name || 'du').slice(0, 40),
      lesson: filter || reviewPlan ? null : (curriculumEntry(topicId) ? curriculumLesson(curriculumEntry(topicId)) : getLesson(topicId)),
      models,
      words: filter || reviewPlan ? { header: WORD_LINE_HEADER, lines: words.map((w) => wordLine(w, fresh.has(w.id))) } : null,
      knownGrammar: getKnownGrammar() || knownGrammarText(settings.level),
      catalog,
      settings: { ...settings, difficulty: DIFFICULTY_DE[settings.difficulty] },
      session,
      progress,
      mistakes,
      repeat,
      notes,
      guessed,
      asked,
      review,
    });
    return generate({ system: `${system}${extraInstruction}`, contents: recent, schema: RESPONSE_SCHEMA, deadline });
  }

  // --- turn it into clean data for the screen ---
  const parsed = parseModelJson(text);
  // the tutor's text in the student's spelling (ss / ß); the student's own answer is never changed
  const reply = replyToVariant(normalizeReply(parsed, ctx), settings.variant);
  if (!reply) {
    // invalid JSON: the browser shows the text as a normal message and keeps the panel as it is
    console.warn('Tutor answer was not valid JSON:', replyShape(text)); // never the text itself (a student's words may be in it)
    return Response.json({ reply: null, text: toVariant(salvageMessage(text) || String(text).slice(0, 2000), settings.variant), words: wordInfo(), models: modelIds, ...(reviewPlan ? { plan: reviewPlan } : {}) });
  }
  // modelText = what the browser sends back as this tutor turn next time (without the bulky parts)
  const { grammarFocus, options, ...essentials } = parsed;
  // exercise.answer is a private hint-safety reference. Do not expose it to the browser or
  // send it back in conversation history.
  if (essentials.exercise && typeof essentials.exercise === 'object') {
    essentials.exercise = { ...essentials.exercise };
    delete essentials.exercise.answer;
  }
  return Response.json({ reply, modelText: JSON.stringify(essentials), words: wordInfo(), models: modelIds, ...(reviewPlan ? { plan: reviewPlan } : {}) });

  // the picked words for the browser to keep: id + type + the word as shown on the summary screen (phrases have no grammar score)
  function wordInfo() {
    return filter || reviewPlan ? words.map((w) => ({ id: w.id, type: w.type, label: (w.noun ? `${w.article} ${w.noun}` : w.de || w.id).slice(0, 60), ...(fresh.has(w.id) ? { fresh: true } : {}) })) : undefined;
  }
}
