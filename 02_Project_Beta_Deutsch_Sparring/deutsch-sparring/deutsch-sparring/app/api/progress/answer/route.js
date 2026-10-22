import { progressRoute, bad, overCap } from '../../../../lib/progress-api';
import { progress, cleanAnswer } from '../../../../lib/progress';

export const dynamic = 'force-dynamic';

// Save one answer. The word score is worked out HERE (lib/scores.js applyAnswer), not by the browser.
export const POST = (req) => progressRoute(req, { write: true }, async ({ user, body }) => {
  const a = cleanAnswer(body);
  if (!a) return bad();
  const capped = await overCap(user, 'answer');
  if (capped) return capped;
  const { saved, rec } = await progress().addAnswer(user.id, a, {
    task: a.task || 'flashcard',
    correct: a.correct,
    errorType: a.errorType,
    skipped: a.skipped,
    hinted: a.hinted,
    hasG: a.hasG,
  });
  return { ok: true, saved, word: rec };
});
