// The shared door for the /api/progress/* routes (server only): only for logged-in students,
// writes only from our own pages, small bodies only, every error as JSON (never the body in a log).
import { requireUser, sameOrigin } from './auth';

export async function progressRoute(req, { write = false, maxBytes = 20_000 } = {}, run) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    if (!user) return Response.json({ code: 'off' }, { status: 404 }); // accounts are off: no server storage
    let body = null;
    if (write) {
      if (!sameOrigin(req)) return Response.json({ code: 'origin' }, { status: 403 });
      if (Number(req.headers.get('content-length')) > maxBytes) return Response.json({ code: 'too_big' }, { status: 413 });
      const raw = await req.text();
      if (raw.length > maxBytes) return Response.json({ code: 'too_big' }, { status: 413 });
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ code: 'bad_body' }, { status: 400 });
    }
    const out = await run({ user, body, req });
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    console.error('progress route failed:', e?.message);
    return Response.json({ code: 'server' }, { status: 500 });
  }
}

export const bad = (code = 'bad_body') => Response.json({ code }, { status: 400 });
