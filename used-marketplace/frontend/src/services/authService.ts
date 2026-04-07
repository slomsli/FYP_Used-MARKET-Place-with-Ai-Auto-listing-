import { createClient } from '@/src/lib/supabase/client';
import type { SignupFormData, AuthResponse } from '@/src/types/auth';
import type { Profile } from '@/src/types/profile';

/**
 * Backend API base URL.
 * In production, set NEXT_PUBLIC_API_URL to the deployed backend URL.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/* ────────────────────────────────────────────────────────────
   Registration — calls the Express backend
   ──────────────────────────────────────────────────────────── */

export async function signUp(data: SignupFormData): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        password: data.password,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

/* ────────────────────────────────────────────────────────────
   Login — calls the Express backend, then sets the browser session
   ──────────────────────────────────────────────────────────── */

export async function signIn(email: string, password: string, rememberMe: boolean = true): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Establish the browser-side Supabase session with the tokens
    // returned from the backend. This sets the auth cookies so the
    // Next.js middleware and useAuth hook pick up the session.
    // The rememberMe flag dictates the cookie maxAge!
    const supabase = createClient(rememberMe);
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.data.session.access_token,
      refresh_token: result.data.session.refresh_token,
    });

    if (sessionError) {
      return { success: false, error: 'Failed to establish session' };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

/* ────────────────────────────────────────────────────────────
   Sign Out — uses Supabase browser client directly
   ──────────────────────────────────────────────────────────── */

export async function signOut(): Promise<AuthResponse> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ────────────────────────────────────────────────────────────
   Session / User helpers — use Supabase browser client
   ──────────────────────────────────────────────────────────── */

export async function getSession() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function getCurrentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data as Profile;
}
