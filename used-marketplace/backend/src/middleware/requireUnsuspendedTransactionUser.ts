import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { supabaseAdmin } from '../config/supabase';
import { sendError } from '../utils/apiResponse';
import { isAccountSuspended } from '../utils/accountStatus';

export async function requireMarketplaceUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) {
    console.error('[Marketplace] Failed to verify user role:', error);
    sendError(res, 'Unable to verify marketplace access', 500);
    return;
  }

  if (!data) {
    sendError(res, 'Unable to verify marketplace access', 403);
    return;
  }

  if (data.role === 'admin') {
    sendError(
      res,
      'Admin accounts can browse and manage the marketplace, but buying, selling, favorites, and standard member actions are disabled for this role.',
      403
    );
    return;
  }

  if (isAccountSuspended(req.user)) {
    sendError(
      res,
      'Your account is suspended. You can still browse the marketplace, but new listings, offers, and other transactional actions are disabled until an admin reactivates your account.',
      403
    );
    return;
  }

  next();
}

export const requireUnsuspendedTransactionUser = requireMarketplaceUser;
