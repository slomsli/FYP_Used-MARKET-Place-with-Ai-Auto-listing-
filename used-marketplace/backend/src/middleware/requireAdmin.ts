import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { supabaseAdmin } from '../config/supabase';
import { sendError } from '../utils/apiResponse';

export async function requireAdmin(
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
    console.error('[Admin] Failed to verify admin access:', error);
    sendError(res, 'Unable to verify admin access', 500);
    return;
  }

  if (!data || data.role !== 'admin') {
    sendError(res, 'Admin access required', 403);
    return;
  }

  next();
}
