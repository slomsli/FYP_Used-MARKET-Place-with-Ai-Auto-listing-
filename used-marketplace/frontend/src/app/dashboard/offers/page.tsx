'use client';

import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from '../page.module.css';

function getOfferContext() {
  if (typeof window === 'undefined') {
    return {
      listingId: '',
      intent: '',
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    listingId: params.get('listingId') ?? '',
    intent: params.get('intent') ?? '',
  };
}

export default function OffersPage() {
  const { listingId, intent } = getOfferContext();
  const intentLabel = intent === 'buy' ? 'purchase' : intent === 'offer' ? 'offer' : 'offer';

  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>Offers</h1>
        <p className={styles.welcomeSub}>
          View incoming and outgoing offers on your listings and watchlist.
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
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>Offers</div>
        <p style={{ fontWeight: 600, color: '#6b7280' }}>No offers yet</p>
        <p style={{ marginTop: '0.25rem' }}>
          {listingId
            ? `This page was opened for listing ${listingId} with a ${intentLabel} intent.`
            : 'When buyers make offers on your items, they&apos;ll show up here.'}
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
