import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import type {
  AssistantChatRequestBody,
  AssistantSendPersistedMessageRequestBody,
  CreateAssistantThreadRequestBody,
} from '../types/assistant';
import { chatWithAssistant } from '../services/assistantService';
import {
  archiveAssistantThreadForUser,
  createAssistantThread,
  deleteAssistantThreadForUser,
  getAssistantThreadMessagesForUser,
  listAssistantThreadsForUser,
  sendAssistantMessage,
} from '../services/assistantThreadService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function getAuthenticatedUserId(
  req: AuthenticatedRequest,
  res: Response
): string | null {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return null;
  }

  return req.user.id;
}

function handleAssistantError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    sendError(res, error.message, error.status);
    return;
  }

  console.error('[Assistant] Request failed:', error);
  sendError(res, fallbackMessage, 500);
}

export async function assistantChatHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  try {
    const response = await chatWithAssistant({
      requestId: randomUUID(),
      userId,
      body: req.body as AssistantChatRequestBody,
    });

    sendSuccess(res, response);
  } catch (error) {
    handleAssistantError(
      res,
      error,
      'Internal server error while processing the assistant request'
    );
  }
}

export async function createAssistantThreadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  try {
    const thread = await createAssistantThread({
      userId,
      roleContext: (req.body as CreateAssistantThreadRequestBody | undefined)?.roleContext,
    });
    sendSuccess(res, thread, 201);
  } catch (error) {
    handleAssistantError(res, error, 'Internal server error while creating the assistant thread');
  }
}

export async function getAssistantThreadsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  try {
    const threads = await listAssistantThreadsForUser(userId);
    sendSuccess(res, threads);
  } catch (error) {
    handleAssistantError(res, error, 'Internal server error while loading assistant threads');
  }
}

export async function getAssistantThreadMessagesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { threadId } = req.params;

  try {
    const messages = await getAssistantThreadMessagesForUser(userId, threadId);
    sendSuccess(res, messages);
  } catch (error) {
    handleAssistantError(res, error, 'Internal server error while loading assistant messages');
  }
}

export async function deleteAssistantThreadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { threadId } = req.params;

  try {
    const result = await deleteAssistantThreadForUser(userId, threadId);
    sendSuccess(res, result);
  } catch (error) {
    handleAssistantError(res, error, 'Internal server error while deleting the assistant thread');
  }
}

export async function archiveAssistantThreadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { threadId } = req.params;

  try {
    const thread = await archiveAssistantThreadForUser(userId, threadId);
    sendSuccess(res, thread);
  } catch (error) {
    handleAssistantError(res, error, 'Internal server error while archiving the assistant thread');
  }
}

export async function sendAssistantMessageHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  try {
    const body = req.body as AssistantSendPersistedMessageRequestBody;
    const result = await sendAssistantMessage({
      requestId: randomUUID(),
      userId,
      threadId: body.threadId,
      message: body.message,
      roleContext: body.roleContext,
      currentPageContext: body.currentPageContext,
      selectedEntityContext: body.selectedEntityContext,
    });

    sendSuccess(res, result);
  } catch (error) {
    handleAssistantError(
      res,
      error,
      'Internal server error while processing the assistant message'
    );
  }
}
