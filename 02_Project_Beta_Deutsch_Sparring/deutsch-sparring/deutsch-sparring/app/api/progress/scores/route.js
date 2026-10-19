import { progressRoute } from '../../../../lib/progress-api';
import { progress } from '../../../../lib/progress';

export const dynamic = 'force-dynamic';

// The word scores for a list of word ids: ?ids=a,b,c (at most 200).
export const GET = (req) => progressRoute(req, {}, async ({ user, req: r }) => {
  const ids = (new URL(r.url).searchParams.get('ids') || '').split(',')
    .filter((id) => /^[^\s,]{1,120}$/.test(id)).slice(0, 200);
  return { scores: ids.length ? await progress().scores(user.id, ids) : {} };
});
