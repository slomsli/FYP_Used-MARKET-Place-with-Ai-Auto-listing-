import type { Response, Request } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  getProfile,
  updateProfile,
  updateAvatar,
  removeAvatar,
  getStates,
  getAreasByState,
  ProfileServiceError,
} from '../services/profileService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handleProfileError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  if (error instanceof ProfileServiceError) {
    sendError(res, error.message, error.status);
    return;
  }

  console.error(fallbackMessage, error);
  sendError(res, fallbackMessage, 500);
}

/**
 * GET /api/dashboard/profile
 */
export async function getProfileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await getProfile(req.user.id);
    sendSuccess(res, data);
  } catch (error) {
    handleProfileError(res, error, 'Internal server error while fetching profile');
  }
}

/**
 * PATCH /api/dashboard/profile
 * Body: { fullName?, username?, phone?, stateId?, areaId?, latitude?, longitude? }
 */
export async function updateProfileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { fullName, username, phone, stateId, areaId, latitude, longitude } = req.body as {
      fullName?: string;
      username?: string;
      phone?: string;
      stateId?: number | null;
      areaId?: number | null;
      latitude?: number | string | null;
      longitude?: number | string | null;
    };

    const result = await updateProfile(req.user.id, {
      fullName,
      username,
      phone,
      stateId,
      areaId,
      latitude,
      longitude,
    });

    sendSuccess(res, result);
  } catch (error) {
    handleProfileError(res, error, 'Internal server error while updating profile');
  }
}

/**
 * PATCH /api/dashboard/profile/avatar
 * Body: { imageData: string (base64), mimeType: string }
 */
export async function updateAvatarHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { imageData, mimeType } = req.body as {
      imageData?: string;
      mimeType?: string;
    };

    if (!imageData || typeof imageData !== 'string') {
      sendError(res, 'imageData (base64) is required', 422);
      return;
    }

    if (!mimeType || typeof mimeType !== 'string') {
      sendError(res, 'mimeType is required', 422);
      return;
    }

    const result = await updateAvatar(req.user.id, imageData, mimeType);
    sendSuccess(res, result);
  } catch (error) {
    handleProfileError(res, error, 'Internal server error while updating avatar');
  }
}

/**
 * DELETE /api/dashboard/profile/avatar
 */
export async function removeAvatarHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const result = await removeAvatar(req.user.id);
    sendSuccess(res, result);
  } catch (error) {
    handleProfileError(res, error, 'Internal server error while removing avatar');
  }
}

/**
 * GET /api/dashboard/profile/states
 */
export async function getStatesHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const data = await getStates();
    sendSuccess(res, data);
  } catch (error) {
    handleProfileError(res, error, 'Internal server error while fetching states');
  }
}

/**
 * GET /api/dashboard/profile/states/:stateId/areas
 */
export async function getAreasHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const stateId = Number(req.params.stateId);
    if (isNaN(stateId)) {
      sendError(res, 'Invalid state ID', 422);
      return;
    }
    const data = await getAreasByState(stateId);
    sendSuccess(res, data);
  } catch (error) {
    handleProfileError(res, error, 'Internal server error while fetching areas');
  }
}
