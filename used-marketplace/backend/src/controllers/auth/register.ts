import type { Request, Response } from 'express';
import { registerUser } from '../../services/auth/register';
import { sendSuccess, sendError } from '../../utils/apiResponse';

export async function register(req: Request, res: Response) {
  try {
    const result = await registerUser(req.body);

    if (!result.success) {
      return sendError(res, result.error!, result.status);
    }

    return sendSuccess(res, result.data, result.status);
  } catch (err) {
    console.error('[Register Error]', err);
    return sendError(res, 'Registration failed. Please try again.', 500);
  }
}
