'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

type ListingTone = 'porcelain' | 'studio' | 'midnight';

interface ListingCard {
  id: string;
  title: string;
  price: string;
  views: string;
  likes: string;
  image: string;
  tone: ListingTone;
  status: string;
  accent: string;
}

const tabItems = ['Active', 'Sold', 'Drafts'] as const;

const listings: ListingCard[] = [
  {
    id: 'sneaker',
    title: 'Maison Heritage Sneakers',
    price: '$450',
    views: '1,240',
    likes: '84',
    image: '/assets/images/listings/listing-sneaker.svg',
    tone: 'porcelain',
    status: 'Active',
    accent: 'Verified',
  },
  {
    id: 'watch',
    title: 'Archival Chronograph',
    price: '$1,200',
    views: '850',
    likes: '42',
    image: '/assets/images/listings/listing-watch.svg',
    tone: 'studio',
    status: 'Active',
    accent: 'Limited',
  },
  {
    id: 'jacket',
    title: 'Vintage Biker Leather',
    price: '$890',
    views: '2,105',
    likes: '156',
    image: '/assets/images/listings/listing-jacket.svg',
    tone: 'midnight',
    status: 'Active',
    accent: 'Rare Find',
  },
];

const sellerStats = [
  { label: 'Total Sales', value: '$2,540' },
  { label: 'Active Items', value: '12' },
  { label: 'Seller Rating', value: '4.9' },
];

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h12" />
      <path d="M3 12h18" />
      <path d="M3 18h9" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35 10.55 20C5.4 15.24 2 12.11 2 8.28 2 5.27 4.27 3 7.28 3c1.7 0 3.33.79 4.42 2.03A5.97 5.97 0 0 1 16.12 3C19.13 3 21.4 5.27 21.4 8.28c0 3.83-3.4 6.96-8.55 11.72L12 21.35Z" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export default function MyListingsPage() {
  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Curated Inventory</p>
          <h1 className={styles.title}>Inventory Management</h1>
          <p className={styles.subtitle}>
            Curate and manage your high-end collection. Track listing performance and keep your
            digital showroom polished.
          </p>
        </div>

        <Link href={ROUTES.ADD_LISTING} className={styles.primaryCta}>
          Post New Item
        </Link>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.tabs} aria-label="Listing status tabs">
          {tabItems.map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tab} ${index === 0 ? styles.tabActive : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={styles.toolbarActions}>
          <button type="button" className={styles.utilityButton}>
            <FilterIcon />
            Filter
          </button>
          <button type="button" className={styles.utilityButton}>
            <SortIcon />
            Sort: Recent
          </button>
        </div>
      </section>

      <section className={styles.grid} aria-label="Listing cards">
        {listings.map((listing) => (
          <article key={listing.id} className={styles.card}>
            <div className={`${styles.media} ${styles[`tone${listing.tone}`]}`}>
              <div className={styles.badgeRow}>
                <span className={`${styles.badge} ${styles.statusBadge}`}>{listing.status}</span>
                <span className={`${styles.badge} ${styles.accentBadge}`}>{listing.accent}</span>
              </div>

              <div className={styles.imageWrap}>
                <Image
                  src={listing.image}
                  alt={listing.title}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1100px) 50vw, 33vw"
                  className={styles.image}
                  priority={listing.id === 'sneaker'}
                />
              </div>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{listing.title}</h2>
                <span className={styles.cardPrice}>{listing.price}</span>
              </div>

              <div className={styles.metaRow}>
                <span className={styles.metaItem}>
                  <EyeIcon />
                  {listing.views} views
                </span>
                <span className={styles.metaItem}>
                  <HeartIcon />
                  {listing.likes} likes
                </span>
              </div>

              <div className={styles.cardActions}>
                <button type="button" className={styles.editButton}>
                  Edit Details
                </button>
                <button type="button" className={styles.moreButton} aria-label={`More actions for ${listing.title}`}>
                  <DotsIcon />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.insights}>
        <div className={styles.insightsCopy}>
          <p className={styles.insightsEyebrow}>Seller Insights</p>
          <h2 className={styles.insightsTitle}>Your listings are performing 15% better than last month.</h2>
          <p className={styles.insightsText}>
            Check your detailed analytics for pricing trends, saved searches, and buyer activity.
          </p>
        </div>

        <div className={styles.insightsStats}>
          {sellerStats.map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
