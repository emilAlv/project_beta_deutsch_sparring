// Checks the AI safety nets (lib/gemini.js) with a fake `fetch` (no key, no network), and the answer cleaning
// in lib/reply.js (parseModelJson, salvageMessage, normalizeReply). Plain node:
//   node scripts/check-gemini.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const G = await import('../lib/gemini.js');
const R = await import('../lib/reply.js');
const C = await import('../lib/coach.js');
const CP = await import('../lib/coach-prompt.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

// ---------- fake Gemini ----------
const answer = (text, finishReason = 'STOP', extra = {}) => ({
  status: 200,
  body: { candidates: [{ content: { parts: text === null ? [] : [{ text }] }, finishReason }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, ...extra },
});
const httpError = (status, message) => ({ status, body: { error: { message } } });
const throws = (name) => ({ throws: Object.assign(new Error(name), { name }) });

let calls = [];
// script = one step per call, in order; a function step gets the call and returns a step
function fakeFetch(script) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const call = {
      model: String(url).match(/models\/([^:]+):/)[1],
      thinking: body.generationConfig.thinkingConfig?.thinkingLevel || null,
      schema: body.generationConfig.responseSchema ? 'strict' : body.generationConfig.responseMimeType ? 'json' : 'none',
      temperature: body.generationConfig.temperature,
    };
    calls.push(call);
    let step = script[Math.min(calls.length - 1, script.length - 1)];
    if (typeof step === 'function') step = step(call);
    if (step.throws) throw step.throws;
    return { ok: step.status < 400, status: step.status, json: async () => step.body };
  };
}

process.env.GEMINI_API_KEY = 'test-key-not-real';
process.env.GEMINI_MODEL = 'gemini-3.5-flash';
process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
delete process.env.GEMINI_TEMPERATURE;
const realLog = console.log;
const quiet = (on) => { console.log = on ? () => {} : realLog; };
const SCHEMA = { type: 'OBJECT', properties: { message: { type: 'STRING' } } };
const run = async (opts = {}) => {
  quiet(true);
  try {
    return { text: await G.generate({ system: 's', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], schema: SCHEMA, ...opts }) };
  } catch (error) {
    return { error };
  } finally {
    quiet(false);
  }
};
const models = () => calls.map((c) => c.model).join(',');

// ---------- the happy path and temperature ----------
fakeFetch([answer('{"message":"ok"}')]);
let r = await run();
check('good answer: one call, with thinking, strict schema', r.text === '{"message":"ok"}' && calls.length === 1 && calls[0].thinking && calls[0].schema === 'strict');
check('gemini-3.x: no temperature is sent', calls[0].temperature === undefined);
check('temperatureFor: other models keep 0.7, env overrides', G.temperatureFor('gemini-2.5-flash') === 0.7 && G.temperatureFor('gemini-3.5-flash-lite') === undefined);
process.env.GEMINI_TEMPERATURE = '0.4';
check('GEMINI_TEMPERATURE overrides', G.temperatureFor('gemini-3.5-flash') === 0.4);
delete process.env.GEMINI_TEMPERATURE;

// ---------- empty, cut-off, blocked ----------
fakeFetch([answer(null), answer('{"message":"second try"}')]);
r = await run();
check('empty answer: retried once without thinking, then ok', r.text?.includes('second try') && calls.length === 2 && calls[0].thinking && !calls[1].thinking && models() === 'gemini-3.5-flash,gemini-3.5-flash');

fakeFetch([answer('{"message":"Hallo, das ist', 'MAX_TOKENS'), answer('{"message":"complete"}')]);
r = await run();
check('MAX_TOKENS: treated as failure, retried without thinking', r.text?.includes('complete') && calls.length === 2 && !calls[1].thinking);

fakeFetch([answer(null, 'MAX_TOKENS'), answer(null, 'MAX_TOKENS'), answer('{"message":"from backup"}')]);
r = await run();
check('empty twice: the fallback model answers', r.text?.includes('from backup') && models() === 'gemini-3.5-flash,gemini-3.5-flash,gemini-3.5-flash-lite');

