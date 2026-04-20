import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../config/supabase';

type ProfileRole = 'user' | 'admin';

interface ProfileSyncOverrides {
  fullName?: string | null;
  username?: string | null;
  role?: ProfileRole | null;
}

interface SyncedProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
  role: ProfileRole;
  created_at: string;
  state_id: number | null;
  area_id: number | null;
}

function trimOptional(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeRole(value: unknown): ProfileRole {
  return value === 'admin' ? 'admin' : 'user';
}

function sanitizeUsername(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);

  return normalized || 'user';
}

function buildUsernameCandidates(user: User, overrides?: ProfileSyncOverrides): string[] {
  const emailPrefix = user.email?.split('@')[0] ?? '';
  const metadata = user.user_metadata ?? {};

  return [
    overrides?.username ?? null,
    trimOptional(metadata.username),
    trimOptional(emailPrefix),
    `user_${user.id.replace(/-/g, '').slice(0, 8)}`,
  ]
    .map((value) => (value ? sanitizeUsername(value) : null))
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}

async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    console.error('[Auth] Failed to inspect username availability:', error);
    throw new Error('Unable to verify profile username availability');
  }

  return Boolean(data && data.id !== excludeUserId);
}

async function resolveAvailableUsername(
  user: User,
  overrides?: ProfileSyncOverrides
): Promise<string> {
  const candidates = buildUsernameCandidates(user, overrides);

  for (const candidate of candidates) {
    if (!(await isUsernameTaken(candidate, user.id))) {
      return candidate;
    }
  }

  const fallbackBase = sanitizeUsername(`user_${user.id.replace(/-/g, '').slice(0, 8)}`);

  for (let suffix = 1; suffix <= 50; suffix += 1) {
    const suffixLabel = `_${suffix}`;
    const maxBaseLength = Math.max(1, 20 - suffixLabel.length);
    const candidate = `${fallbackBase.slice(0, maxBaseLength)}${suffixLabel}`;

    if (!(await isUsernameTaken(candidate, user.id))) {
      return candidate;
    }
  }

  return `${fallbackBase.slice(0, 15)}_${Date.now().toString().slice(-4)}`;
}

function buildProfilePatch(
  existing: SyncedProfile,
  user: User,
  overrides?: ProfileSyncOverrides
): Partial<SyncedProfile> {
  const metadata = user.user_metadata ?? {};
  const fullName = trimOptional(overrides?.fullName) ?? trimOptional(metadata.full_name);
  const avatarPath = trimOptional(metadata.avatar_path);
  const desiredRole = normalizeRole(overrides?.role ?? metadata.role);
  const patch: Partial<SyncedProfile> = {};

  if (!existing.full_name && fullName) {
    patch.full_name = fullName;
  }

  if (!existing.avatar_path && avatarPath) {
    patch.avatar_path = avatarPath;
  }

  if (existing.role !== desiredRole) {
    patch.role = desiredRole;
  }

  return patch;
}

export async function ensureProfileForUser(
  user: User,
  overrides?: ProfileSyncOverrides
): Promise<SyncedProfile> {
  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, avatar_path, role, created_at, state_id, area_id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfileError) {
    console.error('[Auth] Failed to inspect existing profile:', existingProfileError);
    throw new Error('Unable to load profile state');
  }

  if (existingProfile) {
    const patch = buildProfilePatch(existingProfile as SyncedProfile, user, overrides);

    if (Object.keys(patch).length > 0) {
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('id, username, full_name, avatar_path, role, created_at, state_id, area_id')
        .single();

      if (updateError) {
        console.error('[Auth] Failed to update existing profile:', updateError);
        throw new Error('Unable to update profile');
      }

      return updatedProfile as SyncedProfile;
    }

    return existingProfile as SyncedProfile;
  }

  const metadata = user.user_metadata ?? {};
  const username = await resolveAvailableUsername(user, overrides);
  const fullName = trimOptional(overrides?.fullName) ?? trimOptional(metadata.full_name);
  const avatarPath = trimOptional(metadata.avatar_path);
  const role = normalizeRole(overrides?.role ?? metadata.role);

  const { data: createdProfile, error: createError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: user.id,
      username,
      full_name: fullName,
      avatar_path: avatarPath,
      role,
      updated_at: new Date().toISOString(),
    })
    .select('id, username, full_name, avatar_path, role, created_at, state_id, area_id')
    .single();

  if (createError) {
    if (createError.code === '23505') {
      const { data: conflictedProfile, error: conflictedProfileError } = await supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, avatar_path, role, created_at, state_id, area_id')
        .eq('id', user.id)
        .maybeSingle();

      if (conflictedProfileError) {
        console.error('[Auth] Failed to load existing profile after duplicate insert:', conflictedProfileError);
        throw new Error('Unable to load profile after duplicate insert');
      }

      if (conflictedProfile) {
        return conflictedProfile as SyncedProfile;
      }
    }

    console.error('[Auth] Failed to create missing profile:', createError);
    throw new Error('Unable to create profile');
  }

  return createdProfile as SyncedProfile;
}

export async function ensureProfileForUserId(
  userId: string,
  overrides?: ProfileSyncOverrides
): Promise<SyncedProfile> {
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (userError || !userData.user) {
    console.error('[Auth] Failed to fetch auth user for profile sync:', userError);
    throw new Error('Unable to load auth user');
  }

  return ensureProfileForUser(userData.user, overrides);
}
