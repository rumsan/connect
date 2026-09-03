export { default } from 'next-auth/middleware';

/**
 * Everything is behind sign-in except the auth routes themselves, the login
 * page, and Next's own static assets.
 *
 * Middleware is the coarse gate; it is not the only one. The API proxy checks
 * the session again server-side before it will attach the admin key — a
 * middleware matcher is easy to widen by accident, and that route is what
 * holds the credential.
 */
export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
};