fakeFetch([answer('{"message":"cut', 'MAX_TOKENS')]);
r = await run();
check('cut off everywhere: error 502 with a short reason and the partial text',
  r.error?.status === 502 && r.error.reason === 'cut_off' && G.errorDetail(r.error) === 'AI: cut off' && r.error.partial === '{"message":"cut' && calls.length === 4, `${r.error?.status} ${calls.length}`);

fakeFetch([answer(null, 'STOP', { promptFeedback: { blockReason: 'SAFETY' } }), answer('{"message":"fine"}')]);
r = await run();
check('blocked prompt: retried', r.text?.includes('fine') && calls.length === 2);

fakeFetch([{ status: 200, body: { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }] }, finishReason: 'STOP' }] } }]);
r = await run();
check('only thought parts = empty answer', r.error?.reason === 'empty' && G.errorDetail(r.error) === 'AI: empty answer');

fakeFetch([answer('{"message":"x"}', 'SAFETY'), answer('{"message":"y"}')]);
r = await run();
check('finishReason other than STOP is retried', r.text?.includes('"y"') && calls.length === 2);

// ---------- HTTP errors ----------
fakeFetch([httpError(400, 'Invalid JSON payload: unknown field responseSchema.foo (schema)'), answer('{"message":"ok"}')]);
r = await run();
check('400 about schema: retried without thinking', r.text && calls.length === 2 && !calls[1].thinking);

fakeFetch([httpError(400, 'thinking_level is not supported by this model'), httpError(400, 'Invalid schema: nullable'), answer('{"message":"ok"}')]);
r = await run();
check('400 twice: last try uses plain JSON mode', r.text && calls.length === 3 && calls[2].schema === 'json' && !calls[2].thinking);

fakeFetch([httpError(400, 'Request contains an invalid argument.')]);
r = await run();
check('400 about something else: not retried', r.error?.status === 400 && calls.length === 1 && G.errorDetail(r.error) === 'AI 400');

fakeFetch([httpError(400, 'API key not valid. Please pass a valid API key.')]);
r = await run();
check('bad key (400): config, one call, fixed text', r.error?.status === 'config' && r.error.message === G.CONFIG_TEXT && calls.length === 1);

fakeFetch([httpError(403, 'Permission denied')]);
r = await run();
check('403: config, no raw text', r.error?.status === 'config' && !r.error.message.includes('Permission') && calls.length === 1);

fakeFetch([httpError(401, 'unauthenticated')]);
r = await run();
check('401: config', r.error?.status === 'config' && calls.length === 1);

fakeFetch([(c) => (c.model === 'gemini-3.5-flash' ? httpError(404, 'models/x is not found') : answer('{"message":"backup"}'))]);
r = await run();
check('wrong primary model name (404): the fallback model still answers', r.text?.includes('backup') && models() === 'gemini-3.5-flash,gemini-3.5-flash-lite');

fakeFetch([httpError(404, 'models/x is not found')]);
r = await run();
check('wrong model names everywhere: config', r.error?.status === 'config' && calls.length === 2);

fakeFetch([httpError(503, 'The model is overloaded'), answer('{"message":"backup"}')]);
r = await run();
check('503: the fallback model answers (no retry on the same model)', r.text?.includes('backup') && models() === 'gemini-3.5-flash,gemini-3.5-flash-lite');

fakeFetch([httpError(503, 'overloaded')]);
r = await run();
check('503 everywhere: error detail is generic', r.error?.status === 503 && G.errorDetail(r.error) === 'AI 503' && !G.errorDetail(r.error).includes('overloaded'));

fakeFetch([httpError(429, 'quota')]);
r = await run();
check('429 on both: status 429 reaches the route', r.error?.status === 429);

// ---------- timeout ----------
fakeFetch([throws('TimeoutError'), answer('{"message":"backup"}')]);
r = await run();
check('timeout: the fallback model answers', r.text?.includes('backup') && calls.length === 2);

fakeFetch([throws('TimeoutError')]);
r = await run();
check('timeout everywhere: 504', r.error?.status === 504 && G.errorDetail(r.error) === 'AI: timeout');

