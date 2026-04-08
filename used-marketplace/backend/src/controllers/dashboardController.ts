import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { getDashboardSummary } from '../services/dashboardService';
import { sendSuccess, sendError } from '../utils/apiResponse';

function parseOptionalMonth(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('month must use YYYY-MM format');
  }

  const month = Number(value.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('month must use a valid calendar month');
  }

  return value;
}

export async function getSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const month = parseOptionalMonth(req.query.month);
    const summary = await getDashboardSummary(req.user.id, month);
    sendSuccess(res, summary);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('month ')) {
      sendError(res, error.message, 422);
      return;
    }

    console.error('Error fetching dashboard summary:', error);
    sendError(res, 'Internal server error while fetching dashboard summary', 500);
  }
}
