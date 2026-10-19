import { listLessons } from '../../../lib/content';
import { needsCode } from '../../../lib/guard';
import { requireUser } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    // with accounts: only for logged-in students; account = { username } (no class-code question then)
    const { user, response } = await requireUser(req);
    if (response) return response;
    return Response.json({
      topics: listLessons().map(({ keywords, ...t }) => t),
      needsCode: !user && needsCode(),
      account: user ? { username: user.username } : null,
      mock: process.env.MOCK === '1',
    });
  } catch (e) {
    console.error('topics route crashed:', e);
    return Response.json({ topics: [], needsCode: needsCode(), error: 'Themen konnten nicht geladen werden.' }, { status: 500 });
  }
}
