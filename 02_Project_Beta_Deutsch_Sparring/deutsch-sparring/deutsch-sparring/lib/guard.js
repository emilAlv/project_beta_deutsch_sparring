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
// On globalThis so all routes of one server share them.
const counters = (globalThis.__wortCounters ??= new Map());
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
// With accounts the student is their user id (same limit on every device and network).
export function overDailyLimit(req, clientId, userId = null) {
  const limit = Number(process.env.DAILY_LIMIT || 150);
  const student = userId ? `user:${userId}` : studentKey(req, clientId);
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

// ---------- accounts: log-in and sign-up tries ----------
// Counted in short time windows, so a typo-prone student is only slowed down, never locked out
// for days, while guessing passwords stays far too slow to work. Memory only, like above.
const hits = (globalThis.__wortHits ??= new Map()); // key → timestamps
const MINUTE = 60_000;
const LIMITS = {
  loginUser: [10, 15 * MINUTE], // wrong passwords for one username
  loginNet: [100, 15 * MINUTE], // wrong passwords from one network (a whole class)
  signupUser: [10, 60 * MINUTE], // sign-up tries for one username
  signupNet: [60, 60 * MINUTE], // sign-up tries from one network
};

function recent(key, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((at) => now - at < windowMs);
  if (list.length) hits.set(key, list);
  else hits.delete(key);
  return list;
}
function over(kind, key) {
  const [max, windowMs] = LIMITS[kind];
  return recent(`${kind}:${key}`, windowMs).length >= max;
}
function hit(kind, key) {
  const [, windowMs] = LIMITS[kind];
  hits.set(`${kind}:${key}`, [...recent(`${kind}:${key}`, windowMs), Date.now()]);
  if (hits.size > 20_000) for (const k of [...hits.keys()].slice(0, 5_000)) hits.delete(k); // never grows without end
}
const nameKey = (username) => String(username || '').toLowerCase().slice(0, 40);

export function tooManyLoginTries(req, username) {
  return over('loginUser', nameKey(username)) || over('loginNet', clientIp(req));
}
export function countFailedLogin(req, username) {
  hit('loginUser', nameKey(username));
  hit('loginNet', clientIp(req));
}
// every sign-up try counts (also successful ones: limits mass account creation)
export function tooManySignupTries(req, username) {
  return over('signupUser', nameKey(username)) || over('signupNet', clientIp(req))
    || used('code-net', clientIp(req)) >= 300; // wrong class codes, shared with /api/code
}
export function countSignupTry(req, username, { wrongCode = false } = {}) {
  hit('signupUser', nameKey(username));
  hit('signupNet', clientIp(req));
  if (wrongCode) bump('code-net', clientIp(req));
}
