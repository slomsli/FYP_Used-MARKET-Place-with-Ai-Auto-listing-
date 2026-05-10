'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { signOut } from '@/src/services/authService';
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

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
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

function ListingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
      <path d="M8 5v14" />
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

function TicketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
      <path d="M9 9h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

function CategoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h7v7H3z" />
      <path d="M14 3h7v7h-7z" />
      <path d="M14 14h7v7h-7z" />
      <path d="M10 10l4-4" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 13h8V3H3z" />
      <path d="M13 21h8v-6h-8z" />
      <path d="M13 11h8V3h-8z" />
      <path d="M3 21h8v-4H3z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function getInitials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
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

  const handleLogout = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.location.assign(ROUTES.LOGIN);
    } else {
      router.replace(ROUTES.LOGIN);
    }
  };

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
    if (!token) { setUnreadCount(0); return; }
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
  const isListingsRoute = pathname === ROUTES.ADMIN_LISTINGS || pathname.startsWith(`${ROUTES.ADMIN_LISTINGS}/`);

  const navItems = useMemo(
    () => [
      { label: 'Overview',  href: ROUTES.ADMIN,           icon: <DashboardIcon />, active: pathname === ROUTES.ADMIN },
      { label: 'Reports',   href: ROUTES.ADMIN_REPORTS,   icon: <AlertIcon />,     active: pathname === ROUTES.ADMIN_REPORTS },
      { label: 'Listings',  href: ROUTES.ADMIN_LISTINGS,  icon: <ListingsIcon />,  active: isListingsRoute },
      { label: 'Users',     href: ROUTES.ADMIN_USERS,     icon: <UsersIcon />,     active: pathname === ROUTES.ADMIN_USERS },
      { label: 'Messages',  href: ROUTES.ADMIN_MESSAGES,  icon: <MessageIcon />,   active: pathname === ROUTES.ADMIN_MESSAGES },
      { label: 'Support',   href: ROUTES.ADMIN_SUPPORT,   icon: <TicketIcon />,    active: pathname === ROUTES.ADMIN_SUPPORT },
      { label: 'Guide',     href: ROUTES.ADMIN_GUIDE,     icon: <HelpIcon />,      active: pathname === ROUTES.ADMIN_GUIDE },
      { label: 'Structure', href: ROUTES.ADMIN_STRUCTURE, icon: <CategoryIcon />,  active: pathname === ROUTES.ADMIN_STRUCTURE },
    ],
    [isListingsRoute, pathname]
  );

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
      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <p className={styles.consoleLabel}>Admin Console</p>
          <h1 className={styles.brandTitle}>Internal Operations</h1>
        </div>

        <div className={styles.profileCard}>
          <div className={styles.profileAvatar}>
            {avatarPath ? (
              <img src={avatarPath} alt={displayName} className={styles.profileAvatarImage} />
            ) : (
              getInitials(displayName)
            )}
          </div>
          <div>
            <p className={styles.profileName}>{displayName}</p>
            <p className={styles.profileRole}>Administrator</p>
          </div>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`${styles.navItem} ${item.active ? styles.navItemActive : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}

        </nav>

        <div className={styles.sidebarFooter}>
          <button
            onClick={handleLogout}
            className={`${styles.navItem} ${styles.footerNavButton}`}
          >
            <span className={styles.navIcon}><LogoutIcon /></span>
            <span>Log Out</span>
          </button>

          <Link href={ROUTES.BROWSE} className={styles.dashboardLink}>
            <DashboardIcon />
            <span>Marketplace View</span>
          </Link>
        </div>
      </aside>

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
                className={`${styles.iconButton} ${unreadCount > 0 ? styles.iconButtonAlert : ''}`}
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                onClick={() => setNotifOpen((v) => !v)}
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className={styles.notifBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

              {notifOpen && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifHeader}>
                    <span className={styles.notifTitle}>Notifications</span>
                    {unreadCount > 0 && (
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
