'use client';

import { useRouter } from 'next/navigation';
import { signOut } from '@/src/services/authService';
import { ROUTES } from '@/src/config/routes';
import styles from '../page.module.css';

export default function SettingsPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push(ROUTES.LOGIN);
  };

  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Settings</h1>
        <p className={styles.welcomeSub}>
          Configure your account preferences, notifications, and security.
        </p>
      </section>

      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        padding: '2rem',
      }}>
        <div style={{
          padding: '1.25rem',
          background: '#f9fafb',
          borderRadius: '12px',
          fontSize: '0.875rem',
          color: '#6b7280',
          textAlign: 'center',
          marginBottom: '1.5rem',
        }}>
          Settings page is under construction. More options coming soon.
        </div>

        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>Account</h3>
          <button
            onClick={handleLogout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              background: 'transparent',
              border: '1px solid #fca5a5',
              borderRadius: '10px',
              color: '#dc2626',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'inherit',
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
