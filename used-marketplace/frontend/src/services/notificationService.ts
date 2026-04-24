const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export type NotificationType =
  | 'message'
  | 'offer'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'listing_favorited'
  | 'listing_reported'
  | 'listing_sold'
  | 'system';

export interface DashboardNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkPath: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  unreadCount: number;
  items: DashboardNotification[];
}

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

async function authorizedRequest<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<ServiceResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
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

export async function getNotifications(
  token: string,
  limit = 50
): Promise<ServiceResponse<NotificationsResponse>> {
  return authorizedRequest<NotificationsResponse>(
    `/api/dashboard/notifications?limit=${encodeURIComponent(String(limit))}`,
    token,
    { method: 'GET' }
  );
}

export async function markNotificationRead(
  token: string,
  notificationId: string
): Promise<ServiceResponse<DashboardNotification>> {
  return authorizedRequest<DashboardNotification>(
    `/api/dashboard/notifications/${encodeURIComponent(notificationId)}/read`,
    token,
    { method: 'PATCH' }
  );
}

export async function markAllNotificationsRead(
  token: string
): Promise<ServiceResponse<{ updatedCount: number }>> {
  return authorizedRequest<{ updatedCount: number }>(
    '/api/dashboard/notifications/read-all',
    token,
    { method: 'PATCH' }
  );
}
