// Checks review R7 "Log out everywhere": the account's session counter is in the login cookie, and raising it
// ends every older cookie (also a copied one). Uses the in-memory accounts (AUTH_MEMORY=1) and a throw-away
// secret made up here, so no database and no real secret is touched:
//   node scripts/check-logout-everywhere.mjs
process.removeAllListeners('warning');
import { register } from 'node:module';
import { randomBytes, createHmac } from 'node:crypto';

// lib/*.js import each other without ".js" – teach plain node to cope (Next.js does this by itself)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (s.startsWith('.')) { try { return await next(s + '.js', c); } catch {} } throw e; }
}`));

for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'VERCEL']) delete process.env[k];
process.env.AUTH_MEMORY = '1';
process.env.SESSION_SECRET = randomBytes(32).toString('hex');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

const A = await import('../lib/auth.js');
const S = await import('../lib/session.js');
const { users } = await import('../lib/users.js');
const { POST } = await import('../app/api/auth/logout-everywhere/route.js');

// the cookie that startSession puts on a response
function cookieFrom(res) {
  const line = res.headers.get('set-cookie') || '';
  const m = line.match(new RegExp(`${S.SESSION_COOKIE}=([^;]*)`));
  return m ? m[1] : null;
}
const reqWith = (cookie, init = {}) => {
  const r = new Request('http://localhost:3145/api/auth/logout-everywhere', {
    method: 'POST', headers: { host: 'localhost:3145', origin: 'http://localhost:3145', 'content-type': 'application/json' }, body: '{}', ...init,
  });
  r.cookies = { get: (name) => (name === S.SESSION_COOKIE && cookie ? { value: cookie } : undefined) };
  return r;
};
async function login(username) {
  const user = await users().findByUsername(username);
  const res = Response.json({ ok: true });
  A.startSession(res, user);
  return cookieFrom(res);
}

const anna = await users().create({ username: 'anna', hash: 'hash-anna', salt: 'salt' });
const ben = await users().create({ username: 'ben', hash: 'hash-ben', salt: 'salt' });
check('a new account starts at counter 0', anna.session_counter === 0);

// 1. a cookie WITHOUT a counter (made before this change) still works = counts as 0
const payload = Buffer.from(JSON.stringify({ u: anna.id, e: Math.floor(Date.now() / 1000) + 3600, v: S.passwordVersion('hash-anna') })).toString('base64url');
const oldStyle = `${payload}.${createHmac('sha256', process.env.SESSION_SECRET).update(`session:${payload}`).digest('base64url')}`;
check('an old cookie without a counter reads as counter 0', S.readSessionToken(oldStyle)?.sv === 0);
check('an old cookie without a counter still logs in (nobody is logged out by the deploy)', (await A.currentUser(reqWith(oldStyle)))?.id === anna.id);

// 2. two browsers (laptop, phone) + a copied cookie, all valid before
const laptop = await login('anna');
const phone = await login('anna');
const copied = laptop;
const benCookie = await login('ben');
check('laptop cookie valid before', (await A.currentUser(reqWith(laptop)))?.id === anna.id);
check('phone cookie valid before', (await A.currentUser(reqWith(phone)))?.id === anna.id);

// 3. the route refuses: another website, no login, a big body
check('another website gets 403', (await POST(reqWith(laptop, { headers: { host: 'localhost:3145', origin: 'https://evil.example' } }))).status === 403);
check('not logged in gets 401', (await POST(reqWith(null))).status === 401);
check('a big body gets 413', (await POST(reqWith(laptop, { body: JSON.stringify({ x: 'a'.repeat(500) }) }))).status === 413);
check('refused tries do not raise the counter', (await users().findById(anna.id)).session_counter === 0);

// 4. log out everywhere from the laptop
const res = await POST(reqWith(laptop));
check('log out everywhere answers 200', res.status === 200);
check('… and clears this browser\'s cookie', /Max-Age=0/.test(res.headers.get('set-cookie') || '') && cookieFrom(res) === '');
check('the counter is now 1', (await users().findById(anna.id)).session_counter === 1);
check('laptop cookie invalid after', (await A.currentUser(reqWith(laptop))) === null);
check('phone cookie invalid after', (await A.currentUser(reqWith(phone))) === null);
check('copied cookie invalid after', (await A.currentUser(reqWith(copied))) === null);
check('old cookie without counter invalid after', (await A.currentUser(reqWith(oldStyle))) === null);
check('the copied cookie cannot use the route again (401)', (await POST(reqWith(copied))).status === 401);
check('another student (Ben) stays logged in', (await A.currentUser(reqWith(benCookie)))?.id === ben.id);

// 5. a new login after it works, and carries the new counter
const fresh = await login('anna');
check('a new login after it works', (await A.currentUser(reqWith(fresh)))?.id === anna.id);
check('the new cookie holds counter 1', S.readSessionToken(fresh)?.sv === 1);

// 6. odd counters count as 0
check('sessionCounter: missing / negative / text / fraction = 0', [undefined, null, -1, '3', 1.5, NaN].every((x) => S.sessionCounter(x) === 0));
check('sessionCounter: 2 stays 2', S.sessionCounter(2) === 2);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll log-out-everywhere checks passed.');
process.exit(failed ? 1 : 0);
