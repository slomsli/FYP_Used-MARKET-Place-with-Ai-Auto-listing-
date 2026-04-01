import { createClient } from '@/src/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /auth/callback
 *
 * Handles the redirect from Supabase email verification.
 * Exchanges the one-time `code` for a session, then redirects
 * the user to the dashboard (or auth-error on failure).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error('[Auth Callback] Code exchange failed:', error.message);
  }

  // No code or exchange failed → show error page
  return NextResponse.redirect(`${origin}/auth-error`);
}
