// The guards /api/chat and /api/coach share (server only): same-origin check, body size limit, JSON parse,
// and errors that are always JSON { error, code, detail? }.
//
// The browser only ever gets a fixed short CODE (and, small under the error, a short reason code such as
// 'db', 'ai-403', 'timeout', 'crash'). The page turns the code into a sentence (lib/ui-text.js). The full
// message of an error stays in the server log. Logs never contain the AI's reply text or a student's answer.

// Pages on other websites must not be able to use the app's routes with the student's cookie.
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetches without Origin (old browsers, curl)
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export const MAX_BYTES_CHAT = 150_000;

const REASONS = /^[a-z0-9-]{1,16}$/;

export function fail(code, status, detail) {
  const body = { error: code, code };
  if (detail && REASONS.test(detail)) body.detail = detail;
  return Response.json(body, { status });
}

// A short, fixed reason for an error, safe to show: never a host name, a key or the AI's own words.
export function reasonCode(e) {
  if (e?.code === 'data_timeout' || e?.reason === 'timeout') return 'timeout';
  switch (e?.reason) {
    case 'empty': return 'ai-empty';
    case 'cut_off': return 'ai-cut';
    case 'blocked': return 'ai-blocked';
    case 'network': return 'ai-network';
    default:
  }
  if (typeof e?.httpStatus === 'number') return `ai-${e.httpStatus}`;
  if (typeof e?.status === 'number' && e.reason) return `ai-${e.status}`;
  if (isDatabaseError(e)) return 'db';
  return 'crash';
}

function isDatabaseError(e) {
  if (!e) return false;
  if (/^(ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)/.test(String(e.code || e.cause?.code || ''))) return true;
  return /neon|postgres|database|\bpg\b|fetch failed/i.test(`${e.name} ${e.message} ${e.cause?.message || ''}`);
}

// What a log may say about the AI's reply: its length and whether it looks like JSON (never the text).
export const replyShape = (text) => `length ${String(text ?? '').length}, ${String(text ?? '').trimStart().startsWith('{') ? 'starts with {' : 'does not start with {'}`;

// → { body } (a JSON object) or { response } (an error to return at once)
export async function readJsonBody(req, maxBytes) {
  if (!sameOrigin(req)) return { response: fail('origin', 403) };
  if (Number(req.headers.get('content-length')) > maxBytes) return { response: fail('too_big', 413) };
  const raw = await req.text();
  if (raw.length > maxBytes) return { response: fail('too_big', 413) };
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { response: fail('bad_body', 400) };
  return { body };
}
