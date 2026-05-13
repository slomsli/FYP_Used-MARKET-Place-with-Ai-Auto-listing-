'use client';

import { useState, useEffect } from 'react';
import { getPublicConfig } from '@/src/services/publicSettingsService';
import { usePathname } from 'next/navigation';

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const pathname = usePathname();
  
  // Don't show in admin console to avoid double banners or layout issues
  const isAdminRoute = pathname?.startsWith('/admin');

  useEffect(() => {
    if (isAdminRoute) return;
    
    getPublicConfig().then(res => {
      if (res.data?.platform_announcement) {
        setAnnouncement(res.data.platform_announcement);
      } else {
        setAnnouncement(null);
      }
    }).catch(() => {
      // Ignore errors silently
    });
  }, [isAdminRoute, pathname]); // Re-fetch occasionally or on navigation if needed, but this is fine

  if (isAdminRoute || !announcement) return null;

  return (
    <div style={{
      backgroundColor: '#1e40af',
      color: '#ffffff',
      textAlign: 'center',
      padding: '8px 16px',
      fontSize: '0.85rem',
      fontWeight: '500',
      letterSpacing: '0.02em',
      zIndex: 9999,
      position: 'relative'
    }}>
      {announcement}
    </div>
  );
}
