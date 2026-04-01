import type { Request, Response } from 'express';
import { loginUser } from '../../services/auth/login';
import { sendSuccess, sendError } from '../../utils/apiResponse';

export async function login(req: Request, res: Response) {
  try {
    const result = await loginUser(req.body);

    if (!result.success) {
      return sendError(res, result.error!, result.status);
    }

    return sendSuccess(res, result.data, result.status);
  } catch (err) {
    console.error('[Login Error]', err);
    return sendError(res, 'Login failed. Please try again.', 500);
  }
}
