'use client';

import styles from '../page.module.css';

export default function OffersPage() {
  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Offers</h1>
        <p className={styles.welcomeSub}>
          View incoming and outgoing offers on your listings and watchlist.
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
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏷️</div>
        <p style={{ fontWeight: 600, color: '#6b7280' }}>No offers yet</p>
        <p style={{ marginTop: '0.25rem' }}>When buyers make offers on your items, they&apos;ll show up here.</p>
      </div>
    </div>
  );
}
