import { authEnabled, cleanUsername, PASSWORD_MAX, sameOrigin, startSession } from '../../../../lib/auth';
import { users } from '../../../../lib/users';
import { verifyPassword } from '../../../../lib/password.mjs';
import { tooManyLoginTries, countFailedLogin } from '../../../../lib/guard';
import { readJsonBody } from '../../../../lib/route-guard';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 2_000;

const fail = (code, status) => Response.json({ ok: false, code }, { status });

// Log in. Unknown username and wrong password get the SAME answer (and take the same time),
// so nobody can find out which usernames exist.
export async function POST(req) {
  try {
    if (!authEnabled()) return fail('off', 404);
    if (!sameOrigin(req)) return fail('origin', 403);
    const { body, response: bad } = await readJsonBody(req, MAX_BYTES); // a few fields: anything bigger is refused
    if (bad) return bad;
    const username = cleanUsername(body?.username).slice(0, 40);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (await tooManyLoginTries(req, username)) return fail('too_many', 429);

    const user = username && password && password.length <= PASSWORD_MAX ? await users().findByUsername(username) : null;
    // no user: verifyPassword still does the full work, then says no
    const ok = await verifyPassword(password.slice(0, PASSWORD_MAX), user?.password_hash ?? null, user?.salt ?? null);
    if (!user || !ok) {
      await countFailedLogin(req, username);
      return fail('bad_login', 401);
    }
    const res = Response.json({ ok: true, username: user.username });
    startSession(res, user);
    return res;
  } catch (e) {
    console.error('login route crashed:', e?.message); // never the body: it holds the password
    return fail('server', 500);
  }
}