fakeFetch([answer('{"message":"ok"}')]);
r = await run({ deadline: Date.now() + 1000 });
check('no time left: 504 without calling the AI', r.error?.status === 504 && calls.length === 0);

// ---------- coach settings vs tutor settings ----------
for (const k of ['COACH_MODEL', 'COACH_FALLBACK_MODEL', 'COACH_THINKING']) delete process.env[k];
fakeFetch([answer('{"message":"ok"}')]);
await run();
check('tutor (no override): GEMINI_MODEL and low thinking', calls[0].model === 'gemini-3.5-flash' && calls[0].thinking === 'low');

let cs = G.coachModelSettings();
check('coach defaults: tutor model, medium thinking, no fallback (same model)', cs.model === 'gemini-3.5-flash' && cs.thinking === 'medium' && cs.fallback === null);
fakeFetch([answer('{"message":"ok"}')]);
await run(cs);
check('coach default call: model gemini-3.5-flash, thinking medium', calls[0].model === 'gemini-3.5-flash' && calls[0].thinking === 'medium');

process.env.COACH_MODEL = 'gemini-3.5-pro';
process.env.COACH_THINKING = 'HIGH';
cs = G.coachModelSettings();
check('coach env: model, high thinking, fallback never "lite"', cs.model === 'gemini-3.5-pro' && cs.thinking === 'high' && cs.fallback === 'gemini-3.5-flash');
fakeFetch([httpError(503, 'busy'), answer('{"message":"backup"}')]);
r = await run(cs);
check('coach: pro model first, then gemini-3.5-flash with the same thinking', r.text && models() === 'gemini-3.5-pro,gemini-3.5-flash' && calls[0].thinking === 'high' && calls[1].thinking === 'high');
fakeFetch([httpError(400, 'thinking level not supported'), answer('{"message":"ok"}')]);
r = await run(cs);
check('coach: model rejects the thinking level (400) → retried without thinking', r.text && calls[0].thinking === 'high' && calls[1].thinking === null && calls[1].model === 'gemini-3.5-pro');
fakeFetch([answer('{"message":"ok"}')]);
await run({}); // the tutor in the same process is not affected by COACH_* variables
check('tutor is unchanged while COACH_* is set', calls[0].model === 'gemini-3.5-flash' && calls[0].thinking === 'low');
process.env.COACH_THINKING = 'extreme';
check('coach: unknown thinking value = medium', G.coachModelSettings().thinking === 'medium');
for (const k of ['COACH_MODEL', 'COACH_FALLBACK_MODEL', 'COACH_THINKING']) delete process.env[k];

// ---------- coach on quota (429): the tutor's lite model answers that one call ----------
delete process.env.GEMINI_FALLBACK_MODEL;
cs = G.coachModelSettings();
fakeFetch([httpError(429, 'quota'), answer('{"message":"lite"}')]);
r = await run(cs);
check('coach 429, no COACH_FALLBACK_MODEL: falls back to gemini-3.5-flash-lite', r.text && models() === 'gemini-3.5-flash,gemini-3.5-flash-lite', models());
fakeFetch([httpError(503, 'busy'), answer('{"message":"lite"}')]);
r = await run(cs);
check('coach 503 (not quota): still no lite model', r.error?.status === 503 && models() === 'gemini-3.5-flash', models());
process.env.COACH_FALLBACK_MODEL = 'gemini-3.5-flash';
cs = G.coachModelSettings();
fakeFetch([httpError(429, 'quota')]);
r = await run(cs);
check('coach 429 with COACH_FALLBACK_MODEL set: no lite model', r.error?.status === 429 && !models().includes('lite'), models());
delete process.env.COACH_FALLBACK_MODEL;
process.env.COACH_MODEL = 'gemini-3.5-pro';
cs = G.coachModelSettings();
fakeFetch([httpError(429, 'quota'), httpError(429, 'quota'), answer('{"message":"lite"}')]);
r = await run(cs);
check('coach pro 429 → flash 429 → lite', r.text && models() === 'gemini-3.5-pro,gemini-3.5-flash,gemini-3.5-flash-lite', models());
delete process.env.COACH_MODEL;

