// Accounts, for the API routes (server only). See lib/session.js for the on/off switch and the
// cookie, docs/security-accounts.md for the plain-English overview.
import { authEnabled, readSessionToken, passwordVersion, createSessionToken, sessionCookieOptions, SESSION_COOKIE } from './session';
import { users } from './users';
import { sameOrigin } from './route-guard';

export { authEnabled };

export const USERNAME_RULE = /^[A-Za-z0-9]{3,24}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200; // a very long "password" would only cost server time

export const cleanUsername = (u) => String(u ?? '').trim();

// The logged-in user ({ id, username }) or null. Checks the signature AND that the account
// still exists with the same password (a reset logs out old sessions).
export async function currentUser(req) {
  const session = readSessionToken(req.cookies?.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await users().findById(session.userId);
  if (!user) return null;
  const a = passwordVersion(user.password_hash);
  if (a !== session.pv) return null;
  return { id: user.id, username: user.username };
}

// The answer for "not logged in": 401 + the cookie is removed (so the login page does not send
// the browser straight back to the app with a cookie that no longer works).
export function notLoggedIn() {
  const res = Response.json({ error: 'Bitte melde dich an.', code: 'auth' }, { status: 401 });
  clearSession(res);
  return res;
}

// For routes that need an account when accounts are on.
// → { user } (user = null when accounts are off) or { response } to return at once.
export async function requireUser(req) {
  if (!authEnabled()) return { user: null };
  const user = await currentUser(req);
  return user ? { user } : { response: notLoggedIn() };
}

function setCookie(res, value, maxAge) {
  const o = sessionCookieOptions(maxAge);
  const parts = [`${SESSION_COOKIE}=${value}`, `Path=${o.path}`, `Max-Age=${o.maxAge}`, 'HttpOnly', 'SameSite=Lax'];
  if (o.secure) parts.push('Secure');
  res.headers.append('Set-Cookie', parts.join('; '));
}

export function startSession(res, user) {
  setCookie(res, createSessionToken(user.id, user.password_hash));
}

export function clearSession(res) {
  setCookie(res, '', 0);
}

// Forms on other websites must not be able to log someone in or out here: see sameOrigin in lib/route-guard.js.
export { sameOrigin };
