import { progressRoute } from '../../../lib/progress-api';
import { homeData } from '../../../lib/home-data';

export const dynamic = 'force-dynamic';

// The numbers for the Home page: tiles, goal progress, strengths & gaps (last 30 days), worked out by the app.
//  - logged in: GET → everything comes from the database ({ goals, ...stats }); a student only gets their own data.
//  - accounts off: POST { goals, scores, log } from the browser's own storage → the same numbers
//    (nothing is stored on the server; the browser sends a compact copy, see lib/home-client.js).
export const GET = (req) => progressRoute(req, {}, ({ user, body }) => homeData(user, body));
export const POST = (req) => progressRoute(req, { write: true, maxBytes: 400_000, allowOff: true }, ({ user, body }) => homeData(user, body));
