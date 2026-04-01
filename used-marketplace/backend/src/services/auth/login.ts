import { supabaseAdmin } from '../../config/supabase';
import type { LoginBody, ServiceResult } from '../../types/auth';

function mapAuthError(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('invalid login credentials'))
    return 'The email or password you entered is incorrect';
  if (lower.includes('email not confirmed'))
    return 'Please verify your email address before signing in';
  if (lower.includes('user already registered'))
    return 'An account with this email already exists';
  if (lower.includes('email rate limit exceeded'))
    return 'Too many attempts. Please try again later';
  return 'Authentication failed. Please try again.';
}

export async function loginUser(body: LoginBody): Promise<ServiceResult> {
  const { email, password } = body;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    const message = mapAuthError(error.message);
    return { success: false, error: message, status: 401 };
  }

  return {
    success: true,
    data: {
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
      },
    },
    status: 200,
  };
}
