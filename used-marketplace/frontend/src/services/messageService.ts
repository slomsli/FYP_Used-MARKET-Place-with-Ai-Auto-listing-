const getAuthHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const MESSAGE_API_URL = `${API_BASE}/api/messages`;

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
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
  } | null;
  listing_details: {
    title: string;
    cover_image_path: string | null;
    is_moderation: boolean;
  } | null;
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
    is_read: boolean;
  } | null;
  unread_count: number;
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
  recipientId?: string
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

/**
 * Reply within an existing conversation
 */
export async function sendReply(token: string, conversationId: string, content: string): Promise<{ data: ChatMessage | null; error: string | null }> {
  try {
    const res = await fetch(`${MESSAGE_API_URL}/${conversationId}/reply`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
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
