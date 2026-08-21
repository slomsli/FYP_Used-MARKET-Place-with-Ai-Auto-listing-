const getAuthHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const MESSAGE_API_URL = `${API_BASE}/api/messages`;
export const MAX_MESSAGE_ATTACHMENTS = 3;
export const MAX_MESSAGE_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachments: MessageAttachment[];
  event: MessageEvent | null;
  is_read: boolean;
  created_at: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image';
  url: string;
  path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export interface MessageAttachmentUpload {
  fileName: string;
  contentType: string;
  base64Data: string;
}

export type SupportTicketStatus = 'open' | 'resolved' | 'closed';

export interface MessageEvent {
  type: 'ticket_status';
  ticket_status: SupportTicketStatus;
  label: string;
}

export interface ConversationDetail {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  created_at: string;
  other_user: {
    id: string;
    display_name: string;
    username: string | null;
    avatar_path: string | null;
    identity_verification_badge: boolean;
  } | null;
  listing_details: {
    title: string;
    cover_image_path: string | null;
    is_moderation: boolean;
    support_status: SupportTicketStatus | null;
  } | null;
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
    is_read: boolean;
  } | null;
  unread_count: number;
}

export interface SupportConversationResult {
  conversation_id: string;
  listing_id: string;
  listing_title: string;
  admin_id: string;
  admin_name: string;
  message: ChatMessage;
}

export interface SupportTicketStatusResult {
  conversation_id: string;
  status: SupportTicketStatus;
  message: ChatMessage;
}

export interface PendingMessageAttachment {
  id: string;
  fileName: string;
  contentType: string;
  base64Data: string;
  previewUrl: string;
  sizeBytes: number;
}

export function readImageFileForMessage(file: File): Promise<PendingMessageAttachment> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Only image files can be attached to messages.'));
  }

  if (file.size > MAX_MESSAGE_ATTACHMENT_SIZE_BYTES) {
    return Promise.reject(new Error('Each message image must be 4 MB or smaller.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64Data = result.includes(',') ? result.split(',').pop() ?? '' : result;

      if (!base64Data) {
        reject(new Error('Unable to read this image.'));
        return;
      }

      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        fileName: file.name,
        contentType: file.type,
        base64Data,
        previewUrl: URL.createObjectURL(file),
        sizeBytes: file.size,
      });
    };

    reader.onerror = () => reject(new Error('Unable to read this image.'));
    reader.readAsDataURL(file);
  });
}

export function toAttachmentUploads(attachments: PendingMessageAttachment[]): MessageAttachmentUpload[] {
  return attachments.map((attachment) => ({
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    base64Data: attachment.base64Data,
  }));
}

export function toPreviewMessageAttachments(
  attachments: PendingMessageAttachment[]
): MessageAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    type: 'image',
    url: attachment.previewUrl,
    path: '',
    file_name: attachment.fileName,
    content_type: attachment.contentType,
    size_bytes: attachment.sizeBytes,
  }));
}

export function revokePendingAttachmentPreviews(attachments: PendingMessageAttachment[]) {
  attachments.forEach((attachment) => {
    URL.revokeObjectURL(attachment.previewUrl);
  });
}

/**
 * Fetch all conversations for the authenticated user
 */