// ---------- tutor speed: at most one retry, only for a true near-duplicate, never an error ----------
const N = await import('../lib/novelty.js');
const draft = (line, extra = {}) => JSON.stringify({ message: 'x', exercise: { number: 2, type: 'Satz', line }, ...extra });
const FRESH = 'Schreib eine kurze E-Mail an deine Vermieterin, weil die Heizung im Schlafzimmer seit gestern nicht mehr warm wird.';
const MECH = 'Auf der Strasse: ___ (jung + der Unbekannte) · Dativ';
const OLD = 'Du bist im Restaurant und bestellst für dich und deine Freundin zwei Gerichte und ein Getränk beim Kellner.';
const OLD_SIMILAR = 'Du bist im Restaurant und bestellst für dich und deinen Freund zwei Gerichte und ein Getränk beim Kellner.';
const tutor = async (steps, over = {}) => {
  fakeFetch(steps.map((d) => (typeof d === 'string' ? answer(d) : d)));
  quiet(true);
  try {
    const out = await N.draftWithNoveltyRetry({
      ask: (extra = '') => G.generate({ system: `s${extra}`, contents: [{ role: 'user', parts: [{ text: 'hi' }] }], schema: SCHEMA }),
      parse: R.parseModelJson, previous: [OLD], deadline: Date.now() + 55_000, log: () => {}, ...over,
    });
    return { out };
  } catch (error) {
    return { error };
  } finally {
    quiet(false);
  }
};
check('the mechanical format is still detected (but costs no second call)', N.hasMechanicalExerciseFormat(MECH));
let t = await tutor([draft(MECH), draft(FRESH)]);
check('mechanical-format draft: accepted, exactly one AI call', t.out === draft(MECH) && calls.length === 1);
t = await tutor([draft(FRESH)]);
check('fresh draft: one AI call', t.out === draft(FRESH) && calls.length === 1);
t = await tutor([draft(OLD_SIMILAR), draft(FRESH)]);
check('near-duplicate: one retry, the new draft is used', t.out === draft(FRESH) && calls.length === 2);
t = await tutor([draft(OLD_SIMILAR), draft(OLD_SIMILAR), draft(FRESH)]);
check('near-duplicate twice: at most one retry, no error, a draft comes back', typeof t.out === 'string' && calls.length === 2 && !t.error);
t = await tutor([draft(OLD_SIMILAR), draft(FRESH)], { deadline: Date.now() + 10_000 });
check('near-duplicate with little time left: no retry, draft accepted', t.out === draft(OLD_SIMILAR) && calls.length === 1);
t = await tutor([draft(OLD_SIMILAR), httpError(503, 'busy')]);
check('near-duplicate, retry fails: the first draft is kept (no error)', t.out === draft(OLD_SIMILAR) && !t.error);
t = await tutor([draft(OLD_SIMILAR), 'not json at all']);
check('near-duplicate, retry unreadable: the first draft is kept', t.out === draft(OLD_SIMILAR) && calls.length === 2);
t = await tutor([draft(OLD)], { openLine: OLD });
check('same open task again without feedback: no retry', calls.length === 1 && t.out === draft(OLD));

// ---------- parseModelJson ----------
check('parseModelJson: plain', R.parseModelJson('{"a":1}')?.a === 1);
check('parseModelJson: ```json fence', R.parseModelJson('```json\n{"a":1}\n```')?.a === 1);
check('parseModelJson: text around the object', R.parseModelJson('Here: {"a":2} done')?.a === 2);
check('parseModelJson: garbage and cut-off give null', R.parseModelJson('nothing') === null && R.parseModelJson('{"message":"cut') === null && R.parseModelJson('') === null);

// ---------- salvageMessage ----------
check('salvageMessage: closed message', R.salvageMessage('{"message":"Hallo Welt","feedback":') === 'Hallo Welt');
check('salvageMessage: escapes', R.salvageMessage('{"message":"Er sagt \\"ja\\"\\nNeu","x":') === 'Er sagt "ja"\nNeu');
check('salvageMessage: message that never closes', R.salvageMessage('{"message":"Hallo, das ist ein langer Sat') === 'Hallo, das ist ein langer Sat');
check('salvageMessage: cut inside an escape', R.salvageMessage('{"message":"Grüße \\u00') === 'Grüße');
check('salvageMessage: cut after a backslash', R.salvageMessage('{"message":"Test\\') === 'Test');
check('salvageMessage: nothing to rescue', R.salvageMessage('{"feedback":null}') === null && R.salvageMessage('{"message":"') === null && R.salvageMessage('') === null);

