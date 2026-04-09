'use client';

import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from '../page.module.css';

function getListingId() {
  if (typeof window === 'undefined') {
    return '';
  }

  return new URLSearchParams(window.location.search).get('listingId') ?? '';
}

export default function MessagesPage() {
  const listingId = getListingId();

  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Messages</h1>
        <p className={styles.welcomeSub}>
          Your inbox for buyer inquiries, seller communications, and deal negotiations.
        </p>
      </section>

      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
          padding: '3rem',
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: '0.9375rem',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>Inbox</div>
        <p style={{ fontWeight: 600, color: '#6b7280' }}>No messages yet</p>
        <p style={{ marginTop: '0.25rem' }}>
          {listingId
            ? `You arrived here from listing ${listingId}. This route is now wired for listing-specific conversations.`
            : 'When someone contacts you about a listing, it will appear here.'}
        </p>
        <Link
          href={listingId ? `/product/${listingId}` : ROUTES.BROWSE}
          style={{
            display: 'inline-flex',
            marginTop: '1rem',
            color: '#1f3c88',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {listingId ? 'Back to listing' : 'Browse listings'}
        </Link>
      </div>
    </div>
  );
}
