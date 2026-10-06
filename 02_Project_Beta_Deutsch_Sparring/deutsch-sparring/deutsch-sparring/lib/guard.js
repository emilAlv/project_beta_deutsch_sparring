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

// The network address – a whole class behind one school network shares it.
export function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
}

// One student = network address + the random id their browser keeps (wort_profile.clientId).
export function studentKey(req, clientId) {
  const id = String(clientId || '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'anon';
  return `${clientIp(req)}#${id}`;
}

// Simple daily counters (memory only: they reset when the server restarts; good enough for a class).
const counters = new Map();
function current(bucket, key) {
  const day = new Date().toISOString().slice(0, 10);
  const entry = counters.get(`${bucket}:${key}`);
  return entry && entry.day === day ? entry : null;
}
function bump(bucket, key) {
  const entry = current(bucket, key);
  if (entry) entry.n += 1;
  else counters.set(`${bucket}:${key}`, { day: new Date().toISOString().slice(0, 10), n: 1 });
}
const used = (bucket, key) => current(bucket, key)?.n || 0;

// Messages per student per day (DAILY_LIMIT, default 150), plus a generous ceiling for the
// whole network (40 students' worth) so one school network is never locked out by itself.
export function overDailyLimit(req, clientId) {
  const limit = Number(process.env.DAILY_LIMIT || 150);
  const student = studentKey(req, clientId);
  const ip = clientIp(req);
  if (used('chat', student) >= limit || used('chat-net', ip) >= limit * 40) return true;
  bump('chat', student);
  bump('chat-net', ip);
  return false;
}

// Guessing the class code: only WRONG tries count (30 per student, 300 per network per day).
export function tooManyCodeTries(req, clientId) {
  return used('code', studentKey(req, clientId)) >= 30 || used('code-net', clientIp(req)) >= 300;
}
export function countWrongCode(req, clientId) {
  bump('code', studentKey(req, clientId));
  bump('code-net', clientIp(req));
}
