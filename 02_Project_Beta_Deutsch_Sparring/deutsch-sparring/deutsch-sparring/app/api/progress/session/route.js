import { progressRoute, bad } from '../../../../lib/progress-api';
import { progress, cleanSession } from '../../../../lib/progress';

export const dynamic = 'force-dynamic';

// Start a session (no entry yet) or update / end it (entry = the session card, finished = true).
export const POST = (req) => progressRoute(req, { write: true }, async ({ user, body }) => {
  const s = cleanSession(body);
  if (!s) return bad();
  await progress().upsertSession(user.id, s);
  return { ok: true };
});
