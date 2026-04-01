import type { Request, Response, NextFunction } from 'express';

/**
 * Global error handler — catches unhandled errors thrown in route handlers.
 * Must have 4 params so Express recognises it as an error-handling middleware.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[Unhandled Error]', err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  return res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
}
