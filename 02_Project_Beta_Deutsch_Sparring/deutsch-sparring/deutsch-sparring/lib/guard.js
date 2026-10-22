// Limits (review R1): class code, daily AI limit, log-in and sign-up tries, and the per-student write caps.
// Server only.
//
// Every count lives in ONE small table, `usage` (day, key, n), in the database (lib/schema.mjs step 4). One
// statement adds 1 and returns the new count, so every running copy of the server on Vercel sees the same
// number and a deploy or a quiet night does not reset it. Without a database (MOCK=1 demo, accounts off
// locally, AUTH_MEMORY=1) the counts live in this server's memory instead, exactly like before.
//
// No key holds a secret, a password or a raw network address: the parts are scrambled with an HMAC
// (see `key` below), only the kind of counter ("chat-net", "login-user" …) stays readable.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { databaseUrl, USAGE_CLEANUP_SQL } from './schema.mjs';
import { sql, ensureSchema } from './db';

// ---------- the numbers ----------
const dailyLimit = () => Number(process.env.DAILY_LIMIT || 150);
export const LIMITS = {
  // AI messages (tutor + coach) per day
  chatUser: () => dailyLimit(), // per account (accounts on)
  chatNet: () => dailyLimit() * 20, // per network with accounts on (20 students' worth)
  chatNetNoAccounts: () => dailyLimit() * 5, // per network with accounts off (the only key there)
  codeNet: 30, // wrong class codes per network per day (/api/code, /api/chat, /api/coach, sign-up)
  loginUserNet: 10, // wrong passwords per username + network, per 15 minutes
  loginNet: 100, // wrong passwords per network, per 15 minutes
  signupUserNet: 10, // sign-up tries per username + network, per hour
  signupNet: () => Number(process.env.SIGNUP_PER_HOUR || 10), // sign-up tries per network, per hour
};
const MINUTE = 60_000;
const LOGIN_WINDOW = 15 * MINUTE;
const SIGNUP_WINDOW = 60 * MINUTE;

// ---------- class code ----------
// Only checked on the server. No CLASS_CODE set → everyone may use the app.
export function needsCode() {
  return Boolean(process.env.CLASS_CODE);
}

export function checkClassCode(code) {
  const expected = process.env.CLASS_CODE;
  if (!expected) return true;
  const a = Buffer.from(String(code ?? '').trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- who is asking ----------
// The network address – a whole class behind one school network shares it.
// We take the FIRST entry of x-forwarded-for, as the app always did: on Vercel this header is written by
// Vercel itself and its first entry is the visitor's real address (a value the visitor sends is replaced,
// not kept in front). Behind another proxy that appends instead, the first entry could be faked – then use
// the last one. The browser-made clientId is never used for a limit: anyone can send a new one.
export function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim() || 'local';
}

const today = () => new Date().toISOString().slice(0, 10); // UTC day, the same for every server copy

// kind + scrambled parts, e.g. "login-user:9f2c…". The HMAC key is a server secret when one is set, so even
// someone who reads the table cannot test network addresses or usernames against it.
function key(kind, ...parts) {
  const secret = process.env.SESSION_SECRET || process.env.CLASS_CODE || 'wort-usage';
  const h = createHmac('sha256', secret).update(parts.map((p) => String(p ?? '')).join('\u0000')).digest('base64url');
  return `${kind}:${h.slice(0, 22)}`;
}
// a counter in time windows (15 minutes, an hour): the window number is part of the key
const windowed = (kind, windowMs, ...parts) => key(kind, ...parts, Math.floor(Date.now() / windowMs));
const nameOf = (username) => String(username || '').toLowerCase().slice(0, 40);

// ---------- the counter: database or memory ----------
export const BUMP_SQL = `INSERT INTO usage (day, key, n) VALUES ($1::date, $2, 1)
  ON CONFLICT (day, key) DO UPDATE SET n = usage.n + 1
  RETURNING n`;
export const PEEK_SQL = 'SELECT key, n FROM usage WHERE day = $1::date AND key = ANY($2::text[])';
// old rows are not needed: about one call in 200 removes rows more than two days old (lib/schema.mjs), so the
// table stays tiny; scripts/db-migrate.mjs does the same
export const CLEANUP_SQL = USAGE_CLEANUP_SQL;

const useDb = () => Boolean(databaseUrl());
const mem = (globalThis.__wortUsage ??= new Map()); // "day|key" → n (shared by all routes of one server)

// +1 for this key today; → the new count. One atomic statement, so two server copies never lose a count.
export async function bump(k) {
  const day = today();
  if (!useDb()) {
    const n = (mem.get(`${day}|${k}`) || 0) + 1;
    mem.set(`${day}|${k}`, n);
    if (mem.size > 20_000) for (const old of mem.keys()) if (!old.startsWith(day)) mem.delete(old); // never grows without end
    return n;
  }
  await ensureSchema();
  const rows = await sql().query(BUMP_SQL, [day, k]);
  if (Math.random() < 0.005) await sql().query(CLEANUP_SQL, [day]).catch((e) => console.error('usage cleanup failed:', e?.message));
  return Number(rows[0]?.n) || 0;
}

// today's counts of several keys, without changing them → { key: n }
export async function peek(keys) {
  const day = today();
  if (!useDb()) return Object.fromEntries(keys.map((k) => [k, mem.get(`${day}|${k}`) || 0]));
  await ensureSchema();
  const rows = await sql().query(PEEK_SQL, [day, keys]);
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) out[r.key] = Number(r.n) || 0;
  return out;
}

