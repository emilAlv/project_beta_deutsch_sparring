import { progressRoute } from '../../../../lib/progress-api';
import { progress, cleanHistory, cleanScores } from '../../../../lib/progress';

export const dynamic = 'force-dynamic';

// The old history + word scores from this browser, once. Ignored if the account already has data.
export const POST = (req) => progressRoute(req, { write: true, maxBytes: 500_000 }, async ({ user, body }) => {
  const imported = await progress().importData(user.id, { history: cleanHistory(body.history), scores: cleanScores(body.scores) });
  return { ok: true, imported };
});
