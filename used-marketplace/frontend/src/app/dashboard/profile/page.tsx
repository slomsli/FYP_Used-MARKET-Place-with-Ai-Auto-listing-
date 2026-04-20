'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';

/**
 * Profile page now redirects to Settings, where profile editing is integrated.
 */
export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.SETTINGS);
  }, [router]);

  return null;
}
