'use client';

import { AlertCircle } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

/** NextAuth reports rejected sign-ins via ?error=. */
const MESSAGES: Record<string, string> = {
  AccessDenied:
    'That account is not on the console allowlist. Ask an administrator to add your work address.',
  Configuration:
    'Sign-in is not configured on this server. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET and ADMIN_EMAILS.',
  Verification: 'That sign-in link has expired. Try again.',
};

function LoginCard() {
  const params = useSearchParams();
  const error = params.get('error');
  const callbackUrl = params.get('callbackUrl') ?? '/';

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            RC
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Connect Console</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your work Google account.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{MESSAGES[error] ?? 'Could not sign you in. Try again.'}</span>
          </div>
        ) : null}

        <Button className="w-full" onClick={() => signIn('google', { callbackUrl })}>
          Continue with Google
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Access is limited to approved administrators.
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Suspense>
        <LoginCard />
      </Suspense>
    </div>
  );
}
