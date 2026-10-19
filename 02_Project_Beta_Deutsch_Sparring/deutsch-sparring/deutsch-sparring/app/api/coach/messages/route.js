import { progressRoute, bad } from '../../../../lib/progress-api';
import { coachStore } from '../../../../lib/coach-store';
import { cleanStoredMessages } from '../../../../lib/coach';
import { allTopics } from '../../../../lib/topics';

export const dynamic = 'force-dynamic';

// The coach messages of the logged-in student (last 30). Accounts only; without accounts they live in the browser.
// GET → { messages }   PUT { messages } → replaces the saved list
export const GET = (req) => progressRoute(req, {}, async ({ user }) => ({ messages: await coachStore().list(user.id) }));

export const PUT = (req) => progressRoute(req, { write: true, maxBytes: 60_000 }, async ({ user, body }) => {
  if (!Array.isArray(body.messages)) return bad('bad_messages');
  const topics = allTopics().map(({ keywords, ...t }) => t);
  await coachStore().replace(user.id, cleanStoredMessages(body.messages, topics));
  return { ok: true };
});
