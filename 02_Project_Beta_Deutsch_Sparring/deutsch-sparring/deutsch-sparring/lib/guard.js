import { timingSafeEqual } from 'crypto';

// Class code: only checked on the server. No CLASS_CODE set → everyone may use the app.
export function needsCode() {
  return Boolean(process.env.CLASS_CODE);
}

export function checkClassCode(code) {
  const expected = process.env.CLASS_CODE;
  if (!expected) return true;
  const a = Buffer.from(String(code ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clientKey(req) {
  return (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
}

// Simple per-person daily limits (memory only: resets when the server restarts; good enough for a class).
const counters = new Map();
function over(bucket, key, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const id = `${bucket}:${key}`;
  const entry = counters.get(id);
  if (!entry || entry.day !== day) {
    counters.set(id, { day, n: 1 });
    return false;
  }
  entry.n += 1;
  return entry.n > limit;
}

export function overDailyLimit(key) {
  return over('chat', key, Number(process.env.DAILY_LIMIT || 150));
}

// guessing the class code: 30 tries per day and person is plenty for typos
export function tooManyCodeTries(key) {
  return over('code', key, 30);
}
