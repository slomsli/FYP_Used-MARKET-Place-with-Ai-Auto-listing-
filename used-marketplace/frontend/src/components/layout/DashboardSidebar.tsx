'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { signOut } from '@/src/services/authService';
import styles from './DashboardSidebar.module.css';

type SidebarMode = 'dashboard' | 'admin';

interface DashboardSidebarProps {
  userName?: string;
  userRole?: string;
  avatarUrl?: string | null;
  isOpen?: boolean;
  onClose?: () => void;
  mode?: SidebarMode;
}

interface SidebarNavItem {
  label: string;
  icon: ReactNode;
  href: string;
  active?: boolean;
}

const DashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const ListingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5" /><path d="m21 3-7 7" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </svg>
);

const FavoritesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const MessagesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const TicketIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
    <path d="M9 9h6" />
    <path d="M9 15h4" />
  </svg>
);

const OffersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const ReceiptIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3h14v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3Z" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 4v5c0 5-3.2 8.8-7 10-3.8-1.2-7-5-7-10V7l7-4Z" />
    <path d="m9.5 12 1.8 1.8L14.8 10" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8" />
  </svg>
);

const AlertIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
  </svg>
);

const HelpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 1 1 5.2 2c-.9.9-1.3 1.4-1.3 2.5" />
    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const CategoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 7h7v7H3z" />
    <path d="M14 3h7v7h-7z" />
    <path d="M14 14h7v7h-7z" />
    <path d="M10 10l4-4" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

function getInitials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
}

function getDashboardNavItems(userRole: string | undefined): SidebarNavItem[] {
  return [
    { label: 'Dashboard', icon: <DashboardIcon />, href: ROUTES.DASHBOARD },
    { label: 'My Listings', icon: <ListingsIcon />, href: ROUTES.MY_LISTINGS },
    { label: 'Favorites', icon: <FavoritesIcon />, href: ROUTES.FAVORITES },
    { label: 'Messages', icon: <MessagesIcon />, href: ROUTES.MESSAGES },
    { label: 'Support', icon: <TicketIcon />, href: ROUTES.DASHBOARD_SUPPORT },
    { label: 'Offers', icon: <OffersIcon />, href: ROUTES.OFFERS },
    { label: 'Purchases', icon: <ReceiptIcon />, href: ROUTES.PURCHASES },
    ...(userRole === 'admin'
      ? [{ label: 'Admin Console', icon: <ShieldIcon />, href: ROUTES.ADMIN }]
      : []),
    { label: 'Settings', icon: <SettingsIcon />, href: ROUTES.SETTINGS },
  ];
}

function getAdminNavItems(pathname: string): SidebarNavItem[] {
  const isListingsRoute = pathname === ROUTES.ADMIN_LISTINGS || pathname.startsWith(`${ROUTES.ADMIN_LISTINGS}/`);

  return [
    { label: 'Overview', href: ROUTES.ADMIN, icon: <DashboardIcon />, active: pathname === ROUTES.ADMIN },
    { label: 'Reports', href: ROUTES.ADMIN_REPORTS, icon: <AlertIcon />, active: pathname === ROUTES.ADMIN_REPORTS },
    { label: 'Listings', href: ROUTES.ADMIN_LISTINGS, icon: <ListingsIcon />, active: isListingsRoute },
    { label: 'Users', href: ROUTES.ADMIN_USERS, icon: <UsersIcon />, active: pathname === ROUTES.ADMIN_USERS },
    { label: 'Messages', href: ROUTES.ADMIN_MESSAGES, icon: <MessagesIcon />, active: pathname === ROUTES.ADMIN_MESSAGES },
    { label: 'Support', href: ROUTES.ADMIN_SUPPORT, icon: <TicketIcon />, active: pathname === ROUTES.ADMIN_SUPPORT },
    { label: 'Guide', href: ROUTES.ADMIN_GUIDE, icon: <HelpIcon />, active: pathname === ROUTES.ADMIN_GUIDE },
    { label: 'Structure', href: ROUTES.ADMIN_STRUCTURE, icon: <CategoryIcon />, active: pathname === ROUTES.ADMIN_STRUCTURE },
    { label: 'Settings', href: ROUTES.ADMIN_SETTINGS, icon: <SettingsIcon />, active: pathname === ROUTES.ADMIN_SETTINGS },
  ];
}

export default function DashboardSidebar({
  userName,
  userRole,
  avatarUrl,
  isOpen,
  onClose,
  mode = 'dashboard',
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminMode = mode === 'admin';
  const displayName = userName || (isAdminMode ? 'Admin User' : 'User');
  const memberLabel = isAdminMode ? 'Administrator' : userRole === 'admin' ? 'Admin' : 'User';
  const navItems = isAdminMode ? getAdminNavItems(pathname) : getDashboardNavItems(userRole);

  const handleLogout = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.location.assign(ROUTES.LOGIN);
    } else {
      router.replace(ROUTES.LOGIN);
    }
  };

  const sidebarClassName = [
    styles.sidebar,
    isAdminMode ? styles.sidebarAdmin : '',
    isOpen ? styles.sidebarOpen : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      <aside className={sidebarClassName}>
        {isAdminMode && (
          <div className={styles.adminBrandBlock}>
            <p className={styles.adminConsoleLabel}>Admin Console</p>
            <h1 className={styles.adminBrandTitle}>Internal Operations</h1>
          </div>
        )}

        <div className={isAdminMode ? styles.adminProfileCard : styles.userSection}>
          <div className={isAdminMode ? styles.adminProfileAvatar : styles.userAvatar}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className={styles.avatarImg} />
            ) : (
              getInitials(displayName)
            )}
          </div>
          <div className={isAdminMode ? styles.adminProfileInfo : styles.userInfo}>
            <div className={isAdminMode ? styles.adminProfileName : styles.userName}>{displayName}</div>
            <div className={isAdminMode ? styles.adminProfileRole : styles.userRole}>{memberLabel}</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const isActive = item.active ?? pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                onClick={onClose}
                id={`sidebar-${item.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}

          {!isAdminMode && (
            <button
              onClick={handleLogout}
              className={styles.navItem}
              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', outline: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}
            >
              <span className={styles.navIcon}><LogoutIcon /></span>
              <span className={styles.navLabel} style={{ color: 'inherit' }}>Log Out</span>
            </button>
          )}
        </nav>

        {isAdminMode && (
          <div className={styles.adminSidebarFooter}>
            <button
              type="button"
              onClick={handleLogout}
              className={`${styles.navItem} ${styles.adminFooterNavButton}`}
            >
              <span className={styles.navIcon}><LogoutIcon /></span>
              <span className={styles.navLabel}>Log Out</span>
            </button>

            <Link href={ROUTES.BROWSE} className={styles.adminMarketplaceLink}>
              <DashboardIcon />
              <span>Marketplace View</span>
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
