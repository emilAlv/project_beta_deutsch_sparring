import { checkClassCode, clientKey, tooManyCodeTries } from '../../../lib/guard';

export const dynamic = 'force-dynamic';

// The chat asks for the class code; the browser checks it here before the first AI call.
export async function POST(req) {
  try {
    const { classCode } = await req.json().catch(() => ({}));
    if (tooManyCodeTries(clientKey(req))) {
      return Response.json({ ok: false, error: 'Zu viele Versuche. Bitte versuche es morgen wieder.' }, { status: 429 });
    }
    return Response.json({ ok: checkClassCode(String(classCode ?? '').trim()) });
  } catch (e) {
    console.error('code route crashed:', e);
    return Response.json({ ok: false, error: 'Fehler beim Prüfen.' }, { status: 500 });
  }
}
