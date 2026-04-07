import { createClient } from '@/src/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /auth/callback
 * 
 * Handles the redirect from Supabase authentication (e.g. Email verification, Magic Links, Oauth).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as any;
  const next = searchParams.get('next') ?? '/dashboard';

  const supabase = await createClient();

  // Handle PKCE Code Flow (Standard SSR Authentication)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] Code exchange failed:', error.message);
  }

  // Handle Hash Flow via Server (SSR Email confirmation / OTP)
  // Supabase automatically transforms #access_token to ?token_hash=... for server-side verification using verifyOtp
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] OTP verification failed:', error.message);
  }

  // If no valid auth method found or an error occurred -> show error page
  return NextResponse.redirect(`${origin}/auth-error`);
}
