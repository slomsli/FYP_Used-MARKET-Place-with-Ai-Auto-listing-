import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { sendSuccess, sendError } from '../utils/apiResponse';
import * as messageService from '../services/messageService';

function ensureAuthenticatedUser(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return null;
  }

  return req.user.id;
}

export async function getConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  try {
    const conversations = await messageService.getConversationsForUser(userId);
    sendSuccess(res, conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    sendError(res, 'Internal server error while fetching conversations', 500);
  }
}

export async function getArchivedConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  try {
    const archivedConversationIds = await messageService.getArchivedConversationIds(userId);
    sendSuccess(res, archivedConversationIds);
  } catch (error) {
    console.error('Error fetching archived conversations:', error);
    sendError(res, 'Internal server error while fetching archived conversations', 500);
  }
}

export async function getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  const { conversationId } = req.params;

  try {
    const messages = await messageService.getConversationMessages(conversationId, userId);
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
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId || !req.user) {
    return;
  }

  const { listing_id, content, recipient_id, attachments } = req.body;

  if (!listing_id) {
    sendError(res, 'Missing listing_id', 400);
    return;
  }

  try {
    const message = await messageService.sendMessage(req.user, {
      listing_id,
      content: typeof content === 'string' ? content : '',
      recipient_id,
      attachments: Array.isArray(attachments) ? attachments : [],
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
        error.message.includes('You cannot start a conversation with yourself') ||
        error.message.includes('required') ||
        error.message.includes('2000 characters') ||
        error.message.includes('images') ||
        error.message.includes('image')
      )
    ) {
      sendError(res, error.message, 400);
      return;
    }
    if (
      error instanceof Error &&
      (
        error.message.includes('suspended') ||
        error.message.includes('disabled for this role') ||
        error.message.includes('moderation thread')
      )
    ) {
      sendError(res, error.message, 403);
      return;
    }
    sendError(res, 'Internal server error while sending message', 500);
  }
}

export async function createSupportConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId || !req.user) {
    return;
  }

  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  if (!content && attachments.length === 0) {
    sendError(res, 'Support message text or an image is required', 400);
    return;
  }

  try {
    const result = await messageService.createSupportConversation(req.user, {
      subject,
      content,
      attachments,
    });
    sendSuccess(res, result, 201);
  } catch (error) {
    console.error('Error creating support conversation:', error);

    if (
      error instanceof Error &&
      (
        error.message.includes('required') ||
        error.message.includes('2000 characters') ||
        error.message.includes('images') ||
        error.message.includes('image') ||
        error.message.includes('No support admins') ||
        error.message.includes('Create at least one category')
      )
    ) {
      sendError(res, error.message, 422);
      return;
    }

    sendError(res, 'Internal server error while creating the support conversation', 500);
  }
}

export async function sendReply(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId || !req.user) {
    return;
  }

  const { conversationId } = req.params;
  const { content, attachments } = req.body;

  const safeContent = typeof content === 'string' ? content : '';
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  if (!safeContent.trim() && safeAttachments.length === 0) {
    sendError(res, 'Message text or an image is required', 400);
    return;
  }

  try {
    const message = await messageService.sendReply(req.user, conversationId, safeContent, safeAttachments);
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
        error.message.includes('disabled for this role') ||
        error.message.includes('moderation thread') ||
        error.message.includes('support ticket is closed')
      )
    ) {
      sendError(res, error.message, 403);
      return;
    }
    if (
      error instanceof Error &&
      (
        error.message.includes('required') ||
        error.message.includes('2000 characters') ||
        error.message.includes('images') ||
        error.message.includes('image')
      )
    ) {
      sendError(res, error.message, 422);
      return;
    }
    sendError(res, 'Internal server error while sending reply', 500);
  }
}

export async function updateSupportTicketStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId || !req.user) {
    return;
  }

  const { conversationId } = req.params;
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';

  if (!['open', 'resolved', 'closed'].includes(status)) {
    sendError(res, 'Unsupported support ticket status', 422);
    return;
  }

  try {
    const result = await messageService.updateSupportTicketStatus(
      req.user,
      conversationId,
      status as messageService.SupportTicketStatus
    );
    sendSuccess(res, result);
  } catch (error) {
    console.error('Error updating support ticket status:', error);

    if (
      error instanceof Error &&
      (
        error.message.includes('Conversation not found or access denied') ||
        error.message.includes('only available for support tickets')
      )
    ) {
      sendError(res, error.message, 403);
      return;
    }

    if (error instanceof Error && error.message.includes('Unsupported')) {
      sendError(res, error.message, 422);
      return;
    }

    sendError(res, 'Internal server error while updating the support ticket', 500);
  }
}

export async function markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  const { conversationId } = req.params;

  try {
    await messageService.markConversationAsRead(userId, conversationId);
    sendSuccess(res, { success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    sendError(res, 'Internal server error while marking as read', 500);
  }
}

export async function archiveConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  const { conversationId } = req.params;

  try {
    await messageService.archiveConversation(userId, conversationId);
    sendSuccess(res, { archived: true });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    if (error instanceof Error && error.message.includes('Conversation not found or access denied')) {
      sendError(res, error.message, 403);
      return;
    }
    sendError(res, 'Internal server error while archiving the conversation', 500);
  }
}

export async function unarchiveConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = ensureAuthenticatedUser(req, res);
  if (!userId) {
    return;
  }

  const { conversationId } = req.params;

  try {
    await messageService.unarchiveConversation(userId, conversationId);
    sendSuccess(res, { archived: false });
  } catch (error) {
    console.error('Error restoring conversation archive state:', error);
    if (error instanceof Error && error.message.includes('Conversation not found or access denied')) {
      sendError(res, error.message, 403);
      return;
    }
    sendError(res, 'Internal server error while restoring the conversation', 500);
  }
}
