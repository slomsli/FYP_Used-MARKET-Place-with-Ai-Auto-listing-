'use client';

import styles from '../page.module.css';

export default function MessagesPage() {
  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Messages</h1>
        <p className={styles.welcomeSub}>
          Your inbox for buyer inquiries, seller communications, and deal negotiations.
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
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💬</div>
        <p style={{ fontWeight: 600, color: '#6b7280' }}>No messages yet</p>
        <p style={{ marginTop: '0.25rem' }}>When someone contacts you about a listing, it will appear here.</p>
      </div>
    </div>
  );
}
