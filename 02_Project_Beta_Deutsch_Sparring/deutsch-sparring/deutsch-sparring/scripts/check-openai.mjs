// Checks the AI safety nets (lib/openai.js) with a fake `fetch` (no key, no network), and the answer cleaning
// in lib/reply.js (parseModelJson, salvageMessage, normalizeReply). Plain node:
//   node scripts/check-openai.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const O = await import('../lib/openai.js');
const R = await import('../lib/reply.js');
const C = await import('../lib/coach.js');
const CP = await import('../lib/coach-prompt.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

// ---------- fake OpenAI Responses API ----------
const answer = (text, status = 'completed', extra = {}) => ({
  status: 200,
  body: {
    status,
    output: text === null ? [] : [{ type: 'message', content: [{ type: 'output_text', text }] }],
    usage: { input_tokens: 10, output_tokens: 5, output_tokens_details: { reasoning_tokens: 1 } },
    ...extra,
  },
});
const refusal = (text = 'I cannot help with that.') => ({
  status: 200,
  body: { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: text }] }] },
});
const httpError = (status, message, code = '') => ({ status, body: { error: { message, code } } });
const throws = (name) => ({ throws: Object.assign(new Error(name), { name }) });

let calls = [];
// script = one step per call, in order; a function step gets the call and returns a step
function fakeFetch(script) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const call = {
      url: String(url),
      model: body.model,
      reasoning: body.reasoning?.effort || null,
      schema: body.text?.format?.type === 'json_schema' ? 'strict' : body.text?.format?.type === 'json_object' ? 'json' : 'none',
      schemaName: body.text?.format?.name,
      store: body.store,
      temperature: body.temperature,
      authorization: init.headers.authorization,
    };
    calls.push(call);
    let step = script[Math.min(calls.length - 1, script.length - 1)];
    if (typeof step === 'function') step = step(call);
    if (step.throws) throw step.throws;
    return { ok: step.status < 400, status: step.status, headers: { get: () => 'req_test' }, json: async () => step.body };
  };
}

process.env.OPENAI_API_KEY = 'test-key-not-real';
process.env.OPENAI_MODEL = 'gpt-6-luna';
process.env.OPENAI_FALLBACK_MODEL = 'gpt-5.6-luna';
const realLog = console.log;
const quiet = (on) => { console.log = on ? () => {} : realLog; };
const SCHEMA = { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false };
function strictSchema(node) {
  if (!node || typeof node !== 'object') return true;
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes('object')) {
    const keys = Object.keys(node.properties || {});
    if (node.additionalProperties !== false || keys.some((key) => !node.required?.includes(key))) return false;
    if (!keys.every((key) => strictSchema(node.properties[key]))) return false;
  }
  if (types.includes('array') && !strictSchema(node.items)) return false;
  if (types.includes('null') && node.enum && !node.enum.includes(null)) return false;
  return true;
}
const run = async (opts = {}) => {
  quiet(true);
  try {
    return { text: await O.generate({ system: 's', messages: [{ role: 'user', content: 'hi' }], schema: SCHEMA, schemaName: 'test_reply', ...opts }) };
  } catch (error) {
    return { error };
  } finally {
    quiet(false);
  }
};
const models = () => calls.map((c) => c.model).join(',');

// ---------- the happy path and request shape ----------
fakeFetch([answer('{"message":"ok"}')]);
let r = await run();
check('good answer: Responses API, low reasoning, strict named schema', r.text === '{"message":"ok"}' && calls.length === 1 && calls[0].url.endsWith('/v1/responses') && calls[0].reasoning === 'low' && calls[0].schema === 'strict' && calls[0].schemaName === 'test_reply');
check('privacy and auth: store false, bearer key, no temperature', calls[0].store === false && calls[0].authorization === 'Bearer test-key-not-real' && calls[0].temperature === undefined);
check('tutor and coach schemas meet strict Structured Outputs rules', strictSchema(R.RESPONSE_SCHEMA) && strictSchema(CP.COACH_SCHEMA));

// ---------- empty, cut-off, blocked ----------
fakeFetch([answer(null), answer('{"message":"second try"}')]);
r = await run();
check('empty answer: retried once with reasoning disabled, then ok', r.text?.includes('second try') && calls.length === 2 && calls[0].reasoning === 'low' && calls[1].reasoning === 'none' && models() === 'gpt-6-luna,gpt-6-luna');

