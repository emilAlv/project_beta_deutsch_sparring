// Calls Google Gemini over REST, with the safety nets we need on Vercel:
// - every model call stops after 25 s, and all calls together stay under the route's maxDuration
// - "low thinking" for fast answers; if a model rejects a setting (HTTP 400), retry without it
// - a fallback model when the main one is busy, slow or missing

const CALL_TIMEOUT_MS = 25_000;
const FALLBACK_ON = [404, 429, 500, 503, 504];

export class ModelError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function msLeft(deadline) {
  return deadline ? deadline - Date.now() : CALL_TIMEOUT_MS;
}

async function callOnce(model, { system, contents, schema, thinking, deadline }) {
  const timeout = Math.min(CALL_TIMEOUT_MS, msLeft(deadline));
  if (timeout < 3000) throw new ModelError('Keine Zeit mehr für einen weiteren Versuch.', 504);

  const generationConfig = { temperature: 0.7, maxOutputTokens: 4096 };
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
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
    throw new ModelError(timedOut ? `${model} hat zu lange gebraucht.` : `Netzwerkfehler: ${e?.message}`, timedOut ? 504 : 503);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ModelError(data?.error?.message || `Gemini error ${res.status}`, res.status);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
  if (!text) throw new ModelError('Leere Antwort vom Modell', 502);
  return text;
}

// One model, simplest config last: full settings → without thinking → without the strict schema.
async function callModel(model, opts) {
  const variants = [{ thinking: true, schema: opts.schema }, { thinking: false, schema: opts.schema }];
  if (opts.schema && opts.schema !== true) variants.push({ thinking: false, schema: true });

  let lastError;
  for (const v of variants) {
    try {
      return await callOnce(model, { ...opts, ...v });
    } catch (e) {
      lastError = e;
      if (e.status !== 400) throw e; // only a rejected setting is worth retrying with a simpler config
    }
  }
  throw lastError;
}

// schema: undefined = plain text, true = any JSON, object = Gemini responseSchema.
export async function generate({ system, contents, schema, deadline }) {
  const primary = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
  try {
    return await callModel(primary, { system, contents, schema, deadline });
  } catch (e) {
    if (fallback && fallback !== primary && FALLBACK_ON.includes(e.status) && msLeft(deadline) > 5000) {
      return await callModel(fallback, { system, contents, schema, deadline });
    }
    throw e;
  }
}
