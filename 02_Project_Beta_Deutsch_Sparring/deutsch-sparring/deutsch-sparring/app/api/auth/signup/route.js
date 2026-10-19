import {
  authEnabled, cleanUsername, USERNAME_RULE, PASSWORD_MIN, PASSWORD_MAX, sameOrigin, startSession,
} from '../../../../lib/auth';
import { users } from '../../../../lib/users';
import { hashPassword } from '../../../../lib/password.mjs';
import { checkClassCode, tooManySignupTries, countSignupTry } from '../../../../lib/guard';

export const dynamic = 'force-dynamic';

const fail = (code, status) => Response.json({ ok: false, code }, { status });

// Create an account. Needs the class code (checked here on the server, never in the browser).
export async function POST(req) {
  try {
    if (!authEnabled()) return fail('off', 404);
    if (!sameOrigin(req)) return fail('origin', 403);
    const body = await req.json().catch(() => ({}));
    const username = cleanUsername(body?.username).slice(0, 40);
    const password = typeof body?.password === 'string' ? body.password : '';
    const classCode = String(body?.classCode ?? '').trim();

    if (tooManySignupTries(req, username)) return fail('too_many', 429);
    if (!USERNAME_RULE.test(username)) return fail('username_rules', 400);
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return fail('password_rules', 400);

    const codeOk = checkClassCode(classCode);
    countSignupTry(req, username, { wrongCode: !codeOk });
    if (!codeOk) return fail('bad_code', 401);

    const { hash, salt } = await hashPassword(password);
    const user = await users().create({ username, hash, salt });
    if (!user) return fail('username_taken', 409);

    const res = Response.json({ ok: true, username: user.username });
    startSession(res, user);
    return res;
  } catch (e) {
    console.error('signup route crashed:', e?.message); // never the body: it holds the password
    return fail('server', 500);
  }
}
