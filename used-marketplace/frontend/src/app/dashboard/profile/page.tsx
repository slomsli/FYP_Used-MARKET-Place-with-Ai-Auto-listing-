'use client';

import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import styles from '../page.module.css';

export default function ProfilePage() {
  const { user } = useRequireAuth();

  if (!user) return null;

  const displayName = user.user_metadata?.full_name || 'User';
  const email = user.email || '';
  const username = user.user_metadata?.username || '';

  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Profile</h1>
        <p className={styles.welcomeSub}>
          Manage your personal information and account settings.
        </p>
      </section>

      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        padding: '2rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '2rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1b2a4a, #4164a5)',
            color: 'white',
            fontSize: '1.25rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>{displayName}</div>
            {username && <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>@{username}</div>}
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.125rem' }}>{email}</div>
          </div>
        </div>

        <div style={{
          padding: '1.25rem',
          background: '#f9fafb',
          borderRadius: '12px',
          fontSize: '0.875rem',
          color: '#6b7280',
          textAlign: 'center',
        }}>
          Profile editing will be available soon.
        </div>
      </div>
    </div>
  );
}
