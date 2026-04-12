import { supabaseAdmin } from '../config/supabase';

/* ── Types ─────────────────────────────────────────────── */

export interface ProfileData {
  id: string;
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

function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

/* ── Service Functions ─────────────────────────────────── */

/**
 * Get user profile.
 */
export async function getProfile(userId: string): Promise<ProfileData> {
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

  return {
    id: data.id,
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
  };
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

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedMimes.includes(mimeType)) {
    throw new ProfileServiceError(
      `Unsupported image type. Allowed: ${allowedMimes.join(', ')}`,
      422
    );
  }

  // Decode base64
  const buffer = Buffer.from(base64Data, 'base64');
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (buffer.length > maxSize) {
    throw new ProfileServiceError('Image must be smaller than 5MB', 422);
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

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabaseAdmin.storage
    .from('avatars')
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
    .from('avatars')
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

  return { avatarPath: null };
}
