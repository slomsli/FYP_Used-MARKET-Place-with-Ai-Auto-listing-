import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { sendError, sendSuccess } from '../utils/apiResponse';
import {
  getNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/notificationService';

function ensureAuthenticatedUser(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return null;
  }

  return req.user.id;
}

function parseLimit(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('limit must be a positive integer');
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('limit must be a positive integer');
  }

  return parsed;
}

export async function getNotificationsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  try {
    const notifications = await getNotificationsForUser(userId, parseLimit(req.query.limit));
    sendSuccess(res, notifications);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('limit ')) {
      sendError(res, error.message, 422);
      return;
    }

    console.error('Error fetching notifications:', error);
    sendError(res, 'Internal server error while fetching notifications', 500);
  }
}

export async function markNotificationReadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  try {
    const notification = await markNotificationAsRead(userId, req.params.notificationId);
    sendSuccess(res, notification);
  } catch (error) {
    if (error instanceof Error && error.message === 'Notification not found') {
      sendError(res, error.message, 404);
      return;
    }

    if (error instanceof Error && error.message === 'notificationId is required') {
      sendError(res, error.message, 422);
      return;
    }

    console.error('Error marking notification as read:', error);
    sendError(res, 'Internal server error while marking notification as read', 500);
  }
}

export async function markAllNotificationsReadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  try {
    const result = await markAllNotificationsAsRead(userId);
    sendSuccess(res, result);
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    sendError(res, 'Internal server error while marking notifications as read', 500);
  }
}
