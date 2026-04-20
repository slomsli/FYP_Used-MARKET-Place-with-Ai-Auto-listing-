'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import styles from './DashboardNavbar.module.css';

interface DashboardNavbarProps {
  userName?: string;
  avatarUrl?: string | null;
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

export default function DashboardNavbar({ userName, avatarUrl }: DashboardNavbarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

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
          <img src="/assets/images/remarket_harbor_style_logo_1.png" alt="ReMarket" style={{ height: '100px', width: 'auto' }} />
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
          <Link href={ROUTES.OFFERS} className={styles.iconBtn} aria-label="Notifications" id="notifications-btn">
            <BellIcon />
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
