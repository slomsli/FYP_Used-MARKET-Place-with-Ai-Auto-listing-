import type { Response } from 'express';

/**
 * Send a JSON success response.
 */
export function sendSuccess(res: Response, data: unknown, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

/**
 * Send a JSON error response.
 */
export function sendError(res: Response, message: string, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}
