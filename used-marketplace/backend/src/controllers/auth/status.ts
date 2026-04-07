import type { Request, Response } from 'express';
import { checkVerificationStatus } from '../../services/auth/status';
import { sendSuccess, sendError } from '../../utils/apiResponse';

export async function checkStatus(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    sendError(res, 'Email is required', 400);
    return;
  }

  const result = await checkVerificationStatus(email);

  if (!result.success) {
    sendError(res, result.error || 'Check failed', result.status);
    return;
  }

  sendSuccess(res, result.data, result.status);
}
