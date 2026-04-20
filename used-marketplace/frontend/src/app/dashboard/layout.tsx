'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/src/hooks/useAuth';
import { subscribeToDashboardProfileUpdates } from '@/src/lib/profileSync';
import DashboardNavbar from '@/src/components/layout/DashboardNavbar';
import {
  DashboardAccountProvider,
  type DashboardAccountStatus,
} from '@/src/components/layout/DashboardAccountContext';
import DashboardSidebar from '@/src/components/layout/DashboardSidebar';
import Spinner from '@/src/components/ui/Spinner';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, session, loading } = useAuth();
  const token = session?.access_token;
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<DashboardAccountStatus>('active');
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    import('@/src/services/profileService')
      .then(({ getProfile }) => {
        getProfile(token).then((res) => {
          if (cancelled) {
            return;
          }

          if (res.data) {
            setProfileName(res.data.fullName);
            setProfileRole(res.data.role);
            setAvatarPath(res.data.avatarPath);
            setAccountStatus(res.data.accountStatus);
          }

          setProfileLoading(false);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setProfileLoading(false);
        }
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

  if (loading || !user || profileLoading) {
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
  const isSuspended = accountStatus === 'suspended';
  const isListingRoute =
    pathname.startsWith('/dashboard/my-listings') ||
    pathname.startsWith('/dashboard/add-listing');
  const suspensionTitle = isListingRoute
    ? 'Listing access is suspended'
    : 'Marketplace actions are suspended';
  const suspensionText = isListingRoute
    ? 'Your account can still sign in and review existing inventory, but posting, editing, deleting, or completing listing actions is disabled until an admin reactivates your account.'
    : 'Your account can still sign in and browse the dashboard, but posting, offers, and standard marketplace actions are paused until an admin reactivates your account.';

  return (
    <DashboardAccountProvider
      value={{
        accountStatus,
        isSuspended,
      }}
    >
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
            {isSuspended && (
              <section className={styles.statusBanner} aria-live="polite">
                <p className={styles.statusBannerEyebrow}>Account notice</p>
                <h2 className={styles.statusBannerTitle}>{suspensionTitle}</h2>
                <p className={styles.statusBannerText}>{suspensionText}</p>
              </section>
            )}

            {children}
          </main>
        </div>
      </div>
    </DashboardAccountProvider>
  );
}
