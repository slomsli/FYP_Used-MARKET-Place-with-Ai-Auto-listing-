import { supabaseAdmin } from '../config/supabase';
import { isAccountSuspended } from '../utils/accountStatus';

/* ── Types ─────────────────────────────────────────────── */

export interface ProfileData {
  id: string;
  email: string | null;
  username: string;
  fullName: string | null;
  phone: string | null;
  avatarPath: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  stateId: number | null;
  areaId: number | null;
  stateName: string | null;
  areaName: string | null;
  accountStatus: 'active' | 'pending_verification' | 'suspended';
  isSuspended: boolean;
}

export interface UpdateProfileInput {
  fullName?: string;
  username?: string;
  phone?: string;
  stateId?: number | null;
  areaId?: number | null;
}

export interface StateLookup {
  id: number;
  name: string;
  slug: string;
}

export interface AreaLookup {
  id: number;
  name: string;
  slug: string;
  stateId: number;
}

export class ProfileServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ProfileServiceError';
    this.status = status;
  }
}

/* ── Helpers ───────────────────────────────────────────── */

type Relation<T> = T | T[] | null;

interface AuthProfileUser {
  email?: string;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  app_metadata?: {
    account_status?: unknown;
    [key: string]: unknown;
  } | null;
}

const AVATAR_BUCKET =
  process.env.SUPABASE_AVATARS_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET?.trim() ||
  'avatars';
const MAX_AVATAR_SIZE_BYTES = 8 * 1024 * 1024;
const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

let avatarBucketPromise: Promise<void> | null = null;

function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function deriveProfileAccountStatus(
  user: AuthProfileUser | null | undefined
): 'active' | 'pending_verification' | 'suspended' {
  if (isAccountSuspended(user)) {
    return 'suspended';
  }

  if (!user?.email_confirmed_at) {
    return 'pending_verification';
  }

  return 'active';
}

async function ensureAvatarBucket(): Promise<void> {
  if (!avatarBucketPromise) {
    avatarBucketPromise = (async () => {
      const bucketResult = await supabaseAdmin.storage.getBucket(AVATAR_BUCKET);

      if (bucketResult.data) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          AVATAR_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_AVATAR_SIZE_BYTES,
            allowedMimeTypes: AVATAR_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Profile] Failed to update avatar bucket:', updateError);
          throw new ProfileServiceError('Unable to prepare avatar storage', 500);
        }

        return;
      }

      const bucketErrorMessage = bucketResult.error?.message ?? '';
      const isMissingBucketError = /not found|does not exist|404/i.test(bucketErrorMessage);
      if (bucketResult.error && !isMissingBucketError) {
        console.error('[Profile] Failed to inspect avatar bucket:', bucketResult.error);
        throw new ProfileServiceError('Unable to prepare avatar storage', 500);
      }

      const { error: createError } = await supabaseAdmin.storage.createBucket(
        AVATAR_BUCKET,
        {
          public: true,
          fileSizeLimit: MAX_AVATAR_SIZE_BYTES,
          allowedMimeTypes: AVATAR_MIME_TYPES,
        }
      );

      if (createError && !/already exists/i.test(createError.message)) {
        console.error('[Profile] Failed to create avatar bucket:', createError);
        throw new ProfileServiceError('Unable to prepare avatar storage', 500);
      }

      if (createError) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          AVATAR_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_AVATAR_SIZE_BYTES,
            allowedMimeTypes: AVATAR_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Profile] Failed to sync avatar bucket settings:', updateError);
          throw new ProfileServiceError('Unable to prepare avatar storage', 500);
        }
      }
    })().catch((error) => {
      avatarBucketPromise = null;
      throw error;
    });
  }

  return avatarBucketPromise;
}

async function syncAuthUserMetadata(
  userId: string,
  metadataPatch: Record<string, unknown>
): Promise<void> {
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(
    userId
  );

  if (authError) {
    console.error('[Profile] Failed to fetch auth user metadata:', authError);
    return;
  }

  if (!authUser?.user) {
    console.error('[Profile] Auth user not found while syncing metadata:', userId);
    return;
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...(authUser.user.user_metadata ?? {}),
      ...metadataPatch,
    },
  });

  if (updateError) {
    console.error('[Profile] Failed to sync auth metadata:', updateError);
  }
}

/* ── Service Functions ─────────────────────────────────── */

/**
 * Get user profile.
 */
export async function getProfile(userId: string): Promise<ProfileData> {
  // Fetch the user's email from auth.users via supabaseAdmin
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authError) {
    console.error('[Profile] Failed to fetch auth user email:', authError);
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id, username, full_name, phone, avatar_path, role,
      created_at, updated_at, state_id, area_id,
      states!profiles_state_id_fkey ( id, name ),
      areas!profiles_area_id_fkey ( id, name )
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Profile] Failed to fetch profile:', error);
    throw new ProfileServiceError('Unable to load profile', 500);
  }

  if (!data) {
    throw new ProfileServiceError('Profile not found', 404);
  }

  const state = unwrapRelation(data.states as Relation<{ id: number; name: string }>);
  const area = unwrapRelation(data.areas as Relation<{ id: number; name: string }>);
  const accountStatus = deriveProfileAccountStatus(authUser?.user as AuthProfileUser | undefined);

  return {
    id: data.id,
    email: authUser?.user?.email ?? null,
    username: data.username,
    fullName: data.full_name,
    phone: data.phone,
    avatarPath: data.avatar_path,
    role: data.role,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    stateId: data.state_id,
    areaId: data.area_id,
    stateName: state?.name ?? null,
    areaName: area?.name ?? null,
    accountStatus,
    isSuspended: accountStatus === 'suspended',
  };
}

