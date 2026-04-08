'use client';

import styles from '../page.module.css';

export default function AddListingPage() {
  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Post New Item</h1>
        <p className={styles.welcomeSub}>
          Create a new listing with photos, descriptions, and pricing to reach buyers.
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
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📸</div>
        <p style={{ fontWeight: 600, color: '#6b7280' }}>Listing form coming soon</p>
        <p style={{ marginTop: '0.25rem' }}>AI-powered auto-listing with photo recognition will be available here.</p>
      </div>
    </div>
  );
}
