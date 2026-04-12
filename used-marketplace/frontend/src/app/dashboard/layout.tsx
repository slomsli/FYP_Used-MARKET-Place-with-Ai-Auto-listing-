'use client';

import { useState } from 'react';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import DashboardNavbar from '@/src/components/layout/DashboardNavbar';
import DashboardSidebar from '@/src/components/layout/DashboardSidebar';
import Spinner from '@/src/components/ui/Spinner';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, token, loading } = useRequireAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  require('react').useEffect(() => {
    if (token) {
      import('@/src/services/profileService').then(({ getProfile }) => {
        getProfile(token).then((res) => {
          if (res.data) {
            setAvatarPath(res.data.avatarPath);
          }
        });
      });
    }
  }, [token]);

  if (loading || !user) {
    return (
      <div className={styles.loading}>
        <Spinner size={32} className="text-navy-800" />
      </div>
    );
  }

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const role = user.user_metadata?.role || 'user';

  return (
    <div className={styles.shell}>
      <DashboardNavbar userName={displayName} avatarUrl={avatarPath} />

      <div className={styles.body}>
        {/* Mobile menu toggle */}
        <button
          className={styles.menuToggle}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle sidebar"
          id="sidebar-toggle"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <DashboardSidebar
          userName={displayName}
          userRole={role}
          avatarUrl={avatarPath}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
