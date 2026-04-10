'use client';

import styles from '../page.module.css';

export default function FavoritesPage() {
  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Favorites</h1>
        <p className={styles.welcomeSub}>
          Items you&apos;ve saved for later. Keep track of listings you love.
        </p>
      </section>

      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        padding: '3rem',
        textAlign: 'center',
        color: '#9ca3af',
        fontSize: '0.9375rem',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>❤️</div>
        <p style={{ fontWeight: 600, color: '#6b7280' }}>No favorites yet</p>
        <p style={{ marginTop: '0.25rem' }}>Browse the marketplace and save items you&apos;re interested in.</p>
      </div>
    </div>
  );
}
