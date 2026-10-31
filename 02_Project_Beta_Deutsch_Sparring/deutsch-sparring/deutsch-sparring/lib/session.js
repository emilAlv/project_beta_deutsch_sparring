// Accounts on/off + the login cookie. No database in here: proxy.js uses this on every request.
//
// Accounts are ON only when SESSION_SECRET is set AND a database is connected
// (DATABASE_URL / POSTGRES_URL) – or, for local tests only, AUTH_MEMORY=1 (users kept in memory,
// lost on restart; ignored on Vercel). Otherwise the app works as before (name + class code).
//
// The cookie holds the user id, the expiry, a short fingerprint of the password hash (so a
// password reset logs out old sessions) and the account's session counter (so "Log out everywhere"
// ends every older cookie; a cookie from before this counter existed counts as 0), signed with SESSION_SECRET (HMAC-SHA256). It is not
// secret, but nobody can change or forge it without SESSION_SECRET.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { databaseUrl } from './schema.mjs';

export const SESSION_COOKIE = 'wort_session';
export const SESSION_DAYS = 30;

export const memoryAuth = () => process.env.AUTH_MEMORY === '1' && !process.env.VERCEL && !databaseUrl();

export function authEnabled() {
  return Boolean(process.env.SESSION_SECRET) && (Boolean(databaseUrl()) || memoryAuth());
}

const hmac = (purpose, data) => createHmac('sha256', process.env.SESSION_SECRET).update(`${purpose}:${data}`).digest('base64url');

export function passwordVersion(passwordHash) {
  return hmac('pv', passwordHash).slice(0, 16);
}

// the account's session counter as a whole number ≥ 0; anything missing or odd counts as 0
export const sessionCounter = (n) => (Number.isSafeInteger(n) && n > 0 ? n : 0);

export function createSessionToken(userId, passwordHash, counter = 0) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  const payload = Buffer.from(JSON.stringify({ u: userId, e: exp, v: passwordVersion(passwordHash), s: sessionCounter(counter) })).toString('base64url');
  return `${payload}.${hmac('session', payload)}`;
}

// → { userId, pv, sv } or null (missing, forged, broken or expired)
export function readSessionToken(token) {
  if (!process.env.SESSION_SECRET || typeof token !== 'string' || !token || token.length > 1000) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac('session', payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.u !== 'string' || typeof data.v !== 'string' || !Number.isFinite(data.e)) return null;
    if (data.e * 1000 <= Date.now()) return null;
    return { userId: data.u, pv: data.v, sv: sessionCounter(data.s) }; // no counter (older cookie) = 0
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_DAYS * 86_400) {
  return {
    httpOnly: true, // page scripts cannot read it
    secure: process.env.NODE_ENV === 'production', // HTTPS only (local `npm run dev` is plain http)
    sameSite: 'lax', // not sent along when another website posts to ours
    path: '/',
    maxAge,
  };
}
