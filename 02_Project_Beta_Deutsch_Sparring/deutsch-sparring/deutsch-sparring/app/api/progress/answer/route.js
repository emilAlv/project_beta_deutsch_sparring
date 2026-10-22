import { progressRoute, bad, overCap } from '../../../../lib/progress-api';
import { progress, cleanAnswer, scoreInputOf } from '../../../../lib/progress';

export const dynamic = 'force-dynamic';

// Save one answer. The word score is worked out HERE (lib/scores.js applyAnswer), not by the browser.
export const POST = (req) => progressRoute(req, { write: true }, async ({ user, body }) => {
  const a = cleanAnswer(body);
  if (!a) return bad();
  const capped = await overCap(user, 'answer');
  if (capped) return capped;
  const { saved, rec } = await progress().addAnswer(user.id, a, scoreInputOf(a));
  return { ok: true, saved, word: rec };
});
