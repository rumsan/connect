import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/**
 * Google Workspace sign-in for the console.
 *
 * Google only proves "this person controls a Google account" — it says nothing
 * about who they work for. Access is therefore decided here, against an
 * explicit allowlist, and the whole thing fails closed: no allowlist means
 * nobody gets in.
 */

/** Lowercased so a differently-cased env entry can't silently deny someone. */
function allowlist() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Optional second gate; the allowlist is the one that decides.
 * Normalised to undefined when unset, so an unset value doesn't end up on the
 * Google authorization URL as a meaningless `hd=`.
 */
const allowedDomain =
  process.env.ALLOWED_GOOGLE_DOMAIN?.trim().toLowerCase() || undefined;

export function isAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.NEXTAUTH_SECRET &&
      allowlist().size > 0,
  );
}

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  /** Hosted domain — present only on Workspace accounts, absent on @gmail.com. */
  hd?: string;
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          // A hint for the account chooser only — Google does NOT enforce it.
          // The real check is in signIn() below.
          hd: allowedDomain,
          prompt: 'select_account',
        },
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ profile }) {
      const google = profile as GoogleProfile | undefined;
      const email = google?.email?.toLowerCase();
      const allowed = allowlist();

      // Fail closed: an unset ADMIN_EMAILS must not mean "everyone".
      if (allowed.size === 0) {
        console.error('[auth] ADMIN_EMAILS is empty — refusing all sign-ins.');
        return false;
      }
      if (!email) return false;
      // An unverified address can be attacker-controlled.
      if (google?.email_verified !== true) return false;
      if (allowedDomain && google?.hd?.toLowerCase() !== allowedDomain) {
        return false;
      }

      return allowed.has(email);
    },
    async session({ session, token }) {
      if (session.user) session.user.email = token.email ?? session.user.email;
      return session;
    },
  },
};
