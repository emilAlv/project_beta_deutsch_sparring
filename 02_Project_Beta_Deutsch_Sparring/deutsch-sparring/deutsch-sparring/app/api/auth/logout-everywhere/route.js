import { authEnabled, clearSession, currentUser, notLoggedIn } from '../../../../lib/auth';
import { users } from '../../../../lib/users';
import { readJsonBody } from '../../../../lib/route-guard';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 200; // the page sends "{}": anything bigger is refused

const fail = (code, status) => Response.json({ ok: false, code }, { status });

// Log out everywhere (review R7): the account's session counter goes up by one, so every login cookie made
// before – on this browser, another computer, or a copied one – stops working. This browser forgets its cookie too.
export async function POST(req) {
  try {
    if (!authEnabled()) return fail('off', 404);
    const { response: bad } = await readJsonBody(req, MAX_BYTES); // also checks same-origin
    if (bad) return bad;
    const user = await currentUser(req);
    if (!user) return notLoggedIn();
    if ((await users().bumpSessionCounter(user.id)) === null) return notLoggedIn();
    const res = Response.json({ ok: true });
    clearSession(res);
    return res;
  } catch (e) {
    console.error('logout-everywhere route crashed:', e?.message);
    return fail('server', 500);
  }
}
