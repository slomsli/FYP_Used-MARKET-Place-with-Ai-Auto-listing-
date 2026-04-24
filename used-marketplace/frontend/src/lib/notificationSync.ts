'use client';

const NOTIFICATIONS_UPDATED_EVENT = 'dashboard-notifications-updated';

export interface DashboardNotificationUpdate {
  unreadCount?: number | null;
}

export function broadcastDashboardNotificationUpdate(update: DashboardNotificationUpdate): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<DashboardNotificationUpdate>(NOTIFICATIONS_UPDATED_EVENT, {
      detail: update,
    })
  );
}

export function subscribeToDashboardNotificationUpdates(
  listener: (update: DashboardNotificationUpdate) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<DashboardNotificationUpdate>).detail ?? {});
  };

  window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
}
