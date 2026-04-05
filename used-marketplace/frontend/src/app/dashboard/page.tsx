'use client';

import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { signOut } from '@/src/services/authService';
import { ROUTES } from '@/src/config/routes';
import Spinner from '@/src/components/ui/Spinner';
import styles from './page.module.css';

const MarketIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
    <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" />
    <path d="M12 3v6" />
  </svg>
);

const LogOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useRequireAuth();

  if (loading || !user) {
    return (
      <div className={styles.loading}>
        <Spinner size={32} className="text-navy-800" />
      </div>
    );
  }

  const displayName = user.user_metadata?.full_name || user.email || 'User';
  const role = user.user_metadata?.role || 'user';

  const handleLogout = async () => {
    await signOut();
    router.push(ROUTES.LOGIN);
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src="/assets/images/remarket_harbor_style_logo_1.png" alt="Logo" style={{ height: '250px', width: 'auto' }} />
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOutIcon /> Log out
        </button>
      </header>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.welcome}>
          <h1 className={styles.welcomeTitle}>Welcome back, {displayName}!</h1>
          <p className={styles.welcomeSub}>
            Here&apos;s an overview of your marketplace activity.
          </p>
          <span className={styles.roleBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
            </svg>
            {role}
          </span>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconBlue}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5" /><path d="m21 3-7 7" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
            </div>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Active Listings</div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Completed Sales</div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconAmber}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Messages</div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconPurple}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Reviews</div>
          </div>
        </div>
      </main>
    </div>
  );
}