// ---------- daily AI limit ----------
// With accounts: per account (the same on every device) plus a ceiling for the whole network.
// Without accounts: per network only (a higher limit, the whole class shares it) – a browser could make up a new
// id at any time, so it does not count. The student's own counter is checked first, so someone over their limit
// who keeps sending does not use up the network's allowance.
export async function overDailyLimit(req, userId = null) {
  const ip = clientIp(req);
  if (userId) {
    if ((await bump(key('chat-user', userId))) > LIMITS.chatUser()) return true;
    return (await bump(key('chat-net', ip))) > LIMITS.chatNet();
  }
  return (await bump(key('chat-net-open', ip))) > LIMITS.chatNetNoAccounts();
}

// ---------- class code: one check for /api/code, /api/chat, /api/coach and sign-up ----------
// → 'ok' | 'bad_code' | 'too_many'. Only WRONG codes count, per network, never per browser.
// A wrong code is counted first (one atomic +1), so many tries sent at the same moment cannot slip past the
// limit. Once the network is over the limit even the right code gets 'too_many' – otherwise a guesser could keep
// going and learn the code from the one answer that differs.
export async function checkCode(req, body) {
  if (!needsCode()) return 'ok';
  const k = key('code-net', clientIp(req));
  if (checkClassCode(body?.classCode)) {
    const { [k]: wrong } = await peek([k]);
    return wrong >= LIMITS.codeNet ? 'too_many' : 'ok';
  }
  return (await bump(k)) > LIMITS.codeNet ? 'too_many' : 'bad_code';
}

// ---------- accounts: log-in and sign-up tries ----------
// Counted in short time windows, so a typo-prone student is only slowed down, never locked out for days.
// The log-in lockout is per username AND network: a classmate on another network (or the same student at home)
// is never blocked by someone else's wrong tries. The network cap stops one network trying many usernames.
export async function tooManyLoginTries(req, username) {
  const ip = clientIp(req);
  const user = windowed('login-user', LOGIN_WINDOW, nameOf(username), ip);
  const net = windowed('login-net', LOGIN_WINDOW, ip);
  const n = await peek([user, net]);
  return n[user] >= LIMITS.loginUserNet || n[net] >= LIMITS.loginNet;
}
export async function countFailedLogin(req, username) {
  const ip = clientIp(req);
  await bump(windowed('login-user', LOGIN_WINDOW, nameOf(username), ip));
  await bump(windowed('login-net', LOGIN_WINDOW, ip));
}

// every sign-up try counts (also successful ones: limits mass account creation)
export async function tooManySignupTries(req, username) {
  const ip = clientIp(req);
  const user = windowed('signup-user', SIGNUP_WINDOW, nameOf(username), ip);
  const net = windowed('signup-net', SIGNUP_WINDOW, ip);
  const n = await peek([user, net]);
  return n[user] >= LIMITS.signupUserNet || n[net] >= LIMITS.signupNet();
}
export async function countSignupTry(req, username) {
  const ip = clientIp(req);
  await bump(windowed('signup-user', SIGNUP_WINDOW, nameOf(username), ip));
  await bump(windowed('signup-net', SIGNUP_WINDOW, ip));
}

// ---------- writes per student per day (progress, sessions, goals) ----------
export const WRITE_CAPS = { answer: 1500, session: 100, sessionUpdate: 1500, goal: 200 };
// → true when this write is over today's cap for this student (the write is counted)
export async function overWriteCap(userId, kind) {
  return (await bump(key(`write-${kind}`, userId))) > WRITE_CAPS[kind];
}
