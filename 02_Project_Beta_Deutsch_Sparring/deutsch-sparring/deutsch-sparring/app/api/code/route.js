import { checkCode } from '../../../lib/guard';
import { requireUser } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// The chat asks for the class code; the browser checks it here before the first AI call.
// Wrong codes are counted per network (lib/guard.js checkCode), the same counter /api/chat and /api/coach use.
export async function POST(req) {
  try {
    const { response } = await requireUser(req);
    if (response) return response;
    const body = await req.json().catch(() => ({}));
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