fakeFetch([answer('{"message":"Hallo, das ist', 'incomplete', { incomplete_details: { reason: 'max_output_tokens' } }), answer('{"message":"complete"}')]);
r = await run();
check('max_output_tokens: treated as failure, retried without reasoning', r.text?.includes('complete') && calls.length === 2 && calls[1].reasoning === 'none');

fakeFetch([answer(null, 'incomplete', { incomplete_details: { reason: 'max_output_tokens' } }), answer(null, 'incomplete', { incomplete_details: { reason: 'max_output_tokens' } }), answer('{"message":"from backup"}')]);
r = await run();
check('empty twice: the fallback model answers', r.text?.includes('from backup') && models() === 'gpt-6-luna,gpt-6-luna,gpt-5.6-luna');

fakeFetch([answer('{"message":"cut', 'incomplete', { incomplete_details: { reason: 'max_output_tokens' } })]);
r = await run();
check('cut off everywhere: error 502 with a short reason and the partial text',
  r.error?.status === 502 && r.error.reason === 'cut_off' && O.errorDetail(r.error) === 'AI: cut off' && r.error.partial === '{"message":"cut' && calls.length === 4, `${r.error?.status} ${calls.length}`);

fakeFetch([refusal(), answer('{"message":"fine"}')]);
r = await run();
check('refusal: retried', r.text?.includes('fine') && calls.length === 2);

fakeFetch([{ status: 200, body: { status: 'completed', output: [{ type: 'reasoning', content: [] }] } }]);
r = await run();
check('only reasoning items = empty answer', r.error?.reason === 'empty' && O.errorDetail(r.error) === 'AI: empty answer');

fakeFetch([answer('{"message":"x"}', 'failed'), answer('{"message":"y"}')]);
r = await run();
check('non-completed status is retried', r.text?.includes('"y"') && calls.length === 2);

// ---------- HTTP errors ----------
fakeFetch([httpError(400, 'Invalid schema in text.format'), answer('{"message":"ok"}')]);
r = await run();
check('400 about schema: retried without reasoning', r.text && calls.length === 2 && calls[1].reasoning === 'none');

fakeFetch([httpError(400, 'reasoning effort is not supported'), httpError(400, 'Invalid schema'), httpError(400, 'Invalid schema'), answer('{"message":"ok"}')]);
r = await run();
check('settings rejected: final try omits reasoning and uses JSON mode', r.text && calls.length === 4 && calls[3].schema === 'json' && calls[3].reasoning === null);

fakeFetch([httpError(400, 'Request contains an invalid argument.')]);
r = await run();
check('400 about something else: not retried', r.error?.status === 400 && calls.length === 1 && O.errorDetail(r.error) === 'AI 400');

fakeFetch([httpError(400, 'Incorrect API key provided.', 'invalid_api_key')]);
r = await run();
check('bad key (400): config, one call, fixed text', r.error?.status === 'config' && r.error.message === O.CONFIG_TEXT && calls.length === 1);

fakeFetch([httpError(403, 'Permission denied')]);
r = await run();
check('403: config, no raw text', r.error?.status === 'config' && !r.error.message.includes('Permission') && calls.length === 1);

fakeFetch([httpError(401, 'unauthenticated')]);
r = await run();
check('401: config', r.error?.status === 'config' && calls.length === 1);

fakeFetch([(c) => (c.model === 'gpt-6-luna' ? httpError(404, 'model is not found', 'model_not_found') : answer('{"message":"backup"}'))]);
r = await run();
check('wrong primary model name (404): the fallback model still answers', r.text?.includes('backup') && models() === 'gpt-6-luna,gpt-5.6-luna');

fakeFetch([httpError(404, 'models/x is not found')]);
r = await run();
check('wrong model names everywhere: config', r.error?.status === 'config' && calls.length === 2);

fakeFetch([httpError(503, 'The model is overloaded'), answer('{"message":"backup"}')]);
r = await run();
check('503: the fallback model answers (no retry on the same model)', r.text?.includes('backup') && models() === 'gpt-6-luna,gpt-5.6-luna');

fakeFetch([httpError(503, 'overloaded')]);
r = await run();
check('503 everywhere: error detail is generic', r.error?.status === 503 && O.errorDetail(r.error) === 'AI 503' && !O.errorDetail(r.error).includes('overloaded'));

fakeFetch([httpError(429, 'quota')]);
r = await run();
check('429 on both: status 429 reaches the route', r.error?.status === 429);

// ---------- timeout ----------
fakeFetch([throws('TimeoutError'), answer('{"message":"backup"}')]);
r = await run();
check('timeout: the fallback model answers', r.text?.includes('backup') && calls.length === 2);

