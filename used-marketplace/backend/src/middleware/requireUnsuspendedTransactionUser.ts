import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { sendError } from '../utils/apiResponse';
import { isAccountSuspended } from '../utils/accountStatus';

export function requireUnsuspendedTransactionUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  if (!isAccountSuspended(req.user)) {
    next();
    return;
  }

  sendError(
    res,
    'Your account is suspended. You can still browse the marketplace, but new listings, offers, and other transactional actions are disabled until an admin reactivates your account.',
    403
  );
}
