// Checks review R1 "limits that hold on Vercel" (lib/guard.js), calling the real routes with plain node:
//   - 31 wrong class codes through /api/chat → the 31st gets 429 (and then even the right code from that network),
//     while another network is not affected;
//   - 11 wrong passwords from network A do not block the right password from network B;
//   - the daily limit is the same after a module reload (a "new server copy"), with a FAKE database that keeps the
//     usage table like Postgres would (the real SQL is tested against a real Postgres by hand – see README);
//   - the per-student write caps.
//   node scripts/check-guard.mjs
process.removeAllListeners('warning');
import { register } from 'node:module';

// lib/*.js import each other without ".js" – teach plain node to cope (Next.js does this by itself)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (s.startsWith('.')) { try { return await next(s + '.js', c); } catch {} } throw e; }
}`));

// first part: no database (counts in memory), demo tutor, accounts off (switched on for the log-in part)
process.env.WORT_CHECK = '1';
process.env.MOCK = '1';
process.env.CLASS_CODE = 'k7Qp2Lx9Vr4m'; // a test value only
delete process.env.SESSION_SECRET;
process.env.AUTH_MEMORY = '1';
process.env.DAILY_LIMIT = '5';
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.VERCEL;

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const post = (ip, body) => new Request('http://localhost:3000/api/x', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` }, body: JSON.stringify(body),
});

// ---- class code through /api/chat ----
{
  const chat = await import('../app/api/chat/route.js');
  // every request sends a NEW browser id: it does not help, the count is per network
  const say = (ip, classCode) => chat.POST(post(ip, { classCode, messages: [{ role: 'user', text: 'Hallo' }], clientId: `browser${Math.random()}`.replace('.', '') }));
  const statuses = [];
  for (let i = 0; i < 31; i += 1) statuses.push((await say('203.0.113.1', `wrong-${i}`)).status);
  check('30 wrong codes through /api/chat: 401 bad_code', statuses.slice(0, 30).every((s) => s === 401), statuses.join());
  const last = await say('203.0.113.1', 'wrong-31');
  check('the 31st wrong code: 429', statuses[30] === 429 && last.status === 429, `${statuses[30]} ${last.status}`);
  check('… with code code_tries', (await last.json()).code === 'code_tries');
  check('then even the right code from that network: 429 (no hint which code is right)', (await say('203.0.113.1', process.env.CLASS_CODE)).status === 429);
  const other = await say('198.51.100.7', process.env.CLASS_CODE);
  check('the right code from another network still works', other.status === 200, `${other.status}`);
  const code = await import('../app/api/code/route.js');
  const c = await code.POST(post('203.0.113.1', { classCode: 'wrong' }));
  check('/api/code shares the same counter (429 for that network)', c.status === 429);
  const c2 = await (await code.POST(post('198.51.100.9', { classCode: process.env.CLASS_CODE }))).json();
  check('/api/code: right code from a fresh network is ok', c2.ok === true);
}

// ---- log-in: per username + network ----
{
  process.env.SESSION_SECRET = 'check-guard-secret-not-real'; // accounts on (in memory)
  const { users } = await import('../lib/users.js');
  const { hashPassword } = await import('../lib/password.mjs');
  const pw = 'correct-horse-9';
  const { hash, salt } = await hashPassword(pw);
  await users().create({ username: 'anna', hash, salt });
  const login = await import('../app/api/auth/login/route.js');
  const tryLogin = (ip, password) => login.POST(post(ip, { username: 'anna', password }));
  const fromA = [];
  for (let i = 0; i < 11; i += 1) fromA.push((await tryLogin('192.0.2.10', `wrong-${i}`)).status);
  check('10 wrong passwords from network A: 401', fromA.slice(0, 10).every((s) => s === 401), fromA.join());
  check('the 11th from network A: 429', fromA[10] === 429, fromA.join());
  check('network A: even the right password waits now', (await tryLogin('192.0.2.10', pw)).status === 429);
  const fromB = await tryLogin('192.0.2.99', pw);
  check('the right password from network B still logs in', fromB.status === 200, `${fromB.status}`);
}

// ---- write caps ----
{
  const G = await import('../lib/guard.js');
  let over = false;
  for (let i = 0; i < G.WRITE_CAPS.goal; i += 1) over ||= await G.overWriteCap('u-1', 'goal');
  check(`${G.WRITE_CAPS.goal} goal saves in a day are fine`, !over);
  check('the next one is over the cap', await G.overWriteCap('u-1', 'goal'));
  check('another student is not affected', !(await G.overWriteCap('u-2', 'goal')));
  const { overCap } = await import('../lib/progress-api.js');
  const res = await overCap({ id: 'u-1' }, 'goal');
  check('progress-api answers 429 { code: limit }', res?.status === 429 && (await res.json()).code === 'limit');
}

// ---- daily limit in the (fake) database: the same after a module reload ----
{
  const table = new Map(); // "day|key" → n, like the usage table
  const texts = [];
  const { LATEST_VERSION } = await import('../lib/schema.mjs');
  globalThis.__wortTestSql = {
    query: async (text, params = []) => {
      texts.push(text);
      if (/FROM schema_version/.test(text)) return [{ v: LATEST_VERSION }];
      if (/^INSERT INTO usage/.test(text)) {
        const k = `${params[0]}|${params[1]}`;
        table.set(k, (table.get(k) || 0) + 1);
        return [{ n: table.get(k) }];
      }
      if (/^SELECT key, n FROM usage/.test(text)) return params[1].filter((k) => table.has(`${params[0]}|${k}`)).map((key) => ({ key, n: table.get(`${params[0]}|${key}`) }));
      if (/^DELETE FROM usage/.test(text)) return [];
      throw new Error(`unexpected SQL: ${text.slice(0, 40)}`);
    },
    transaction: async () => [],
  };
  process.env.DATABASE_URL = 'postgres://fake.invalid/none'; // never contacted: the fake above is used
  globalThis.__wortUsage?.clear(); // nothing from memory may help
  const req = () => post('203.0.113.50', {});
  const G1 = await import('../lib/guard.js?copy=1');
  const first = [];
  for (let i = 0; i < 3; i += 1) first.push(await G1.overDailyLimit(req(), 'user-1'));
  // "a new server copy": a fresh module, empty memory – only the database knows the count
  globalThis.__wortUsage?.clear();
  const G2 = await import('../lib/guard.js?copy=2');
  const second = [];
  for (let i = 0; i < 3; i += 1) second.push(await G2.overDailyLimit(req(), 'user-1'));
  check('daily limit 5: messages 1–5 pass, the 6th is refused – across a module reload', first.concat(second).join() === 'false,false,false,false,false,true', first.concat(second).join());
  check('the counts went to the usage table (INSERT … ON CONFLICT … RETURNING n)', texts.some((t) => /ON CONFLICT \(day, key\) DO UPDATE SET n = usage\.n \+ 1/.test(t)));
  check('no key holds the network address', [...table.keys()].every((k) => !k.includes('203.0.113')));
  check('memory was not used', !globalThis.__wortUsage?.size);
  // without accounts: network only, DAILY_LIMIT * 5, a new browser id does not help
  let refused = 0;
  for (let i = 0; i < 26; i += 1) if (await G2.overDailyLimit(post('203.0.113.77', { clientId: `b${i}` }))) refused += 1;
  check('accounts off: 25 messages per network (DAILY_LIMIT × 5), then refused', refused === 1, `${refused}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll guard checks passed.');
process.exit(failed ? 1 : 0);
