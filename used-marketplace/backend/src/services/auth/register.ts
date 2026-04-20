import { createSupabaseAuthClient, supabaseAdmin } from '../../config/supabase';
import { ensureProfileForUserId } from './profileSync';
import type { RegisterBody, ServiceResult } from '../../types/auth';

export async function registerUser(body: RegisterBody): Promise<ServiceResult> {
  const { fullName, username, email, password } = body;
  const trimmedUsername = username.trim().toLowerCase();
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedFullName = fullName.trim();

  // 1 — Check if username is already taken
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', trimmedUsername)
    .maybeSingle();

  if (existingProfile) {
    return { success: false, error: 'Username is already taken', status: 409 };
  }

  // 2 — Create auth user (sends confirmation email automatically)
  const { data: authData, error: authError } = await createSupabaseAuthClient().auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: {
        full_name: trimmedFullName,
        username: trimmedUsername,
        role: 'user', // Passing this in case the trigger expects it
      },
      emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (authError) {
    return { success: false, error: authError.message, status: 400 };
  }

  if (!authData.user) {
    return { success: false, error: 'Failed to create user', status: 500 };
  }

  // 3 — Detect "fake success" (email already registered)
  //     Supabase returns identities: [] to prevent email enumeration
  if (authData.user.identities && authData.user.identities.length === 0) {
    return { success: false, error: 'An account with this email already exists', status: 409 };
  }

  try {
    await ensureProfileForUserId(authData.user.id, {
      username: trimmedUsername,
      fullName: trimmedFullName,
      role: 'user',
    });
  } catch (error) {
    console.error('[Auth] Failed to sync profile after registration:', error);
    return { success: false, error: 'Account created but profile setup failed', status: 500 };
  }

  return {
    success: true,
    data: {
      user: {
        id: authData.user.id,
        email: authData.user.email,
        username: trimmedUsername,
        fullName: trimmedFullName,
      },
    },
    status: 201,
  };
}
