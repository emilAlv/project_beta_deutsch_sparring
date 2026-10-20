// Calls the OpenAI Responses API over REST, with the safety nets we need on Vercel:
// - every model call stops after 25 s, and all calls together stay under the route's maxDuration
// - strict Structured Outputs for the tutor and coach; a schema/settings rejection is retried more simply
// - an empty, refused or cut-off answer is retried once with reasoning disabled
// - an optional fallback model when the main one is busy, slow, missing or keeps giving bad answers
// - setup mistakes (wrong key, no model access) are told apart from outages: status 'config', never retried

const CALL_TIMEOUT_MS = 25_000;
const FALLBACK_ON = [429, 500, 502, 503, 504];
export const CONFIG_TEXT = 'The AI key or model name on the server is wrong.';

export class ModelError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export function errorDetail(e) {
  switch (e?.reason) {
    case 'empty': return 'AI: empty answer';
    case 'cut_off': return 'AI: cut off';
    case 'blocked': return 'AI: refused';
    case 'timeout': return 'AI: timeout';
    case 'network': return 'AI: no connection';
    default: return `AI ${e?.httpStatus || (typeof e?.status === 'number' ? e.status : '?')}`;
  }
}

const SIMPLER_SETTINGS_400 = /schema|json|response.?format|text\.format|reasoning|unsupported (?:parameter|value)/i;
const BAD_CONFIG = /api key|authentication|model.*(?:not found|does not exist)|unknown model|do not have access/i;
const BAD_CONFIG_CODES = new Set(['invalid_api_key', 'model_not_found']);
const REASONING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

function msLeft(deadline) {
  return deadline ? deadline - Date.now() : CALL_TIMEOUT_MS;
}

function outputText(data) {
  return (Array.isArray(data?.output) ? data.output : [])
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

function refusalText(data) {
  return (Array.isArray(data?.output) ? data.output : [])
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .find((part) => part?.type === 'refusal')?.refusal || '';
}

function textFormat(schema, name) {
  if (!schema) return undefined;
  if (schema === true) return { type: 'json_object' };
  return { type: 'json_schema', name, strict: true, schema };
}

async function callOnce(model, { system, messages, schema, schemaName, reasoning, deadline }) {
  const timeout = Math.min(CALL_TIMEOUT_MS, msLeft(deadline));
  if (timeout < 3000) throw new ModelError('Keine Zeit mehr für einen weiteren Versuch.', 504, { reason: 'timeout' });

  const body = {
    model,
    store: false,
    instructions: system,
    input: messages,
    max_output_tokens: 8192,
  };
  if (reasoning) body.reasoning = { effort: reasoning };
  const format = textFormat(schema, schemaName);
  if (format) body.text = { format };

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new ModelError(timedOut ? `${model} hat zu lange gebraucht.` : 'Netzwerkfehler', timedOut ? 504 : 503, { reason: timedOut ? 'timeout' : 'network' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data?.error?.message || '');
    const code = String(data?.error?.code || '');
    if ([401, 403, 404].includes(res.status) || (res.status === 400 && (BAD_CONFIG.test(msg) || BAD_CONFIG_CODES.has(code)))) {
      throw new ModelError(CONFIG_TEXT, 'config', { httpStatus: res.status, reason: 'http' });
    }
    throw new ModelError(`OpenAI error ${res.status}`, res.status, {
      reason: 'http',
      httpStatus: res.status,
      simplerHelps: res.status === 400 && SIMPLER_SETTINGS_400.test(`${code} ${msg}`),
    });
  }

  const text = outputText(data);
  const refused = refusalText(data);
  const incompleteReason = data?.incomplete_details?.reason || null;
  const usage = data?.usage || {};
  const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens ?? 0;
  const requestId = res.headers?.get?.('x-request-id');
  console.log(`openai ${model} status=${data?.status || 'unknown'}${incompleteReason ? ` incomplete=${incompleteReason}` : ''} reasoning=${reasoning || 'default'} tokens in=${usage.input_tokens ?? '?'} out=${usage.output_tokens ?? '?'} thoughts=${reasoningTokens}${requestId ? ` request=${requestId}` : ''}`);

  if (refused) throw new ModelError('Antwort vom Modell abgelehnt', 502, { reason: 'blocked' });
  if (data?.status === 'incomplete') {
    const cutOff = incompleteReason === 'max_output_tokens';
    throw new ModelError('Antwort vom Modell unvollständig', 502, { reason: cutOff ? 'cut_off' : 'empty', partial: text || undefined });
  }
  if (data?.status && data.status !== 'completed') {
    throw new ModelError('Antwort vom Modell fehlgeschlagen', 502, { reason: 'empty', partial: text || undefined });
  }
  if (!text) throw new ModelError('Leere Antwort vom Modell', 502, { reason: 'empty' });
  return text;
}

async function callModel(model, opts) {
  const variants = [
    { reasoning: opts.reasoning || 'low', schema: opts.schema },
    ...(opts.reasoning === 'none' ? [] : [{ reasoning: 'none', schema: opts.schema }]),
    { reasoning: null, schema: opts.schema },
  ];
  if (opts.schema && opts.schema !== true) variants.push({ reasoning: null, schema: true });

  let lastError;
  let badAnswerSeen = false;
  for (let i = 0; i < variants.length; i += 1) {
    try {
      return await callOnce(model, { ...opts, ...variants[i] });
    } catch (e) {
      lastError = e;
      if (e.status === 502 && !badAnswerSeen) {
        badAnswerSeen = true;
        if (i === 0) continue;
      }
      if (e.status === 400 && e.simplerHelps) continue;
      throw e;
    }
  }
  throw lastError;
}

export function coachModelSettings() {
  const model = process.env.COACH_MODEL || process.env.OPENAI_MODEL || 'gpt-6-luna';
  const fallback = process.env.COACH_FALLBACK_MODEL || null;
  const level = String(process.env.COACH_REASONING || '').toLowerCase();
  return { model, fallback, reasoning: REASONING_LEVELS.includes(level) ? level : 'medium' };
}

// schema: undefined = plain text, true = JSON mode, object = strict JSON Schema.
export async function generate({ system, messages, schema, schemaName = 'app_response', deadline, model, fallback: fallbackModel, reasoning }) {
  const primary = model || process.env.OPENAI_MODEL || 'gpt-6-luna';
  const fallback = fallbackModel !== undefined ? fallbackModel : (process.env.OPENAI_FALLBACK_MODEL || null);
  const opts = {
    system,
    messages,
    schema,
    schemaName,
    deadline,
    reasoning: REASONING_LEVELS.includes(reasoning) ? reasoning : 'low',
  };
  try {
    return await callModel(primary, opts);
  } catch (e) {
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
