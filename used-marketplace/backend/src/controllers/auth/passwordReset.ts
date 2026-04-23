import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../utils/apiResponse';
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
} from '../../services/auth/passwordReset';

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    sendError(res, 'Email is required', 400);
    return;
  }

  const result = await requestPasswordResetOtp(email);

  if (!result.success) {
    sendError(res, result.error || 'Password reset request failed', result.status);
    return;
  }

  sendSuccess(res, result.data, result.status);
}

export async function verifyPasswordReset(req: Request, res: Response): Promise<void> {
  const { email, token } = req.body;

  if (!email || !token) {
    sendError(res, 'Email and reset code are required', 400);
    return;
  }

  const result = await verifyPasswordResetOtp(email, token);

  if (!result.success) {
    sendError(res, result.error || 'Password reset verification failed', result.status);
    return;
  }

  sendSuccess(res, result.data, result.status);
}