// ---------- normalizeReply ----------
const ctx = { level: 'A2', difficulty: 'medium', topicIds: new Set(['free', 'lektion-01-dativ']), topicId: 'lektion-01-dativ', wordIds: new Set(['w1']), openTask: null };
const n1 = R.normalizeReply({
  message: ' Gut! ',
  feedback: { forNumber: 2, correct: false, studentAnswer: 'ich gehe in die Schule', corrected: 'ich gehe in der Schule', changedWords: ['in der'], explanation: 'Wo? → Dativ', rule: 'Dativ (Wo?)', errorType: 'Kasus' },
  exercise: { number: 3, type: 'Lückentext', line: '„Ich wohne ___ Haus."', hint: null, wordId: 'w1' },
  options: ['a', 'a', 'b'],
  session: { topicId: 'lektion-01-dativ', topicName: 'Dativ', level: 'B1', difficulty: 'Schwer', finished: false },
}, ctx);
check('normalizeReply: message trimmed, feedback mapped', n1?.message === 'Gut!' && n1.feedback.errorType === 'case' && n1.feedback.correct === false);
check('normalizeReply: exercise cleaned, word task set, options unique', n1?.exercise.type === 'gapfill' && !n1.exercise.line.includes('„') && n1.exercise.wordId === 'w1' && n1.exercise.task === 'grammar' && n1.options.length === 2);
check('normalizeReply: session values mapped', n1?.session.level === 'B1' && n1.session.difficulty === 'hard');
check('normalizeReply: nothing usable gives null', R.normalizeReply({}, ctx) === null && R.normalizeReply(null, ctx) === null && R.normalizeReply([], ctx) === null);
const n2 = R.normalizeReply({ message: 'x', exercise: { number: 1, type: 'Karteikarte', line: 'der Tisch', wordId: 'nope' }, feedback: { forNumber: 1, correct: false, studentAnswer: 'a', corrected: 'b', explanation: '', rule: '', errorType: 'Kasus' } }, { ...ctx, openTask: 'flashcard' });
check('normalizeReply: unknown wordId dropped, wrong flashcard = vocab, direction guessed', n2?.exercise.wordId === undefined && n2.feedback.errorType === 'vocab' && n2.exercise.direction === 'de-en');

// ---------- the coach: one number for the changes, a note when the plan is lost ----------
const prompt = CP.buildCoachPrompt({ name: 'Test', context: '(no data)' });
check('coach prompt: the coach proposes goals and never writes names', /proposeGoal/.test(prompt) && /never write names or titles/.test(prompt) && !/"add" a milestone/.test(prompt));
const nc = C.normalizeCoach({ message: 'Here is a plan.', proposeGoal: { template: 'nope' }, suggestedSession: null, quickReplies: [] }, { topics: [], actions: { goalProposal: null, planChanges: null, note: C.PLAN_UNREADABLE_NOTE } });
check('normalizeCoach: an unusable proposal adds a short note (no silent missing card)', nc?.goalProposal === null && nc.message.includes(C.PLAN_UNREADABLE_NOTE));
const nc2 = C.normalizeCoach({ message: 'Just a tip.', planChanges: null }, { topics: [] });
check('normalizeCoach: nothing proposed = no note', nc2?.message === 'Just a tip.' && nc2.goalProposal === null && nc2.planChanges === null);
check('startsPlanChanges: sees a cut-off proposal', C.startsPlanChanges('{"message":"a","planChanges":{"goalId":"g1","minu') && C.startsPlanChanges('{"message":"a","proposeGoal":{"template":"ex') && !C.startsPlanChanges('{"message":"a","planChanges":null}'));

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll Gemini checks passed.');
process.exit(failed ? 1 : 0);
