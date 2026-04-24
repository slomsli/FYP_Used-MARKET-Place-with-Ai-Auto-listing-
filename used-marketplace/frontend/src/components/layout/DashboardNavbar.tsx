'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { subscribeToDashboardNotificationUpdates } from '@/src/lib/notificationSync';
import { getNotifications } from '@/src/services/notificationService';
import styles from './DashboardNavbar.module.css';

interface DashboardNavbarProps {
  userName?: string;
  avatarUrl?: string | null;
  authToken?: string | null;
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
}: DashboardNavbarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  useEffect(() => {
    if (!authToken) {
      setUnreadNotificationCount(0);
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
    router.push(nextQuery ? `${ROUTES.BROWSE}?q=${encodeURIComponent(nextQuery)}` : ROUTES.BROWSE);
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
          <Link href={ROUTES.DASHBOARD} className={styles.navLinkActive}>Dashboard</Link>
          <Link href={ROUTES.BROWSE} className={styles.navLink}>Browse</Link>
          <Link href={ROUTES.SELLERS} className={styles.navLink}>Sellers</Link>
        </div>
      </div>

      {/* Right: Search + Icons */}
      <div className={styles.right}>
        <form className={styles.searchWrapper} onSubmit={handleSearchSubmit}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            type="text"
            placeholder="Search marketplace..."
            className={styles.searchInput}
            id="dashboard-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </form>

        <div className={styles.iconGroup}>
          <Link
            href={ROUTES.NOTIFICATIONS}
            className={`${styles.iconBtn} ${unreadNotificationCount > 0 ? styles.iconBtnAlert : ''}`}
            aria-label={
              unreadNotificationCount > 0
                ? `Notifications (${unreadNotificationCount} unread)`
                : 'Notifications'
            }
            id="notifications-btn"
          >
            <BellIcon />
            {unreadNotificationCount > 0 && (
              <span className={styles.iconBadge}>
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </Link>
          <Link href={ROUTES.MESSAGES} className={styles.iconBtn} aria-label="Messages" id="messages-btn">
            <MailIcon />
          </Link>
          <Link href={ROUTES.PROFILE} className={styles.avatarBtn} id="user-avatar-btn">
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
