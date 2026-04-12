const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/* ── Types ─────────────────────────────────────────────── */

export type FavoritesSortOption =
  | 'recent'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc';

export interface FavoriteItemSummary {
  favoriteCreatedAt: string;
  listingId: string;
  title: string;
  description: string | null;
  brand: string | null;
  condition: string;
  conditionLabel: string;
  price: number;
  currency: string;
  negotiable: boolean;
  status: string;
  statusLabel: string;
  coverImagePath: string | null;
  imagePaths: string[];
  viewsCount: number;
  categoryName: string | null;
  categorySlug: string | null;
  locationLabel: string;
  seller: {
    id: string;
    displayName: string;
    avatarPath: string | null;
  };
}

export interface FavoritesPageResponse {
  totalCount: number;
  sort: FavoritesSortOption;
  items: FavoriteItemSummary[];
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
 * Get all favorites for the current user.
 */
export async function getFavorites(
  token: string,
  sort: FavoritesSortOption = 'recent'
): Promise<ServiceResponse<FavoritesPageResponse>> {
  const query = new URLSearchParams({ sort });
  return authorizedRequest<FavoritesPageResponse>(
    `/api/dashboard/favorites?${query.toString()}`,
    token,
    { method: 'GET' }
  );
}

/**
 * Toggle a favorite (add or remove).
 */
export async function toggleFavorite(
  token: string,
  listingId: string
): Promise<ServiceResponse<{ favorited: boolean; listingId: string }>> {
  return authorizedRequest<{ favorited: boolean; listingId: string }>(
    '/api/dashboard/favorites/toggle',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }
  );
}

/**
 * Check favorite status for a list of listing IDs.
 */
export async function checkFavoriteStatus(
  token: string,
  listingIds: string[]
): Promise<ServiceResponse<Record<string, boolean>>> {
  return authorizedRequest<Record<string, boolean>>(
    '/api/dashboard/favorites/check',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ listingIds }),
    }
  );
}
