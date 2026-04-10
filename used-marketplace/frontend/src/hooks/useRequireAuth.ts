'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './useAuth';
import { ROUTES } from '@/src/config/routes';

export function useRequireAuth() {
  const { user, session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(ROUTES.LOGIN);
    }
  }, [user, loading, router]);

  return { user, session, token: session?.access_token, loading, isAuthenticated: !!user };
}
