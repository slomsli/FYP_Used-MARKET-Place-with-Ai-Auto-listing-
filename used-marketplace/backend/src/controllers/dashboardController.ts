import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { getDashboardSummary } from '../services/dashboardService';
import { sendSuccess, sendError } from '../utils/apiResponse';

export async function getSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const summary = await getDashboardSummary(req.user.id);
    sendSuccess(res, summary);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    sendError(res, 'Internal server error while fetching dashboard summary', 500);
  }
}
