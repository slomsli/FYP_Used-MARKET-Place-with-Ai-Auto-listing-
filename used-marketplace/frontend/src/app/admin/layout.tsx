'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Spinner from '@/src/components/ui/Spinner';
import { ROUTES } from '@/src/config/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { subscribeToDashboardProfileUpdates } from '@/src/lib/profileSync';
import { getProfile } from '@/src/services/profileService';
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

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
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
  const searchValue = searchParams.get('q') ?? '';

  const handleLogout = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.location.assign(ROUTES.LOGIN);
    } else {
      router.replace(ROUTES.LOGIN);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getProfile(token).then((response) => {
      if (cancelled) {
        return;
      }

      if (!response.data) {
        setProfileLoading(false);
        return;
      }

      setProfileName(response.data.fullName);
      setProfileRole(response.data.role);
      setAvatarPath(response.data.avatarPath);
      setProfileLoading(false);
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

  const displayName = profileName?.trim() || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin User';
  const isAdmin = resolveSupabaseUserRole(user, profileRole) === 'admin';
  const canSearch =
    pathname === ROUTES.ADMIN_REPORTS ||
    pathname === ROUTES.ADMIN_USERS ||
    pathname === ROUTES.ADMIN_LISTINGS ||
    pathname === ROUTES.ADMIN_STRUCTURE;
  const searchPlaceholder = pathname === ROUTES.ADMIN_REPORTS
    ? 'Search reports, listings, reporters, or sellers...'
    : pathname === ROUTES.ADMIN_USERS
    ? 'Search by name, email or ID...'
    : pathname === ROUTES.ADMIN_LISTINGS
      ? 'Search listings, sellers, category, or location...'
    : pathname === ROUTES.ADMIN_STRUCTURE
      ? 'Search categories, regions, or districts...'
      : pathname === ROUTES.ADMIN_MESSAGES
        ? 'Inbox search stays inside the messages workspace.'
        : pathname === ROUTES.ADMIN_SUPPORT
          ? 'Use the support workspace filters to triage tickets.'
        : 'Overview metrics refresh automatically.';
  const isListingsRoute = pathname === ROUTES.ADMIN_LISTINGS || pathname.startsWith(`${ROUTES.ADMIN_LISTINGS}/`);

  const navItems = useMemo(
    () => [
      { label: 'Overview', href: ROUTES.ADMIN, icon: <DashboardIcon />, active: pathname === ROUTES.ADMIN },
      { label: 'Reports', href: ROUTES.ADMIN_REPORTS, icon: <AlertIcon />, active: pathname === ROUTES.ADMIN_REPORTS },
      { label: 'Listings', href: ROUTES.ADMIN_LISTINGS, icon: <ListingsIcon />, active: isListingsRoute },
      { label: 'Users', href: ROUTES.ADMIN_USERS, icon: <UsersIcon />, active: pathname === ROUTES.ADMIN_USERS },
      { label: 'Messages', href: ROUTES.ADMIN_MESSAGES, icon: <MessageIcon />, active: pathname === ROUTES.ADMIN_MESSAGES },
      { label: 'Support', href: ROUTES.ADMIN_SUPPORT, icon: <TicketIcon />, active: pathname === ROUTES.ADMIN_SUPPORT },
      { label: 'Guide', href: ROUTES.ADMIN_GUIDE, icon: <HelpIcon />, active: pathname === ROUTES.ADMIN_GUIDE },
      { label: 'Structure', href: ROUTES.ADMIN_STRUCTURE, icon: <CategoryIcon />, active: pathname === ROUTES.ADMIN_STRUCTURE },
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
    if (!canSearch) {
      return;
    }

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
          
          <button
            onClick={handleLogout}
            className={styles.navItem}
            style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', outline: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            <span className={styles.navIcon}><LogoutIcon /></span>
            <span style={{ color: 'inherit' }}>Log Out</span>
          </button>
        </nav>

        <Link href={ROUTES.BROWSE} className={styles.dashboardLink}>
          <DashboardIcon />
          <span>Marketplace View</span>
        </Link>
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
            <Link
              href={`${ROUTES.ADMIN_REPORTS}?status=pending`}
              className={styles.iconButton}
              aria-label="Pending reports"
            >
              <BellIcon />
            </Link>
            <Link href={ROUTES.ADMIN_GUIDE} className={styles.iconButton} aria-label="Admin guide">
              <HelpIcon />
            </Link>
            <Link href={ROUTES.ADMIN_STRUCTURE} className={styles.iconButton} aria-label="Admin structure settings">
              <SettingsIcon />
            </Link>
          </div>
        </header>

        {isSearchPending && <div className={styles.searchingBadge}>Updating results...</div>}

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
