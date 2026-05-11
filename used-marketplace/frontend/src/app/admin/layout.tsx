'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import DashboardSidebar from '@/src/components/layout/DashboardSidebar';
import Spinner from '@/src/components/ui/Spinner';
import { ROUTES } from '@/src/config/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { subscribeToDashboardProfileUpdates } from '@/src/lib/profileSync';
import {
  broadcastDashboardNotificationUpdate,
  subscribeToDashboardNotificationUpdates,
} from '@/src/lib/notificationSync';
import { getProfile } from '@/src/services/profileService';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type DashboardNotification,
} from '@/src/services/notificationService';
import { resolveSupabaseUserRole } from '@/src/utils/authHelpers';
import styles from './layout.module.css';

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 1 1 5.2 2c-.9.9-1.3 1.4-1.3 2.5" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z" />
    </svg>
  );
}

function formatRelative(iso: string) {
  const diff = Math.max(Math.floor((Date.now() - new Date(iso).getTime()) / 60000), 0);
  if (diff < 60) return `${diff || 1}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function resolveAdminNotificationPath(linkPath: string | null): string | null {
  if (!linkPath) {
    return null;
  }

  if (linkPath.startsWith(ROUTES.ADMIN)) {
    return linkPath;
  }

  if (linkPath.startsWith(ROUTES.NOTIFICATIONS)) {
    return linkPath.replace(ROUTES.NOTIFICATIONS, ROUTES.ADMIN_NOTIFICATIONS);
  }

  if (linkPath.startsWith(ROUTES.MESSAGES)) {
    return linkPath.replace(ROUTES.MESSAGES, ROUTES.ADMIN_MESSAGES);
  }

  if (linkPath.startsWith(ROUTES.DASHBOARD_SUPPORT)) {
    return linkPath.replace(ROUTES.DASHBOARD_SUPPORT, ROUTES.ADMIN_SUPPORT);
  }

  if (linkPath.startsWith(ROUTES.MY_LISTINGS)) {
    return ROUTES.ADMIN_LISTINGS;
  }

  return linkPath.startsWith('/dashboard') ? ROUTES.ADMIN : linkPath;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingState}>
          <Spinner size={34} className="text-navy-800" />
          <p>Preparing the admin console...</p>
        </div>
      }
    >
      <AdminLayoutShell>{children}</AdminLayoutShell>
    </Suspense>
  );
}

function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const { user, session, loading } = useAuth();
  const token = session?.access_token;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSearchPending, startSearchTransition] = useTransition();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // ── Notifications ──
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCountRef = useRef(0);
  const searchValue = searchParams.get('q') ?? '';
  const displayedUnreadCount = token ? unreadCount : 0;

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [notifOpen]);

  // Fetch notifications
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function loadNotifs() {
      const res = await getNotifications(token!, 8);
      if (!cancelled && res.data) {
        setUnreadCount(res.data.unreadCount);
        setNotifications(res.data.items);
        setNotificationError(null);
      } else if (!cancelled && res.error) {
        setNotificationError(res.error);
      }
    }
    void loadNotifs();
    const id = window.setInterval(() => { void loadNotifs(); }, 20000);
    const onFocus = () => { void loadNotifs(); };
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [token]);

  useEffect(() =>
    subscribeToDashboardNotificationUpdates(({ unreadCount: c }) => {
      if (typeof c === 'number') setUnreadCount(c);
    }),
  []);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  async function handleMarkAllRead() {
    if (!token || markingRead) return;
    setMarkingRead(true);
    const response = await markAllNotificationsRead(token);
    setMarkingRead(false);

    if (!response.data) {
      setNotificationError(response.error || 'Failed to mark notifications as read.');
      return;
    }

    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() })));
    setNotificationError(null);
    broadcastDashboardNotificationUpdate({ unreadCount: 0 });
  }

  async function handleOpenNotification(notification: DashboardNotification) {
    const nextPath = resolveAdminNotificationPath(notification.linkPath);

    if (token && !notification.isRead) {
      setBusyNotificationId(notification.id);
      const response = await markNotificationRead(token, notification.id);
      setBusyNotificationId(null);

      if (response.data) {
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === notification.id
              ? { ...item, isRead: true, readAt: response.data?.readAt ?? item.readAt }
              : item
          )
        );
        const nextCount = Math.max(unreadCountRef.current - 1, 0);
        setUnreadCount(nextCount);
        broadcastDashboardNotificationUpdate({ unreadCount: nextCount });
        setNotificationError(null);
      } else {
        setNotificationError(response.error || 'Failed to update notification.');
        if (!nextPath) {
          return;
        }
      }
    }

    setNotifOpen(false);

    if (nextPath) {
      router.push(nextPath);
    }
  }

  // Profile
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getProfile(token).then((response) => {
      if (cancelled) return;
      if (!response.data) { setProfileLoading(false); return; }
      setProfileName(response.data.fullName);
      setProfileRole(response.data.role);
      setAvatarPath(response.data.avatarPath);
      setProfileLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() =>
    subscribeToDashboardProfileUpdates(({ fullName, avatarPath: nextAvatarPath, role }) => {
      if (fullName !== undefined) setProfileName(fullName);
      if (nextAvatarPath !== undefined) setAvatarPath(nextAvatarPath);
      if (role !== undefined) setProfileRole(role);
    }),
  []);

  const displayName = profileName?.trim() || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin User';
  const isAdmin = resolveSupabaseUserRole(user, profileRole) === 'admin';
  const canSearch =
    pathname === ROUTES.ADMIN_REPORTS ||
    pathname === ROUTES.ADMIN_USERS ||
    pathname === ROUTES.ADMIN_LISTINGS ||
    pathname === ROUTES.ADMIN_STRUCTURE;
  const searchPlaceholder =
    pathname === ROUTES.ADMIN_REPORTS   ? 'Search reports, listings, reporters, or sellers...' :
    pathname === ROUTES.ADMIN_USERS     ? 'Search by name, email or ID...' :
    pathname === ROUTES.ADMIN_LISTINGS  ? 'Search listings, sellers, category, or location...' :
    pathname === ROUTES.ADMIN_STRUCTURE ? 'Search categories, regions, or districts...' :
    pathname === ROUTES.ADMIN_MESSAGES  ? 'Inbox search stays inside the messages workspace.' :
    pathname === ROUTES.ADMIN_SUPPORT   ? 'Use the support workspace filters to triage tickets.' :
    'Overview metrics refresh automatically.';

  if (loading || !user || profileLoading || !isAdmin) {
    return (
      <div className={styles.loadingState}>
        <Spinner size={34} className="text-navy-800" />
        <p>Preparing the admin console...</p>
      </div>
    );
  }

  const handleSearchChange = (value: string) => {
    if (!canSearch) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      nextParams.set('q', value.trim());
    } else {
      nextParams.delete('q');
    }
    startSearchTransition(() => {
      router.replace(`${pathname}${nextParams.size ? `?${nextParams.toString()}` : ''}`);
    });
  };

  return (
    <div className={styles.shell}>
      <DashboardSidebar
        mode="admin"
        userName={displayName}
        userRole="admin"
        avatarUrl={avatarPath}
      />

      <div className={styles.main}>
        <header className={styles.topbar}>
          <label className={styles.searchField}>
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              value={canSearch ? searchValue : ''}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              disabled={!canSearch}
            />
          </label>

          <div className={styles.topbarActions}>
            {/* ── Notification Bell ── */}
            <div className={styles.notifWrap} ref={notifRef}>
              <button
                type="button"
                className={`${styles.iconButton} ${displayedUnreadCount > 0 ? styles.iconButtonAlert : ''}`}
                aria-label={displayedUnreadCount > 0 ? `${displayedUnreadCount} unread notifications` : 'Notifications'}
                onClick={() => setNotifOpen((v) => !v)}
              >
                <BellIcon />
                {displayedUnreadCount > 0 && (
                  <span className={styles.notifBadge}>{displayedUnreadCount > 9 ? '9+' : displayedUnreadCount}</span>
                )}
              </button>

              {notifOpen && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifHeader}>
                    <span className={styles.notifTitle}>Notifications</span>
                    {displayedUnreadCount > 0 && (
                      <button
                        type="button"
                        className={styles.notifMarkAll}
                        onClick={handleMarkAllRead}
                        disabled={markingRead}
                      >
                        {markingRead ? 'Marking...' : 'Mark all read'}
                      </button>
                    )}
                  </div>

                  <div className={styles.notifList}>
                    {notifications.length === 0 ? (
                      <p className={styles.notifEmpty}>You&apos;re all caught up!</p>
                    ) : (
                      notifications.map((n) => {
                        const nextPath = resolveAdminNotificationPath(n.linkPath);
                        const isActionable = Boolean(nextPath) || !n.isRead;

                        return (
                        <div
                          key={n.id}
                          className={`${styles.notifItem} ${!n.isRead ? styles.notifItemUnread : ''} ${busyNotificationId === n.id ? styles.notifItemBusy : ''}`}
                          onClick={() => {
                            if (isActionable) void handleOpenNotification(n);
                          }}
                          role={isActionable ? 'button' : undefined}
                          tabIndex={isActionable ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (isActionable && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              void handleOpenNotification(n);
                            }
                          }}
                        >
                          <div className={styles.notifItemTop}>
                            <span className={styles.notifItemTitle}>{n.title}</span>
                            <span className={styles.notifItemTime}>{formatRelative(n.createdAt)}</span>
                          </div>
                          {n.body && <p className={styles.notifItemBody}>{n.body}</p>}
                          {!n.isRead && <span className={styles.notifDot} />}
                        </div>
                        );
                      })
                    )}
                  </div>

                  {notificationError && (
                    <p className={styles.notifError}>{notificationError}</p>
                  )}

                  <Link
                    href={ROUTES.ADMIN_NOTIFICATIONS}
                    className={styles.notifFooter}
                    onClick={() => setNotifOpen(false)}
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>

            {/* ── Guide & Settings ── */}
            <Link href={ROUTES.ADMIN_GUIDE} className={styles.iconButton} aria-label="Admin guide" title="Admin Guide">
              <HelpIcon />
              <span className={styles.iconLabel}>Guide</span>
            </Link>
            <Link href={ROUTES.ADMIN_STRUCTURE} className={styles.iconButton} aria-label="Admin structure settings" title="Structure Settings">
              <SettingsIcon />
              <span className={styles.iconLabel}>Settings</span>
            </Link>
          </div>
        </header>

        {isSearchPending && <div className={styles.searchingBadge}>Updating results...</div>}

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
