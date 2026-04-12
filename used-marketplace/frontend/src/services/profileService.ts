const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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

interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

interface ApiResult {
  success?: boolean;
  data?: unknown;
  error?: string;
}

/* ── Helpers ───────────────────────────────────────────── */

async function parseJsonResponse(response: Response): Promise<ApiResult | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function authorizedRequest<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<ServiceResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });

    const result = await parseJsonResponse(response);

    if (response.ok && result?.success) {
      return {
        data: (result.data ?? null) as T | null,
        error: null,
      };
    }

    return {
      data: null,
      error: result?.error || `Request failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/* ── API functions ─────────────────────────────────────── */

/**
 * Get the current user's profile.
 */
export async function getProfile(
  token: string
): Promise<ServiceResponse<ProfileData>> {
  return authorizedRequest<ProfileData>(
    '/api/dashboard/profile',
    token,
    { method: 'GET' }
  );
}

/**
 * Upload / update avatar.
 */
export async function updateAvatar(
  token: string,
  imageData: string,
  mimeType: string
): Promise<ServiceResponse<{ avatarPath: string }>> {
  return authorizedRequest<{ avatarPath: string }>(
    '/api/dashboard/profile/avatar',
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ imageData, mimeType }),
    }
  );
}

/**
 * Remove avatar.
 */
export async function removeAvatar(
  token: string
): Promise<ServiceResponse<{ avatarPath: null }>> {
  return authorizedRequest<{ avatarPath: null }>(
    '/api/dashboard/profile/avatar',
    token,
    { method: 'DELETE' }
  );
}
