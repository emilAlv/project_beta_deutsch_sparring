import { listLessons } from '../../../lib/content';
import { needsCode } from '../../../lib/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({
      topics: listLessons().map(({ keywords, ...t }) => t),
      needsCode: needsCode(),
      mock: process.env.MOCK === '1',
    });
  } catch (e) {
    console.error('topics route crashed:', e);
    return Response.json({ topics: [], needsCode: needsCode(), error: 'Themen konnten nicht geladen werden.' }, { status: 500 });
  }
}
