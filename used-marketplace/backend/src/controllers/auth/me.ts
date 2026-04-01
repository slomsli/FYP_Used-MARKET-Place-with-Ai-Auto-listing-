import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../types/auth';
import { getUserProfile } from '../../services/auth/getProfile';
import { sendSuccess, sendError } from '../../utils/apiResponse';

export async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Not authenticated', 401);
    }

    const result = await getUserProfile(req.user.id);

    if (!result.success) {
      return sendError(res, result.error!, result.status);
    }

    return sendSuccess(res, result.data, result.status);
  } catch (err) {
    console.error('[GetMe Error]', err);
    return sendError(res, 'Failed to fetch profile', 500);
  }
}
