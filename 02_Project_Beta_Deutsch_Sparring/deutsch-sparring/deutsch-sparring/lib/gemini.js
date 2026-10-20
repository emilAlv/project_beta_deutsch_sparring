// Calls Google Gemini over REST, with the safety nets we need on Vercel:
// - every model call stops after 25 s, and all calls together stay under the route's maxDuration
// - "low thinking" for fast answers; if a model rejects a setting (HTTP 400 about schema/thinking), retry without it
// - an empty, blocked or cut-off answer is retried once without thinking (thinking uses up the token budget)
// - a fallback model when the main one is busy, slow, missing or keeps giving bad answers
// - setup mistakes (wrong key, wrong model name) are told apart from outages: status 'config', never retried

const CALL_TIMEOUT_MS = 25_000;
const FALLBACK_ON = [429, 500, 502, 503, 504];
export const CONFIG_TEXT = 'The AI key or model name on the server is wrong.';

export class ModelError extends Error {
  // status: HTTP-like number, or 'config' for a setup mistake (then httpStatus is the real HTTP status)
  // reason: 'empty' | 'cut_off' | 'blocked' | 'http' | 'timeout' | 'network' (what went wrong, never the AI's text)
  // partial: the text of a cut-off answer, so a route can still rescue the message
  constructor(message, status, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// A short, generic reason for the small detail line under an error (no raw messages from Google or the database).
export function errorDetail(e) {
  switch (e?.reason) {
    case 'empty': return 'AI: empty answer';
    case 'cut_off': return 'AI: cut off';
    case 'blocked': return 'AI: blocked';
    case 'timeout': return 'AI: timeout';
    case 'network': return 'AI: no connection';
    default: return `AI ${e?.httpStatus || (typeof e?.status === 'number' ? e.status : '?')}`;
  }
}

// Gemini 3.x: Google advises to keep the default temperature (1.0), lower values can make it loop.
// Other models: 0.7. GEMINI_TEMPERATURE (a number) overrides this for every model.
export function temperatureFor(model) {
  const env = process.env.GEMINI_TEMPERATURE;
  if (env !== undefined && env !== '' && Number.isFinite(Number(env))) return Number(env);
  return /^gemini-3/i.test(String(model)) ? undefined : 0.7;
}

// A 400 is only worth another try with simpler settings when it is about the schema or thinking.
const SIMPLER_SETTINGS_400 = /schema|thinking|response_?mime|json mode/i;
const BAD_KEY_400 = /api key|api_key|key not valid/i;

function msLeft(deadline) {
  return deadline ? deadline - Date.now() : CALL_TIMEOUT_MS;
}

async function callOnce(model, { system, contents, schema, thinking, deadline }) {
  const timeout = Math.min(CALL_TIMEOUT_MS, msLeft(deadline));
  if (timeout < 3000) throw new ModelError('Keine Zeit mehr für einen weiteren Versuch.', 504, { reason: 'timeout' });

  const generationConfig = { maxOutputTokens: 8192 }; // thinking counts too: room for a long JSON answer
  const temperature = temperatureFor(model);
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };
  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    if (schema !== true) generationConfig.responseSchema = schema;
  }

