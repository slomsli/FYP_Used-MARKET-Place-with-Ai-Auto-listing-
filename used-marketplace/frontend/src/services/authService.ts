import { createClient } from '@/src/lib/supabase/client';
import type { SignupFormData, AuthResponse } from '@/src/types/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface SessionPayload {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
}

interface BackendAuthPayload {
  user: {
    id: string;
    email: string | null;
  };
  session: SessionPayload;
}

interface BackendApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function parseApiResponse<T>(response: Response): Promise<BackendApiResult<T>> {
  try {
    return (await response.json()) as BackendApiResult<T>;
  } catch {
    if (!response.ok) {
      return {
        success: false,
        error: 'Unexpected server response. Please try again.',
      };
    }

    return {
      success: true,
    };
  }
}

async function establishBrowserSession(
  session: SessionPayload,
  rememberMe: boolean
): Promise<string | null> {
  const supabase = createClient(rememberMe);
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  return error ? 'Failed to establish session' : null;
}

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

    const result = await parseApiResponse(response);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

export async function signIn(
  email: string,
  password: string,
  rememberMe: boolean = true
): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await parseApiResponse<BackendAuthPayload>(response);

    if (!result.success || !result.data?.session) {
      return { success: false, error: result.error || 'Authentication failed' };
    }

    const sessionError = await establishBrowserSession(result.data.session, rememberMe);

    if (sessionError) {
      return { success: false, error: sessionError };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

export async function signOut(): Promise<AuthResponse> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getSession() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return data.session;
}

export async function getCurrentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
}

export async function requestPasswordReset(email: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });

    const result = await parseApiResponse(response);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

export async function verifyRecoveryCode(email: string, token: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/password-reset/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        token: token.trim(),
      }),
    });

    const result = await parseApiResponse<BackendAuthPayload>(response);

    if (!result.success || !result.data?.session) {
      return {
        success: false,
        error: result.error || 'Unable to verify the reset code.',
      };
    }

    const sessionError = await establishBrowserSession(result.data.session, false);

    if (sessionError) {
      return { success: false, error: sessionError };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

export async function updateRecoveredPassword(password: string): Promise<AuthResponse> {
  const supabase = createClient(false);
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function verifyEmailCode(email: string, token: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        token: token.trim(),
      }),
    });

    const result = await parseApiResponse<BackendAuthPayload>(response);

    if (!result.success || !result.data?.session) {
      return {
        success: false,
        error: result.error || 'Unable to verify this code.',
      };
    }

    const sessionError = await establishBrowserSession(result.data.session, false);

    if (sessionError) {
      return { success: false, error: sessionError };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

export async function resendVerificationCode(email: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/verify-email/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });

    const result = await parseApiResponse(response);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}
