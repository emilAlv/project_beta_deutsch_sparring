import { listLessons } from '../../../lib/content';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    topics: listLessons(),
    needsCode: Boolean(process.env.CLASS_CODE),
  });
}
