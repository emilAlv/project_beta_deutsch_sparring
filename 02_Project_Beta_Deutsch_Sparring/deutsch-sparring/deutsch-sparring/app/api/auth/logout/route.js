import { clearSession, sameOrigin } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

// Log out: the browser forgets the login cookie.
export async function POST(req) {
  if (!sameOrigin(req)) return Response.json({ ok: false, code: 'origin' }, { status: 403 });
  const res = Response.json({ ok: true });
  clearSession(res);
  return res;
}
