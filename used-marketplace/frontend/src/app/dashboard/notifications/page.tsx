'use client';

import Link from 'next/link';
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
import styles from './notifications.module.css';

type FilterTab = 'all' | 'unread';

const MessageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const OfferIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const SuccessIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const AlertIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Recently';
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(Math.floor(diffMs / (1000 * 60)), 0);

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat('en-MY', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function getNotificationTypeLabel(type: DashboardNotification['type']): string {
  switch (type) {
    case 'offer':
      return 'Offer';
    case 'offer_accepted':
      return 'Accepted';
    case 'offer_rejected':
      return 'Rejected';
    case 'system':
      return 'System';
    case 'message':
    default:
      return 'Message';
  }
}

function getNotificationTone(type: DashboardNotification['type']): string {
  switch (type) {
    case 'offer':
      return styles.toneOffer;
    case 'offer_accepted':
      return styles.toneSuccess;
    case 'offer_rejected':
      return styles.toneDanger;
    case 'system':
      return styles.toneSystem;
    case 'message':
    default:
      return styles.toneMessage;
  }
}

function getNotificationIcon(type: DashboardNotification['type']) {
  switch (type) {
    case 'offer':
      return <OfferIcon />;
    case 'offer_accepted':
      return <SuccessIcon />;
    case 'offer_rejected':
    case 'system':
      return <AlertIcon />;
    case 'message':
    default:
      return <MessageIcon />;
  }
}

export default function NotificationsPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const syncUnreadCount = useCallback((unreadCount: number) => {
    broadcastDashboardNotificationUpdate({ unreadCount });
  }, []);

  const loadNotifications = useCallback(
    async (showLoader = true) => {
      if (!token) {
        if (showLoader) {
          setLoading(false);
        }
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      const response = await getNotifications(token, 100);

      if (response.data) {
        setData(response.data);
        setErrorMsg(null);
        syncUnreadCount(response.data.unreadCount);
      } else {
        setErrorMsg(response.error || 'Failed to load notifications');
      }

      if (showLoader) {
        setLoading(false);
      }
    },
    [syncUnreadCount, token]
  );

  const updateNotifications = useCallback(
    (updater: (current: NotificationsResponse) => NotificationsResponse) => {
      setData((current) => {
        if (!current) {
          return current;
        }

        const next = updater(current);
        syncUnreadCount(next.unreadCount);
        return next;
      });
    },
    [syncUnreadCount]
  );

  useEffect(() => {
    if (!user || !token) {
      return;
    }

    void loadNotifications();

    const intervalId = window.setInterval(() => {
      void loadNotifications(false);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadNotifications, token, user]);

  const handleMarkRead = useCallback(
    async (notification: DashboardNotification): Promise<boolean> => {
      if (!token || notification.isRead) {
        return true;
      }

      setBusyNotificationId(notification.id);
      const response = await markNotificationRead(token, notification.id);
      setBusyNotificationId(null);

      if (!response.data) {
        setErrorMsg(response.error || 'Failed to update notification');
        return false;
      }

      updateNotifications((current) => ({
        unreadCount: Math.max(
          current.unreadCount - (notification.isRead ? 0 : 1),
          0
        ),
        items: current.items.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                isRead: true,
                readAt: response.data?.readAt ?? item.readAt,
              }
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

      if (notification.linkPath) {
        router.push(notification.linkPath);
      }
    },
    [handleMarkRead, router]
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!token || !data || data.unreadCount === 0) {
      return;
    }

    setMarkingAll(true);
    const response = await markAllNotificationsRead(token);
    setMarkingAll(false);

    if (!response.data) {
      setErrorMsg(response.error || 'Failed to mark notifications as read');
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

  if (authLoading || !user) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.loadingText}>Loading notifications...</span>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <span className={styles.loadingText}>Loading notifications...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Activity Center</p>
          <h1 className={styles.title}>Notifications</h1>
          <p className={styles.subtitle}>
            {data?.unreadCount
              ? `You have ${data.unreadCount} unread notification${data.unreadCount === 1 ? '' : 's'}.`
              : 'Everything is caught up right now.'}
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void loadNotifications()}
          >
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

      <section className={styles.filterBar}>
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
      </section>

      {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}

      {filteredItems.length === 0 ? (
        <section className={styles.emptyState}>
          <div className={styles.emptyIcon}>{getNotificationIcon('message')}</div>
          <h2 className={styles.emptyTitle}>
            {filterTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </h2>
          <p className={styles.emptyText}>
            {filterTab === 'unread'
              ? 'You have already cleared everything in your inbox.'
              : 'New offers, messages, support updates, and admin actions will appear here.'}
          </p>
          <div className={styles.emptyActions}>
            <Link href={ROUTES.MESSAGES} className={styles.primaryLink}>
              Open Messages
            </Link>
            <Link href={ROUTES.BROWSE} className={styles.secondaryLink}>
              Browse Listings
            </Link>
          </div>
        </section>
      ) : (
        <section className={styles.list}>
          {filteredItems.map((notification) => (
            <article
              key={notification.id}
              className={`${styles.card} ${notification.isRead ? styles.cardRead : styles.cardUnread}`}
            >
              <div className={`${styles.cardIcon} ${getNotificationTone(notification.type)}`}>
                {getNotificationIcon(notification.type)}
              </div>

              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <div>
                    <div className={styles.cardMeta}>
                      <span className={styles.typePill}>
                        {getNotificationTypeLabel(notification.type)}
                      </span>
                      <span className={styles.timeLabel}>
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <h2 className={styles.cardTitle}>{notification.title}</h2>
                  </div>

                  {!notification.isRead && <span className={styles.unreadDot} />}
                </div>

                {notification.body && (
                  <p className={styles.cardText}>{notification.body}</p>
                )}

                <div className={styles.cardActions}>
                  {notification.linkPath && (
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
          ))}
        </section>
      )}
    </div>
  );
}
