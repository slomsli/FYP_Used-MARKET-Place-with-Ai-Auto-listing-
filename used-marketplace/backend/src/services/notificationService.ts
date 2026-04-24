import { supabaseAdmin } from '../config/supabase';

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

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  linkPath?: string | null;
}

interface RawNotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

function trimOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clampLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || !value || value < 1) {
    return 25;
  }

  return Math.min(value, 100);
}

function mapNotificationRow(row: RawNotificationRow): DashboardNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkPath: row.link_path,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  const rows = inputs
    .map((input) => {
      const userId = trimOptional(input.userId);
      const title = trimOptional(input.title);

      if (!userId || !title) {
        return null;
      }

      return {
        user_id: userId,
        type: input.type,
        title,
        body: trimOptional(input.body),
        link_path: trimOptional(input.linkPath),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from('notifications').insert(rows);

  if (error) {
    throw new Error(`Failed to create notifications: ${error.message}`);
  }
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await createNotifications([input]);
}

export async function getNotificationsForUser(
  userId: string,
  limit?: number
): Promise<NotificationsResponse> {
  const safeLimit = clampLimit(limit);
  const [notificationsResult, unreadResult] = await Promise.all([
    supabaseAdmin
      .from('notifications')
      .select('id, type, title, body, link_path, is_read, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),
  ]);

  if (notificationsResult.error) {
    throw new Error(`Failed to fetch notifications: ${notificationsResult.error.message}`);
  }

  if (unreadResult.error) {
    throw new Error(`Failed to count unread notifications: ${unreadResult.error.message}`);
  }

  return {
    unreadCount: unreadResult.count ?? 0,
    items: ((notificationsResult.data ?? []) as RawNotificationRow[]).map(mapNotificationRow),
  };
}

export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<DashboardNotification> {
  const normalizedNotificationId = trimOptional(notificationId);

  if (!normalizedNotificationId) {
    throw new Error('notificationId is required');
  }

  const { data: existingNotification, error: existingError } = await supabaseAdmin
    .from('notifications')
    .select('id, type, title, body, link_path, is_read, read_at, created_at')
    .eq('id', normalizedNotificationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to inspect notification: ${existingError.message}`);
  }

  if (!existingNotification) {
    throw new Error('Notification not found');
  }

  if (existingNotification.is_read) {
    return mapNotificationRow(existingNotification as RawNotificationRow);
  }

  const { data: updatedNotification, error: updateError } = await supabaseAdmin
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', normalizedNotificationId)
    .eq('user_id', userId)
    .select('id, type, title, body, link_path, is_read, read_at, created_at')
    .single();

  if (updateError || !updatedNotification) {
    throw new Error('Failed to mark notification as read');
  }

  return mapNotificationRow(updatedNotification as RawNotificationRow);
}

export async function markAllNotificationsAsRead(userId: string): Promise<{ updatedCount: number }> {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('id');

  if (error) {
    throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }

  return {
    updatedCount: data?.length ?? 0,
  };
}
