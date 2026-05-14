'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { broadcastDashboardNotificationUpdate } from '@/src/lib/notificationSync';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type DashboardNotification,
  type NotificationsResponse,
} from '@/src/services/notificationService';
import styles from './page.module.css';

type FilterTab = 'all' | 'unread';

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function OfferIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const diffMinutes = Math.max(Math.floor((Date.now() - timestamp) / 60000), 0);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat('en-MY', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function resolveAdminNotificationPath(linkPath: string | null): string | null {
  if (!linkPath) return null;
  if (linkPath.startsWith(ROUTES.ADMIN)) return linkPath;
  if (linkPath.startsWith(ROUTES.NOTIFICATIONS)) return linkPath.replace(ROUTES.NOTIFICATIONS, ROUTES.ADMIN_NOTIFICATIONS);
  if (linkPath.startsWith(ROUTES.MESSAGES)) return linkPath.replace(ROUTES.MESSAGES, ROUTES.ADMIN_MESSAGES);
  if (linkPath.startsWith(ROUTES.DASHBOARD_SUPPORT)) return linkPath.replace(ROUTES.DASHBOARD_SUPPORT, ROUTES.ADMIN_SUPPORT);
  if (linkPath.startsWith(ROUTES.MY_LISTINGS)) return ROUTES.ADMIN_LISTINGS;
  return linkPath.startsWith('/dashboard') ? ROUTES.ADMIN : linkPath;
}

function getNotificationIcon(type: DashboardNotification['type']) {
  switch (type) {
    case 'offer':
      return <OfferIcon />;
    case 'offer_accepted':
    case 'listing_sold':
      return <CheckIcon />;
    case 'offer_rejected':
    case 'listing_reported':
    case 'system':
      return <AlertIcon />;
    case 'message':
    default:
      return <MessageIcon />;
  }
}

function getNotificationTone(type: DashboardNotification['type']) {
  switch (type) {
    case 'offer':
      return styles.toneOffer;
    case 'offer_accepted':
    case 'listing_sold':
      return styles.toneSuccess;
    case 'offer_rejected':
    case 'listing_reported':
      return styles.toneDanger;
    case 'system':
      return styles.toneSystem;
    case 'message':
    default:
      return styles.toneMessage;
  }
}

function getNotificationTypeLabel(type: DashboardNotification['type']) {
  return type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function AdminNotificationsPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(
    async (showLoader = true) => {
      if (!token) {
        if (showLoader) setLoading(false);
        return;
      }

      if (showLoader) setLoading(true);
      const response = await getNotifications(token, 100);

      if (response.data) {
        setData(response.data);
        setErrorMsg(null);
      } else {
        setErrorMsg(response.error || 'Failed to load notifications.');
      }

      if (showLoader) setLoading(false);
    },
    [token]
  );

  const updateNotifications = useCallback(
    (updater: (current: NotificationsResponse) => NotificationsResponse) => {
      setData((current) => {
        if (!current) return current;
        return updater(current);
      });
    },
    []
  );

  useEffect(() => {
    if (typeof data?.unreadCount === 'number') {
      broadcastDashboardNotificationUpdate({ unreadCount: data.unreadCount });
    }
  }, [data?.unreadCount]);

  useEffect(() => {
    if (!user || !token) return;
    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications(false);
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications, token, user]);

  const handleMarkRead = useCallback(
    async (notification: DashboardNotification) => {
      if (!token || notification.isRead) return true;

      setBusyNotificationId(notification.id);
      const response = await markNotificationRead(token, notification.id);
      setBusyNotificationId(null);

      if (!response.data) {
        setErrorMsg(response.error || 'Failed to update notification.');
        return false;
      }

      updateNotifications((current) => ({
        unreadCount: Math.max(current.unreadCount - 1, 0),
        items: current.items.map((item) =>
          item.id === notification.id
            ? { ...item, isRead: true, readAt: response.data?.readAt ?? item.readAt }
            : item
        ),
      }));
      setErrorMsg(null);
      return true;
    },
    [token, updateNotifications]
  );

  const handleOpenNotification = useCallback(
    async (notification: DashboardNotification) => {
      await handleMarkRead(notification);
      const nextPath = resolveAdminNotificationPath(notification.linkPath);
      if (nextPath) router.push(nextPath);
    },
    [handleMarkRead, router]
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!token || !data || data.unreadCount === 0) return;

    setMarkingAll(true);
    const response = await markAllNotificationsRead(token);
    setMarkingAll(false);

    if (!response.data) {
      setErrorMsg(response.error || 'Failed to mark notifications as read.');
      return;
    }

    updateNotifications((current) => ({
      unreadCount: 0,
      items: current.items.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    }));
    setErrorMsg(null);
  }, [data, token, updateNotifications]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    return filterTab === 'unread' ? items.filter((item) => !item.isRead) : items;
  }, [data?.items, filterTab]);

  if (authLoading || !user || (loading && !data)) {
    return <div className={styles.emptyState}>Loading notifications...</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin Activity Center</p>
          <h1 className={styles.title}>Notifications</h1>
          <p className={styles.subtitle}>
            {data?.unreadCount
              ? `You have ${data.unreadCount} unread notification${data.unreadCount === 1 ? '' : 's'} to review.`
              : 'All admin notifications are caught up.'}
          </p>
        </div>

        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => void loadNotifications()}>
            Refresh
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleMarkAllRead()}
            disabled={markingAll || !data || data.unreadCount === 0}
          >
            {markingAll ? 'Updating...' : 'Mark all read'}
          </button>
        </div>
      </section>

      <div className={styles.filterBar}>
        {(['all', 'unread'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.filterTab} ${filterTab === tab ? styles.filterTabActive : ''}`}
            onClick={() => setFilterTab(tab)}
          >
            {tab === 'all' ? 'All notifications' : 'Unread only'}
          </button>
        ))}
      </div>

      {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}

      {filteredItems.length === 0 ? (
        <section className={styles.emptyState}>
          <div className={styles.emptyIcon}><BellIcon /></div>
          <h2>{filterTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}</h2>
          <p>
            {filterTab === 'unread'
              ? 'Everything in the admin queue has already been read.'
              : 'New support, moderation, and system activity will appear here.'}
          </p>
        </section>
      ) : (
        <section className={styles.list}>
          {filteredItems.map((notification) => {
            const nextPath = resolveAdminNotificationPath(notification.linkPath);

            return (
              <article
                key={notification.id}
                className={`${styles.card} ${notification.isRead ? styles.cardRead : styles.cardUnread}`}
              >
                <div className={`${styles.cardIcon} ${getNotificationTone(notification.type)}`}>
                  {getNotificationIcon(notification.type)}
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardMeta}>
                      <span className={styles.typePill}>{getNotificationTypeLabel(notification.type)}</span>
                      <span className={styles.timeLabel}>{formatRelativeTime(notification.createdAt)}</span>
                    </div>
                    {!notification.isRead && <span className={styles.unreadDot} />}
                  </div>

                  <h2 className={styles.cardTitle}>{notification.title}</h2>
                  {notification.body && <p className={styles.cardText}>{notification.body}</p>}

                  <div className={styles.cardActions}>
                    {nextPath && (
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => void handleOpenNotification(notification)}
                      >
                        Open
                      </button>
                    )}
                    {!notification.isRead && (
                      <button
                        type="button"
                        className={styles.actionButtonMuted}
                        onClick={() => void handleMarkRead(notification)}
                        disabled={busyNotificationId === notification.id}
                      >
                        {busyNotificationId === notification.id ? 'Saving...' : 'Mark as read'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
