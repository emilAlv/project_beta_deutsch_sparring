import { checkCode } from '../../../lib/guard';
import { requireUser } from '../../../lib/auth';
import { readJsonBody } from '../../../lib/route-guard';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 2_000;

// The chat asks for the class code; the browser checks it here before the first AI call.
// Wrong codes are counted per network (lib/guard.js checkCode), the same counter /api/chat and /api/coach use.
export async function POST(req) {
  try {
    const { response } = await requireUser(req);
    if (response) return response;
    const { body, response: bad } = await readJsonBody(req, MAX_BYTES); // a few fields: anything bigger is refused
    if (bad) return bad;
    const result = await checkCode(req, body && typeof body === 'object' ? body : {});
    if (result === 'too_many') {
      return Response.json({ ok: false, code: 'too_many', error: 'Zu viele falsche Versuche. Bitte versuche es morgen wieder.' }, { status: 429 });
    }
    return Response.json({ ok: result === 'ok' });
  } catch (e) {
    console.error('code route crashed:', e?.message);
    return Response.json({ ok: false, error: 'Fehler beim Prüfen.' }, { status: 500 });
  }
}