/**
 * Update user profile fields.
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<ProfileData> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.fullName !== undefined) {
    updates.full_name = input.fullName.trim() || null;
  }

  if (input.username !== undefined) {
    const trimmed = input.username.trim();
    if (!trimmed) {
      throw new ProfileServiceError('Username cannot be empty', 422);
    }
    if (trimmed.length < 3 || trimmed.length > 30) {
      throw new ProfileServiceError('Username must be 3–30 characters', 422);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      throw new ProfileServiceError('Username can only contain letters, numbers, and underscores', 422);
    }
    // Check uniqueness
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', trimmed)
      .neq('id', userId)
      .maybeSingle();
    if (existing) {
      throw new ProfileServiceError('Username is already taken', 409);
    }
    updates.username = trimmed;
  }

  if (input.phone !== undefined) {
    updates.phone = input.phone.trim() || null;
  }

  if (input.stateId !== undefined) {
    updates.state_id = input.stateId;
  }

  if (input.areaId !== undefined) {
    updates.area_id = input.areaId;
  }

  const metadataPatch: Record<string, unknown> = {};
  if (input.fullName !== undefined) {
    metadataPatch.full_name = input.fullName.trim() || null;
  }

  if (input.username !== undefined) {
    metadataPatch.username = input.username.trim();
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error('[Profile] Failed to update profile:', error);
    throw new ProfileServiceError('Failed to update profile', 500);
  }

  if (Object.keys(metadataPatch).length > 0) {
    await syncAuthUserMetadata(userId, metadataPatch);
  }

  return getProfile(userId);
}

/**
 * Get all states.
 */
export async function getStates(): Promise<StateLookup[]> {
  const { data, error } = await supabaseAdmin
    .from('states')
    .select('id, name, slug')
    .order('name');

  if (error) {
    console.error('[Profile] Failed to fetch states:', error);
    throw new ProfileServiceError('Unable to load states', 500);
  }

  return (data ?? []) as StateLookup[];
}

/**
 * Get areas by state ID.
 */
export async function getAreasByState(stateId: number): Promise<AreaLookup[]> {
  const { data, error } = await supabaseAdmin
    .from('areas')
    .select('id, name, slug, state_id')
    .eq('state_id', stateId)
    .order('name');

  if (error) {
    console.error('[Profile] Failed to fetch areas:', error);
    throw new ProfileServiceError('Unable to load areas', 500);
  }

  return (data ?? []).map((a: { id: number; name: string; slug: string; state_id: number }) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    stateId: a.state_id,
  }));
}

/**
 * Upload / update avatar.
 * Accepts a base64-encoded image, uploads to Supabase Storage, and updates the profile.
 */
export async function updateAvatar(
  userId: string,
  base64Data: string,
  mimeType: string
): Promise<{ avatarPath: string }> {
  // Validate input
  if (!base64Data) {
    throw new ProfileServiceError('Image data is required', 422);
  }

  if (!AVATAR_MIME_TYPES.includes(mimeType)) {
    throw new ProfileServiceError(
      `Unsupported image type. Allowed: ${AVATAR_MIME_TYPES.join(', ')}`,
      422
    );
  }

  // Decode base64
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_AVATAR_SIZE_BYTES) {
    throw new ProfileServiceError('Image must be smaller than 8MB', 422);
  }

  // Determine file extension
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = extMap[mimeType] || 'jpg';
  const filePath = `avatars/${userId}/avatar-${Date.now()}.${ext}`;

  await ensureAvatarBucket();

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadErr) {
    console.error('[Profile] Avatar upload failed:', uploadErr);
    throw new ProfileServiceError('Failed to upload avatar', 500);
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(filePath);

  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    throw new ProfileServiceError('Failed to get avatar URL', 500);
  }

  // Update profile
  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({
      avatar_path: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateErr) {
    console.error('[Profile] Failed to update avatar_path:', updateErr);
    throw new ProfileServiceError('Failed to save avatar', 500);
  }

  await syncAuthUserMetadata(userId, { avatar_path: publicUrl });

  return { avatarPath: publicUrl };
}

/**
 * Remove the user's avatar.
 */
export async function removeAvatar(userId: string): Promise<{ avatarPath: null }> {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      avatar_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[Profile] Failed to remove avatar:', error);
    throw new ProfileServiceError('Failed to remove avatar', 500);
  }

  await syncAuthUserMetadata(userId, { avatar_path: null });

  return { avatarPath: null };
}