fakeFetch([throws('TimeoutError')]);
r = await run();
check('timeout everywhere: 504', r.error?.status === 504 && O.errorDetail(r.error) === 'AI: timeout');

fakeFetch([answer('{"message":"ok"}')]);
r = await run({ deadline: Date.now() + 1000 });
check('no time left: 504 without calling the AI', r.error?.status === 504 && calls.length === 0);

// ---------- coach settings vs tutor settings ----------
for (const k of ['COACH_MODEL', 'COACH_FALLBACK_MODEL', 'COACH_REASONING']) delete process.env[k];
fakeFetch([answer('{"message":"ok"}')]);
await run();
check('tutor (no override): OPENAI_MODEL and low reasoning', calls[0].model === 'gpt-6-luna' && calls[0].reasoning === 'low');

let cs = O.coachModelSettings();
check('coach defaults: tutor model, medium reasoning, no fallback', cs.model === 'gpt-6-luna' && cs.reasoning === 'medium' && cs.fallback === null);
fakeFetch([answer('{"message":"ok"}')]);
await run(cs);
check('coach default call: gpt-6-luna, medium reasoning', calls[0].model === 'gpt-6-luna' && calls[0].reasoning === 'medium');

process.env.COACH_MODEL = 'gpt-6.1-sol';
process.env.COACH_FALLBACK_MODEL = 'gpt-5.6-luna';
process.env.COACH_REASONING = 'HIGH';
cs = O.coachModelSettings();
check('coach env: model, fallback and reasoning', cs.model === 'gpt-6.1-sol' && cs.reasoning === 'high' && cs.fallback === 'gpt-5.6-luna');
fakeFetch([httpError(503, 'busy'), answer('{"message":"backup"}')]);
r = await run(cs);
check('coach: stronger model first, then fallback with same reasoning', r.text && models() === 'gpt-6.1-sol,gpt-5.6-luna' && calls[0].reasoning === 'high' && calls[1].reasoning === 'high');
fakeFetch([httpError(400, 'reasoning effort not supported'), httpError(400, 'none is not supported for reasoning'), answer('{"message":"ok"}')]);
r = await run(cs);
check('coach: rejected reasoning values → retry omits the setting', r.text && calls[0].reasoning === 'high' && calls[1].reasoning === 'none' && calls[2].reasoning === null && calls[2].model === 'gpt-6.1-sol');
fakeFetch([answer('{"message":"ok"}')]);
await run({}); // the tutor in the same process is not affected by COACH_* variables
check('tutor is unchanged while COACH_* is set', calls[0].model === 'gpt-6-luna' && calls[0].reasoning === 'low');
process.env.COACH_REASONING = 'extreme';
check('coach: unknown reasoning value = medium', O.coachModelSettings().reasoning === 'medium');
for (const k of ['COACH_MODEL', 'COACH_FALLBACK_MODEL', 'COACH_REASONING']) delete process.env[k];

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
check('coach prompt: "at most N changes" comes from MAX_CHANGES, and no other number', prompt.includes(`at most ${C.MAX_CHANGES} changes`) && !/at most 6 changes/.test(prompt));
const goalsList = [{ id: 'g1', milestones: [], startDate: '2026-10-01', endDate: '2026-12-31', level: 'B1', title: 'x', type: 'exam', scope: { section: null, list: null, rules: [] } }];
const nc = C.normalizeCoach({ message: 'Here is a plan.', planChanges: { goalId: 'g1', changes: [{ action: 'remove', milestoneId: 'nope' }] }, suggestedSession: null, quickReplies: [] }, { topics: [], goals: goalsList, today: '2026-10-20' });
check('normalizeCoach: unusable planChanges add a short note (no silent missing Apply box)', nc?.planChanges === null && nc.message.includes(C.PLAN_UNREADABLE_NOTE));
const nc2 = C.normalizeCoach({ message: 'Just a tip.', planChanges: null }, { topics: [], goals: goalsList, today: '2026-10-20' });
check('normalizeCoach: no plan proposed = no note', nc2?.message === 'Just a tip.');
check('startsPlanChanges: sees a cut-off plan proposal', C.startsPlanChanges('{"message":"a","planChanges":{"goalId":"g1","changes":[{"act') && !C.startsPlanChanges('{"message":"a","planChanges":null}'));

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll OpenAI checks passed.');
process.exit(failed ? 1 : 0);