export async function fetchConversations(token: string): Promise<{ data: ConversationDetail[] | null; error: string | null }> {
  try {
    const res = await fetch(MESSAGE_API_URL, {
      headers: {
        ...getAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { data: null, error: errorData.error || 'Failed to fetch conversations' };
    }

    const json = await res.json();
    return { data: json.data as ConversationDetail[], error: null };
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return { data: null, error: 'Network error while fetching conversations' };
  }
}

export async function fetchArchivedConversationIds(
  token: string
): Promise<{ data: string[] | null; error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/archives`, {
      headers: {
        ...getAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errorData.error || 'Failed to fetch archived conversations',
      };
    }

    const json = await res.json();
    return { data: json.data as string[], error: null };
  } catch (error) {
    console.error('Error fetching archived conversations:', error);
    return { data: null, error: 'Network error while fetching archived conversations' };
  }
}

/**
 * Fetch messages for a specific conversation
 */
export async function fetchMessages(token: string, conversationId: string): Promise<{ data: ChatMessage[] | null; error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}`, {
      headers: {
        ...getAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { data: null, error: errorData.error || 'Failed to fetch messages' };
    }

    const json = await res.json();
    return { data: json.data as ChatMessage[], error: null };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { data: null, error: 'Network error while fetching messages' };
  }
}

/**
 * Send a new message or start a conversation
 */
export async function sendMessage(
  token: string,
  listingId: string,
  content: string,
  recipientId?: string,
  attachments: MessageAttachmentUpload[] = []
): Promise<{ data: ChatMessage | null; error: string | null }> {
  try {
    const res = await fetch(MESSAGE_API_URL, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        listing_id: listingId,
        content,
        recipient_id: recipientId,
        attachments,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { data: null, error: errorData.error || 'Failed to send message' };
    }

    const json = await res.json();
    return { data: json.data as ChatMessage, error: null };
  } catch (error) {
    console.error('Error sending message:', error);
    return { data: null, error: 'Network error while sending message' };
  }
}

export async function createSupportConversation(
  token: string,
  payload: { subject: string; content: string; attachments?: MessageAttachmentUpload[] }
): Promise<{ data: SupportConversationResult | null; error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/support`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { data: null, error: errorData.error || 'Failed to contact support' };
    }

    const json = await res.json();
    return { data: json.data as SupportConversationResult, error: null };
  } catch (error) {
    console.error('Error creating support conversation:', error);
    return { data: null, error: 'Network error while contacting support' };
  }
}

/**
 * Reply within an existing conversation
 */
export async function sendReply(
  token: string,
  conversationId: string,
  content: string,
  attachments: MessageAttachmentUpload[] = []
): Promise<{ data: ChatMessage | null; error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}/reply`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, attachments }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { data: null, error: errorData.error || 'Failed to send reply' };
    }

    const json = await res.json();
    return { data: json.data as ChatMessage, error: null };
  } catch (error) {
    console.error('Error sending reply:', error);
    return { data: null, error: 'Network error while sending reply' };
  }
}

export async function updateSupportTicketStatus(
  token: string,
  conversationId: string,
  status: SupportTicketStatus
): Promise<{ data: SupportTicketStatusResult | null; error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}/support-status`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { data: null, error: errorData.error || 'Failed to update support ticket' };
    }

    const json = await res.json();
    return { data: json.data as SupportTicketStatusResult, error: null };
  } catch (error) {
    console.error('Error updating support ticket status:', error);
    return { data: null, error: 'Network error while updating support ticket' };
  }
}

export async function deleteSupportTicket(
  token: string,
  conversationId: string
): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}/support-ticket`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { error: errorData.error || 'Failed to delete support ticket' };
    }

    return { error: null };
  } catch (error) {
    console.error('Error deleting support ticket:', error);
    return { error: 'Network error while deleting support ticket' };
  }
}

/**
 * Mark a conversation as read
 */
export async function markAsRead(token: string, conversationId: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}/read`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { error: errorData.error || 'Failed to mark as read' };
    }

    return { error: null };
  } catch (error) {
    console.error('Error marking as read:', error);
    return { error: 'Network error while marking as read' };
  }
}

export async function archiveConversation(
  token: string,
  conversationId: string
): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}/archive`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { error: errorData.error || 'Failed to archive conversation' };
    }

    return { error: null };
  } catch (error) {
    console.error('Error archiving conversation:', error);
    return { error: 'Network error while archiving conversation' };
  }
}

export async function unarchiveConversation(
  token: string,
  conversationId: string
): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}/archive`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { error: errorData.error || 'Failed to restore conversation' };
    }

    return { error: null };
  } catch (error) {
    console.error('Error restoring conversation archive state:', error);
    return { error: 'Network error while restoring conversation' };
  }
}
