import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { supabaseAdmin } from '../config/supabase';
import { sendError } from '../utils/apiResponse';

/**
 * Verifies the Supabase JWT from the Authorization header.
 * On success, attaches the authenticated user to `req.user`.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 'Missing or invalid Authorization header', 401);
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      sendError(res, 'Invalid or expired token', 401);
      return;
    }

    req.user = data.user;
    next();
  } catch {
    sendError(res, 'Authentication failed', 401);
  }
}
