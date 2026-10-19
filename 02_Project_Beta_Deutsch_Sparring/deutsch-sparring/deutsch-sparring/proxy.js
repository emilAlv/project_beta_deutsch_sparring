// Runs before every page and API request (Next.js "proxy", formerly "middleware").
// Accounts off → the login pages lead to the app, everything else as before.
// Accounts on  → without a valid login cookie: pages go to /login, API routes answer 401.
// This is only a quick first check of the cookie's signature; every API route checks the
// account again itself (lib/auth.js requireUser).
import { NextResponse } from 'next/server';
import { authEnabled, readSessionToken, SESSION_COOKIE } from './lib/session';

const AUTH_PAGES = new Set(['/login', '/signup']);

export function proxy(req) {
  const { pathname } = req.nextUrl;
  const isAuthPage = AUTH_PAGES.has(pathname);

  if (!authEnabled()) {
    return isAuthPage ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }
  if (pathname.startsWith('/api/auth/')) return NextResponse.next(); // log in / sign up / log out

  const loggedIn = Boolean(readSessionToken(req.cookies.get(SESSION_COOKIE)?.value));
  if (isAuthPage) return loggedIn ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  if (loggedIn) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Bitte melde dich an.', code: 'auth' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  // everything except the build files, images and files with an extension (icons, fonts …)
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
};
