'use client';

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { subscribeToDashboardProfileUpdates } from '@/src/lib/profileSync';
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
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    import('@/src/services/profileService').then(({ getProfile }) => {
      getProfile(token).then((res) => {
        if (cancelled || !res.data) {
          return;
        }

        setProfileName(res.data.fullName);
        setProfileRole(res.data.role);
        setAvatarPath(res.data.avatarPath);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(
    () =>
      subscribeToDashboardProfileUpdates(({ fullName, avatarPath: nextAvatarPath, role }) => {
        if (fullName !== undefined) {
          setProfileName(fullName);
        }

        if (nextAvatarPath !== undefined) {
          setAvatarPath(nextAvatarPath);
        }

        if (role !== undefined) {
          setProfileRole(role);
        }
      }),
    []
  );

  if (loading || !user) {
    return (
      <div className={styles.loading}>
        <Spinner size={32} className="text-navy-800" />
      </div>
    );
  }

  const displayName =
    profileName?.trim() ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'User';
  const role = profileRole || user.user_metadata?.role || 'user';
  const resolvedAvatarPath =
    avatarPath ??
    (typeof user.user_metadata?.avatar_path === 'string'
      ? user.user_metadata.avatar_path
      : null);

  return (
    <div className={styles.shell}>
      <DashboardNavbar userName={displayName} avatarUrl={resolvedAvatarPath} />

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
          avatarUrl={resolvedAvatarPath}
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
