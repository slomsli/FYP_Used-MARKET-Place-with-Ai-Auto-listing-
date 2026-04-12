import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  getUserFavorites,
  toggleFavorite,
  checkFavoriteStatus,
  FavoriteServiceError,
  FAVORITES_SORT_OPTIONS,
  type FavoritesSortOption,
} from '../services/favoriteService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handleFavoriteError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  if (error instanceof FavoriteServiceError) {
    sendError(res, error.message, error.status);
    return;
  }

  console.error(fallbackMessage, error);
  sendError(res, fallbackMessage, 500);
}

function parseFavoritesSort(value: unknown): FavoritesSortOption {
  if (value === undefined) return 'recent';

  if (
    typeof value !== 'string' ||
    !FAVORITES_SORT_OPTIONS.includes(value as FavoritesSortOption)
  ) {
    throw new FavoriteServiceError(
      `sort must be one of: ${FAVORITES_SORT_OPTIONS.join(', ')}`,
      422
    );
  }

  return value as FavoritesSortOption;
}

/**
 * GET /api/dashboard/favorites
 */
export async function getFavorites(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const sort = parseFavoritesSort(req.query.sort);
    const data = await getUserFavorites(req.user.id, sort);
    sendSuccess(res, data);
  } catch (error) {
    handleFavoriteError(res, error, 'Internal server error while fetching favorites');
  }
}

/**
 * POST /api/dashboard/favorites/toggle
 * Body: { listingId: string }
 */
export async function toggleFavoriteHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { listingId } = req.body as { listingId?: string };

    if (!listingId || typeof listingId !== 'string' || !listingId.trim()) {
      sendError(res, 'listingId is required', 422);
      return;
    }

    const result = await toggleFavorite(req.user.id, listingId.trim());
    sendSuccess(res, result);
  } catch (error) {
    handleFavoriteError(res, error, 'Internal server error while toggling favorite');
  }
}

/**
 * POST /api/dashboard/favorites/check
 * Body: { listingIds: string[] }
 */
export async function checkFavoritesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { listingIds } = req.body as { listingIds?: string[] };

    if (!Array.isArray(listingIds)) {
      sendError(res, 'listingIds must be an array', 422);
      return;
    }

    const result = await checkFavoriteStatus(req.user.id, listingIds);
    sendSuccess(res, result);
  } catch (error) {
    handleFavoriteError(
      res,
      error,
      'Internal server error while checking favorite status'
    );
  }
}
