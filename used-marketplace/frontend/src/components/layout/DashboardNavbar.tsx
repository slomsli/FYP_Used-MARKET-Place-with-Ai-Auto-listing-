'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { subscribeToDashboardNotificationUpdates } from '@/src/lib/notificationSync';
import { getNotifications } from '@/src/services/notificationService';
import styles from './DashboardNavbar.module.css';

interface DashboardNavbarProps {
  userName?: string;
  avatarUrl?: string | null;
  authToken?: string | null;
  navItems?: Array<{
    href: string;
    label: string;
    isActive?: boolean;
  }>;
  notificationHref?: string;
  messagesHref?: string;
  profileHref?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
}

/* ── Inline SVG Icons ── */
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const MailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export default function DashboardNavbar({
  userName,
  avatarUrl,
  authToken,
  navItems: customNavItems,
  notificationHref = ROUTES.NOTIFICATIONS,
  messagesHref = ROUTES.MESSAGES,
  profileHref = ROUTES.PROFILE,
  searchValue,
  searchPlaceholder = 'Search marketplace...',
  onSearchChange,
  onSearchSubmit,
}: DashboardNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const navItems = customNavItems ?? [
    {
      href: ROUTES.DASHBOARD,
      label: 'Dashboard',
      isActive: pathname === ROUTES.DASHBOARD,
    },
    {
      href: ROUTES.BROWSE,
      label: 'Browse',
      isActive: pathname === ROUTES.BROWSE,
    },
    {
      href: ROUTES.ADD_LISTING,
      label: 'Sell',
      isActive: pathname.startsWith(ROUTES.ADD_LISTING),
    },
  ];
  const searchQuery = searchValue ?? internalSearchQuery;
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';
  const displayedUnreadNotificationCount = authToken ? unreadNotificationCount : 0;

  useEffect(() => {
    if (!authToken) {
      return;
    }

    const currentToken = authToken;
    let cancelled = false;

    async function loadUnreadCount() {
      const response = await getNotifications(currentToken, 10);

      if (!cancelled && response.data) {
        setUnreadNotificationCount(response.data.unreadCount);
      }
    }

    void loadUnreadCount();

    const intervalId = window.setInterval(() => {
      void loadUnreadCount();
    }, 20000);

    const handleFocus = () => {
      void loadUnreadCount();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [authToken]);

  useEffect(
    () =>
      subscribeToDashboardNotificationUpdates(({ unreadCount }) => {
        if (typeof unreadCount === 'number') {
          setUnreadNotificationCount(unreadCount);
        }
      }),
    []
  );

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuery = searchQuery.trim();
    if (onSearchSubmit) {
      onSearchSubmit(nextQuery);
      return;
    }

    router.push(nextQuery ? `${ROUTES.BROWSE}?q=${encodeURIComponent(nextQuery)}` : ROUTES.BROWSE);
  }

  function handleSearchChange(value: string) {
    if (onSearchChange) {
      onSearchChange(value);
      return;
    }

    setInternalSearchQuery(value);
  }

  return (
    <nav className={styles.navbar}>
      {/* Left: Brand + Nav Links */}
      <div className={styles.left}>
        <Link href={ROUTES.DASHBOARD} className={styles.brand}>
          <span className={styles.brandMark}>R</span>
          <span>ReMarket</span>
        </Link>

        <div className={styles.navLinks}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.isActive ? styles.navLinkActive : styles.navLink}
              aria-current={item.isActive ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Right: Search + Icons */}
      <div className={styles.right}>
        <form className={styles.searchWrapper} onSubmit={handleSearchSubmit}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            type="text"
            placeholder={searchPlaceholder}
            className={styles.searchInput}
            id="dashboard-search"
            value={searchQuery}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
        </form>

        <div className={styles.iconGroup}>
          <Link
            href={notificationHref}
            className={`${styles.iconBtn} ${displayedUnreadNotificationCount > 0 ? styles.iconBtnAlert : ''}`}
            aria-label={
              displayedUnreadNotificationCount > 0
                ? `Notifications (${displayedUnreadNotificationCount} unread)`
                : 'Notifications'
            }
            id="notifications-btn"
          >
            <BellIcon />
            {displayedUnreadNotificationCount > 0 && (
              <span className={styles.iconBadge}>
                {displayedUnreadNotificationCount > 9 ? '9+' : displayedUnreadNotificationCount}
              </span>
            )}
          </Link>
          <Link href={messagesHref} className={styles.iconBtn} aria-label="Messages" id="messages-btn">
            <MailIcon />
          </Link>
          <Link href={profileHref} className={styles.avatarBtn} id="user-avatar-btn">
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName || 'User'} className={styles.avatarImg} />
            ) : (
              <span className={styles.avatar}>{initials}</span>
            )}
          </Link>
        </div>
      </div>
    </nav>
  );
}
