import { createSupabaseAuthClient, supabaseAdmin } from '../../config/supabase';
import { ensureProfileForUser } from './profileSync';
import type { LoginBody, ServiceResult } from '../../types/auth';
import { buildUpdatedAppMetadata } from '../../utils/accountStatus';

const AUTH_USER_EMAIL_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedAuthUser = {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
};

const authUserEmailCache = new Map<string, { expiresAt: number; user: CachedAuthUser }>();
const authUserEmailNegativeCache = new Map<string, number>();

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function toCachedAuthUser(user: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
}): CachedAuthUser {
  return {
    id: user.id,
    email: user.email ?? null,
    app_metadata:
      user.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata : {},
  };
}

function getCachedAuthUserByEmail(email: string): CachedAuthUser | null | undefined {
  const now = Date.now();
  const cachedMatch = authUserEmailCache.get(email);

  if (cachedMatch) {
    if (cachedMatch.expiresAt > now) {
      return cachedMatch.user;
    }

    authUserEmailCache.delete(email);
  }

  const negativeExpiresAt = authUserEmailNegativeCache.get(email);
  if (!negativeExpiresAt) {
    return undefined;
  }

  if (negativeExpiresAt > now) {
    return null;
  }

  authUserEmailNegativeCache.delete(email);
  return undefined;
}

function cacheAuthUsers(
  users: Array<{
    id: string;
    email?: string | null;
    app_metadata?: Record<string, unknown> | null;
  }>
): void {
  const expiresAt = Date.now() + AUTH_USER_EMAIL_CACHE_TTL_MS;

  users.forEach((user) => {
    const normalizedEmail = user.email ? normalizeEmail(user.email) : '';

    if (!normalizedEmail) {
      return;
    }

    authUserEmailCache.set(normalizedEmail, {
      expiresAt,
      user: toCachedAuthUser(user),
    });
    authUserEmailNegativeCache.delete(normalizedEmail);
  });
}

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
  const normalizedEmail = normalizeEmail(email);
  const cachedUser = getCachedAuthUserByEmail(normalizedEmail);

  if (cachedUser !== undefined) {
    return cachedUser;
  }

  const perPage = 1000;
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error('[Auth] Failed to search auth users during suspended-login migration:', error);
      return null;
    }

    cacheAuthUsers(data.users);

    const matchedUser = data.users.find(
      (user) => user.email && normalizeEmail(user.email) === normalizedEmail
    );

    if (matchedUser) {
      return toCachedAuthUser(matchedUser);
    }

    if (typeof data.lastPage === 'number' && data.lastPage > 0) {
      lastPage = data.lastPage;
    }

    if (!data.nextPage || data.users.length < perPage) {
      break;
    }

    page = data.nextPage;
  }

  authUserEmailNegativeCache.set(
    normalizedEmail,
    Date.now() + AUTH_USER_EMAIL_CACHE_TTL_MS
  );

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
  
  let finalEmail = normalizeEmail(email);

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
        cacheAuthUsers([userData.user]);
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
            cacheAuthUsers([retry.data.user]);
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
    cacheAuthUsers([data.user]);
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
