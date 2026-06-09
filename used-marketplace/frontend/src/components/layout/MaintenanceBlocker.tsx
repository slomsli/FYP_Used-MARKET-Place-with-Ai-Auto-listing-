'use client';

import { useState, useEffect } from 'react';
import { getPublicConfig } from '@/src/services/publicSettingsService';
import { usePathname } from 'next/navigation';

export default function MaintenanceBlocker({ children }: { children: React.ReactNode }) {
  const [isMaintenance, setIsMaintenance] = useState<boolean | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    getPublicConfig().then(res => {
      if (res.data?.maintenance_mode) {
        setIsMaintenance(true);
      } else {
        setIsMaintenance(false);
      }
    }).catch(() => {
      setIsMaintenance(false); // Default to false on error to avoid accidentally locking everyone out
    });
  }, [pathname]);

  // If loading config, or if we are on login/admin routes, don't block immediately
  const isExcludedRoute = pathname?.startsWith('/admin') || pathname?.startsWith('/login');

  if (isMaintenance === null || isExcludedRoute) {
    return <>{children}</>;
  }

  // Check if user is admin (they bypass maintenance mode)
  // Actually, we don't have full profile here synchronously, but we can check if user is logged in
  // Let's assume if they have a session they might be admin, but properly we should check profile.
  // For simplicity, if maintenance mode is on, we show the screen unless they are on an excluded route.
  // Admins log in via /login and go to /admin.
  
  if (isMaintenance) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#f8fafc',
        fontFamily: 'var(--font-inter, sans-serif)',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1.5rem' }}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <h1 style={{ fontSize: '2.5rem', color: '#0f172a', margin: '0 0 1rem', fontWeight: 800 }}>Under Maintenance</h1>
        <p style={{ fontSize: '1.1rem', color: '#64748b', maxWidth: '500px', lineHeight: 1.6 }}>
          ReMarket is currently undergoing scheduled maintenance to improve your experience. 
          Please check back shortly.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
