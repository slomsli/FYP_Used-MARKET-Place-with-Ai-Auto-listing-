import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { sendSuccess, sendError } from '../utils/apiResponse';
import * as messageService from '../services/messageService';

export async function getConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const conversations = await messageService.getConversationsForUser(req.user.id);
    sendSuccess(res, conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    sendError(res, 'Internal server error while fetching conversations', 500);
  }
}

export async function getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const { conversationId } = req.params;

  try {
    const messages = await messageService.getConversationMessages(conversationId, req.user.id);
    sendSuccess(res, messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    if (error instanceof Error && error.message.includes('Conversation not found or access denied')) {
        sendError(res, error.message, 403);
        return;
    }
    sendError(res, 'Internal server error while fetching messages', 500);
  }
}

export async function sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const { listing_id, content, recipient_id } = req.body;

  if (!listing_id || !content) {
    sendError(res, 'Missing listing_id or content', 400);
    return;
  }

  try {
    const message = await messageService.sendMessage(req.user, {
      listing_id,
      content,
      recipient_id,
    });
    sendSuccess(res, message, 201);
  } catch (error) {
    console.error('Error sending message:', error);
    if (error instanceof Error && error.message === 'Listing not found') {
      sendError(res, error.message, 404);
      return;
    }
    if (
      error instanceof Error &&
      (
        error.message.includes('recipient_id is required') ||
        error.message.includes('You cannot start a conversation with yourself')
      )
    ) {
      sendError(res, error.message, 400);
      return;
    }
    if (
      error instanceof Error &&
      (
        error.message.includes('suspended') ||
        error.message.includes('moderation thread')
      )
    ) {
      sendError(res, error.message, 403);
      return;
    }
    sendError(res, 'Internal server error while sending message', 500);
  }
}

export async function sendReply(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const { conversationId } = req.params;
  const { content } = req.body;

  if (!content) {
    sendError(res, 'Missing content', 400);
    return;
  }

  try {
    const message = await messageService.sendReply(req.user, conversationId, content);
    sendSuccess(res, message, 201);
  } catch (error) {
    console.error('Error sending reply:', error);
    if (error instanceof Error && error.message.includes('Conversation not found or access denied')) {
        sendError(res, error.message, 403);
        return;
    }
    if (
      error instanceof Error &&
      (
        error.message.includes('suspended') ||
        error.message.includes('moderation thread')
      )
    ) {
      sendError(res, error.message, 403);
      return;
    }
    sendError(res, 'Internal server error while sending reply', 500);
  }
}

export async function markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const { conversationId } = req.params;

  try {
    await messageService.markConversationAsRead(req.user.id, conversationId);
    sendSuccess(res, { success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    sendError(res, 'Internal server error while marking as read', 500);
  }
}
