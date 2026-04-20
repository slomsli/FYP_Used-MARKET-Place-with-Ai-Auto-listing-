import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../utils/apiResponse';
import { resendVerificationOtp, verifyEmailOtp } from '../../services/auth/verification';

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { email, token } = req.body;

  if (!email || !token) {
    sendError(res, 'Email and verification code are required', 400);
    return;
  }

  const result = await verifyEmailOtp(email, token);

  if (!result.success) {
    sendError(res, result.error || 'Verification failed', result.status);
    return;
  }

  sendSuccess(res, result.data, result.status);
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    sendError(res, 'Email is required', 400);
    return;
  }

  const result = await resendVerificationOtp(email);

  if (!result.success) {
    sendError(res, result.error || 'Resend failed', result.status);
    return;
  }

  sendSuccess(res, result.data, result.status);
}
