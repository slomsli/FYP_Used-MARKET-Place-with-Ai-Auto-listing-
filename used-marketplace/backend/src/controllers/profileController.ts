import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  getProfile,
  updateAvatar,
  removeAvatar,
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
