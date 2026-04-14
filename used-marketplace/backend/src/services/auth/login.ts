import { createSupabaseAuthClient, supabaseAdmin } from '../../config/supabase';
import { ensureProfileForUser } from './profileSync';
import type { LoginBody, ServiceResult } from '../../types/auth';
import { buildUpdatedAppMetadata } from '../../utils/accountStatus';

function mapAuthError(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('invalid login credentials'))
    return 'The email, username, or password you entered is incorrect';
  if (lower.includes('email not confirmed'))
    return 'Please verify your email address before signing in';
  if (lower.includes('banned'))
    return 'This account is still under a legacy login ban. Ask an admin to reactivate it once, then future suspensions will still allow sign-in.';
  if (lower.includes('user already registered'))
    return 'An account with this email already exists';
  if (lower.includes('email rate limit exceeded'))
    return 'Too many attempts. Please try again later';
  return 'Authentication failed. Please try again.';
}

async function findAuthUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      console.error('[Auth] Failed to search auth users during suspended-login migration:', error);
      return null;
    }

    const matchedUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    );

    if (matchedUser) {
      return matchedUser;
    }

    if (data.users.length < 1000) {
      break;
    }
  }

  return null;
}

async function migrateLegacySuspendedUser(email: string): Promise<boolean> {
  const authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    return false;
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
    ban_duration: 'none',
    app_metadata: buildUpdatedAppMetadata(authUser.app_metadata, 'suspended'),
  });

  if (error || !data.user) {
    console.error('[Auth] Failed to migrate legacy suspended account:', error);
    return false;
  }

  return true;
}

export async function loginUser(body: LoginBody): Promise<ServiceResult> {
  const { email, password } = body;
  
  let finalEmail = email.trim().toLowerCase();

  // If it does not contain '@', it might be a username.
  if (!finalEmail.includes('@')) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', finalEmail)
      .maybeSingle();

    if (profile && profile.id) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      
      if (userData?.user?.email) {
        finalEmail = userData.user.email;
      } else {
        return { success: false, error: 'User not found or invalid username', status: 404 };
      }
    } else {
      return { success: false, error: 'User not found or invalid username', status: 404 };
    }
  }

  const { data, error } = await createSupabaseAuthClient().auth.signInWithPassword({
    email: finalEmail,
    password,
  });

  if (error) {
    if (error.message.toLowerCase().includes('banned')) {
      const migrated = await migrateLegacySuspendedUser(finalEmail);

      if (migrated) {
        const retry = await createSupabaseAuthClient().auth.signInWithPassword({
          email: finalEmail,
          password,
        });

        if (!retry.error) {
          try {
            await ensureProfileForUser(retry.data.user);
          } catch (profileError) {
            console.error('[Auth] Failed to sync profile during suspended-login retry:', profileError);
            return { success: false, error: 'Unable to prepare your account profile', status: 500 };
          }

          return {
            success: true,
            data: {
              user: {
                id: retry.data.user.id,
                email: retry.data.user.email,
              },
              session: {
                access_token: retry.data.session.access_token,
                refresh_token: retry.data.session.refresh_token,
                expires_in: retry.data.session.expires_in,
                expires_at: retry.data.session.expires_at,
              },
            },
            status: 200,
          };
        }
      }
    }

    const message = mapAuthError(error.message);
    return { success: false, error: message, status: 401 };
  }

  try {
    await ensureProfileForUser(data.user);
  } catch (profileError) {
    console.error('[Auth] Failed to sync profile during login:', profileError);
    return { success: false, error: 'Unable to prepare your account profile', status: 500 };
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