  let res;
  try {
    res = await fetch(
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
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeout),
      }
    );
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new ModelError(timedOut ? `${model} hat zu lange gebraucht.` : 'Netzwerkfehler', timedOut ? 504 : 503, { reason: timedOut ? 'timeout' : 'network' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data?.error?.message || '');
    // a wrong key, no access or an unknown model is a setup mistake, not an outage
    if ([401, 403, 404].includes(res.status) || (res.status === 400 && BAD_KEY_400.test(msg))) {
      throw new ModelError(CONFIG_TEXT, 'config', { httpStatus: res.status, reason: 'http' });
    }
    throw new ModelError(`Gemini error ${res.status}`, res.status, {
      reason: 'http',
      httpStatus: res.status,
      simplerHelps: res.status === 400 && SIMPLER_SETTINGS_400.test(msg),
    });
  }

  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
  const finishReason = candidate?.finishReason || null;
  const blockReason = data?.promptFeedback?.blockReason || null;
  const usage = data?.usageMetadata || {};
  // reasons and token numbers only, never the text
  console.log(`gemini ${model} finish=${finishReason || 'none'}${blockReason ? ` blocked=${blockReason}` : ''} thinking=${thinking || 'off'} tokens in=${usage.promptTokenCount ?? '?'} out=${usage.candidatesTokenCount ?? '?'} thoughts=${usage.thoughtsTokenCount ?? 0}`);

  const cutOff = finishReason === 'MAX_TOKENS';
  if (blockReason && !text) throw new ModelError('Antwort vom Modell blockiert', 502, { reason: 'blocked' });
  if (!text) throw new ModelError('Leere Antwort vom Modell', 502, { reason: cutOff ? 'cut_off' : 'empty' });
  // anything but STOP means the answer is not complete (cut off, filtered …)
  if (finishReason && finishReason !== 'STOP') {
    throw new ModelError('Antwort vom Modell unvollständig', 502, { reason: cutOff ? 'cut_off' : 'empty', partial: text });
  }
  return text;
}

// One model, simplest config last: full settings → without thinking → without the strict schema.
// - empty / cut-off / blocked answer (502): one more try without thinking, then give up on this model
// - HTTP 400 about schema or thinking: the next simpler setting
// - anything else: give up on this model (the caller may use the fallback model)
async function callModel(model, opts) {
  const variants = [{ thinking: opts.thinking || 'low', schema: opts.schema }, { thinking: false, schema: opts.schema }];
  if (opts.schema && opts.schema !== true) variants.push({ thinking: false, schema: true });

  let lastError;
  let badAnswerSeen = false;
  for (let i = 0; i < variants.length; i += 1) {
    try {
      return await callOnce(model, { ...opts, ...variants[i] });
    } catch (e) {
      lastError = e;
      if (e.status === 502 && !badAnswerSeen) {
        badAnswerSeen = true;
        if (i === 0) continue; // variant 1 has no thinking
      }
      if (e.status === 400 && e.simplerHelps) continue;
      throw e;
    }
  }
  throw lastError;
}

const THINKING_LEVELS = ['low', 'medium', 'high'];
const COACH_FALLBACK_DEFAULT = 'gemini-3.5-flash'; // the coach never falls back to a "lite" model

// The coach's own settings (it plans the learning, so it may use a stronger model than the tutor):
//   COACH_MODEL (default: the tutor's model), COACH_FALLBACK_MODEL (default: gemini-3.5-flash when the coach
//   model is something else, otherwise none), COACH_THINKING low | medium | high (default medium).
export function coachModelSettings() {
  const model = process.env.COACH_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fallback = process.env.COACH_FALLBACK_MODEL || (model !== COACH_FALLBACK_DEFAULT ? COACH_FALLBACK_DEFAULT : null);
  const level = String(process.env.COACH_THINKING || '').toLowerCase();
  return { model, fallback, thinking: THINKING_LEVELS.includes(level) ? level : 'medium' };
}

// schema: undefined = plain text, true = any JSON, object = Gemini responseSchema.
// Optional per-call settings: model, fallback (null = none), thinking 'low' | 'medium' | 'high'.
// The tutor passes none of them: GEMINI_MODEL, GEMINI_FALLBACK_MODEL and low thinking.
export async function generate({ system, contents, schema, deadline, model, fallback: fallbackModel, thinking }) {
  const primary = model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fallback = fallbackModel !== undefined ? fallbackModel : (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite');
  const opts = { system, contents, schema, deadline, thinking: THINKING_LEVELS.includes(thinking) ? thinking : 'low' };
  try {
    return await callModel(primary, opts);
  } catch (e) {
    // a model name that does not exist (404) may still be rescued by the fallback model
    const usable = FALLBACK_ON.includes(e.status) || (e.status === 'config' && e.httpStatus === 404);
    if (fallback && fallback !== primary && usable && msLeft(deadline) > 5000) {
      try {
        return await callModel(fallback, opts);
      } catch (e2) {
        throw e.status === 'config' ? e : e2;
      }
    }
    throw e;
  }
}
