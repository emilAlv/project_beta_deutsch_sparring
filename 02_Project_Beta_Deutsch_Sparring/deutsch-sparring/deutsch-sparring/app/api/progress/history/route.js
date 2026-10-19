import { progressRoute } from '../../../../lib/progress-api';
import { progress } from '../../../../lib/progress';

export const dynamic = 'force-dynamic';

// The last 5 sessions + the streak. ?tz = the browser's time zone offset in minutes (for "a day").
export const GET = (req) => progressRoute(req, {}, async ({ user, req: r }) => {
  const tz = Math.max(-840, Math.min(840, Math.floor(Number(new URL(r.url).searchParams.get('tz'))) || 0));
  return progress().history(user.id, tz);
});
