import type {
  AssistantChatPayload,
  AssistantPersistedMessage,
  AssistantResponse,
  AssistantSendMessagePayload,
  AssistantSendMessageResult,
  AssistantThreadSummary,
  CreateAssistantThreadPayload,
} from '@/src/types/assistant';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

interface ApiResult {
  success?: boolean;
  data?: unknown;
  error?: string;
}

async function parseJsonResponse(response: Response): Promise<ApiResult | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestAssistantApi<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<ServiceResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

    const result = await parseJsonResponse(response);

    if (response.ok && result?.success) {
      return {
        data: (result.data ?? null) as T | null,
        error: null,
      };
    }

    return {
      data: null,
      error: result?.error || `Request failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function createAssistantThread(
  token: string,
  payload: CreateAssistantThreadPayload
): Promise<ServiceResponse<AssistantThreadSummary>> {
  return requestAssistantApi<AssistantThreadSummary>(token, '/api/assistant/threads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listAssistantThreads(
  token: string
): Promise<ServiceResponse<AssistantThreadSummary[]>> {
  return requestAssistantApi<AssistantThreadSummary[]>(token, '/api/assistant/threads', {
    method: 'GET',
  });
}

export async function getAssistantThreadMessages(
  token: string,
  threadId: string
): Promise<ServiceResponse<AssistantPersistedMessage[]>> {
  return requestAssistantApi<AssistantPersistedMessage[]>(
    token,
    `/api/assistant/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: 'GET',
    }
  );
}

export async function archiveAssistantThread(
  token: string,
  threadId: string
): Promise<ServiceResponse<AssistantThreadSummary>> {
  return requestAssistantApi<AssistantThreadSummary>(
    token,
    `/api/assistant/threads/${encodeURIComponent(threadId)}/archive`,
    {
      method: 'PATCH',
    }
  );
}

export async function deleteAssistantThread(
  token: string,
  threadId: string
): Promise<ServiceResponse<{ threadId: string; deletedAt: string }>> {
  return requestAssistantApi<{ threadId: string; deletedAt: string }>(
    token,
    `/api/assistant/threads/${encodeURIComponent(threadId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function sendAssistantMessage(
  token: string,
  payload: AssistantSendMessagePayload
): Promise<ServiceResponse<AssistantSendMessageResult>> {
  // Build the body; only include image fields when present to keep payloads small
  const body: Record<string, unknown> = {
    threadId: payload.threadId,
    message: payload.message,
    roleContext: payload.roleContext,
    currentPageContext: payload.currentPageContext,
    selectedEntityContext: payload.selectedEntityContext,
  };

  if (payload.imageBase64 && payload.imageMimeType) {
    body.imageBase64 = payload.imageBase64;
    body.imageMimeType = payload.imageMimeType;
  }

  return requestAssistantApi<AssistantSendMessageResult>(token, '/api/assistant/message', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function chatWithAssistant(
  token: string,
  payload: AssistantChatPayload
): Promise<ServiceResponse<AssistantResponse>> {
  return requestAssistantApi<AssistantResponse>(token, '/api/assistant/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
