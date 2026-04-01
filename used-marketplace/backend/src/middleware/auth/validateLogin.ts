import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../../utils/apiResponse';

export function validateLogin(req: Request, res: Response, next: NextFunction): void {
  const { email, password } = req.body;

  if (!email?.trim()) {
    sendError(res, 'Email is required', 422);
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    sendError(res, 'Please provide a valid email address', 422);
    return;
  }

  if (!password) {
    sendError(res, 'Password is required', 422);
    return;
  }

  next();
}
