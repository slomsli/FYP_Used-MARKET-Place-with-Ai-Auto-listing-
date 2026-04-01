import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../../utils/apiResponse';

export function validateRegister(req: Request, res: Response, next: NextFunction): void {
  const { fullName, username, email, password } = req.body;

  if (!fullName?.trim()) {
    sendError(res, 'Full name is required', 422);
    return;
  }

  if (!username?.trim()) {
    sendError(res, 'Username is required', 422);
    return;
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
    sendError(res, 'Username must be 3–20 characters', 422);
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    sendError(res, 'Username can only contain letters, numbers, and underscores', 422);
    return;
  }

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
  if (password.length < 8) {
    sendError(res, 'Password must be at least 8 characters', 422);
    return;
  }

  next();
}
