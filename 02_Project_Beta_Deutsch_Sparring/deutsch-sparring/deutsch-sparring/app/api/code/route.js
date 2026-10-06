import { checkClassCode, countWrongCode, tooManyCodeTries } from '../../../lib/guard';

export const dynamic = 'force-dynamic';

// The chat asks for the class code; the browser checks it here before the first AI call.
export async function POST(req) {
  try {
    const { classCode, clientId } = await req.json().catch(() => ({}));
    if (tooManyCodeTries(req, clientId)) {
      return Response.json({ ok: false, error: 'Zu viele falsche Versuche. Bitte versuche es morgen wieder.' }, { status: 429 });
    }
    const ok = checkClassCode(String(classCode ?? '').trim());
    if (!ok) countWrongCode(req, clientId); // a correct code never uses up the tries
    return Response.json({ ok });
  } catch (e) {
    console.error('code route crashed:', e);
    return Response.json({ ok: false, error: 'Fehler beim Prüfen.' }, { status: 500 });
  }
}
