import { createBrowserClient } from '@supabase/ssr';

export function createClient(rememberMe: boolean = true) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        // If rememberMe is true, max-age is 30 days. Otherwise, undefined to create a session cookie.
        maxAge: rememberMe ? 30 * 24 * 60 * 60 : undefined,
      },
    }
  );
}
