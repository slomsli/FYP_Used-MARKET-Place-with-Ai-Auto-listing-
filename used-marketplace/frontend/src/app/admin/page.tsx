'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { getAdminOverview } from '@/src/services/adminService';
import type { AdminOverviewResponse } from '@/src/types/admin';
import styles from './page.module.css';

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  );
}

function ListingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h18" />
      <path d="M7 3v18" />
      <path d="M3 17h18" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function SoldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12l3 5-9 13L3 8l3-5Z" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function OfferIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function StructureIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h7v7H3z" />
      <path d="M14 3h7v7h-7z" />
      <path d="M14 14h7v7h-7z" />
      <path d="M10 10l4-4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15.55-6.36L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15.55 6.36L3 16" />
    </svg>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Recently';
  }

  const diffMinutes = Math.max(Math.floor((Date.now() - timestamp) / 60000), 0);

  if (diffMinutes < 60) {
    return `${diffMinutes || 1} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export default function AdminPage() {
  const { token } = useRequireAuth();
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getAdminOverview(token).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.data) {
        setOverview(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to load the admin overview.');
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, token]);

  if (loading && !overview) {
    return <div className={styles.emptyState}>Loading admin overview...</div>;
  }

  if (!overview) {
    return (
      <div className={styles.emptyState}>
        {error || 'The admin overview is not available right now.'}
      </div>
    );
  }

  const chartMax = Math.max(
    ...overview.activity.months.flatMap((month) => [month.users, month.listings, month.reports]),
    1
  );
  const statCards = [
    {
      label: 'Total Users',
      value: overview.stats.totalUsers,
      detail: `${overview.health.verificationRate}% verified accounts`,
      icon: <UsersIcon />,
      tone: styles.statCardInk,
    },
    {
      label: 'Active Listings',
      value: overview.stats.activeListings,
      detail: `${overview.health.activeRegions} regions with live supply`,
      icon: <ListingIcon />,
      tone: styles.statCardMint,
    },
    {
      label: 'Pending Reports',
      value: overview.stats.pendingReports,
      detail: `${overview.health.moderationThreads} moderation threads open`,
      icon: <AlertIcon />,
      tone: styles.statCardPeach,
    },
    {
      label: 'Sold Items',
      value: overview.stats.soldItems,
      detail: `${overview.stats.pendingOffers} pending offers still in the queue`,
      icon: <SoldIcon />,
      tone: styles.statCardSoft,
    },
    {
      label: 'Marketplace Offers',
      value: overview.stats.pendingOffers,
      detail: `${overview.health.pendingVerificationUsers} users still awaiting verification`,
      icon: <OfferIcon />,
      tone: styles.statCardNavy,
    },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Platform Control</p>
          <h1 className={styles.title}>Admin overview for the full marketplace.</h1>
          <p className={styles.subtitle}>
            Admin accounts stay management-only here. Buying, selling, favorites, and normal member
            tools are disabled so this workspace stays focused on coordination, moderation, and
            marketplace health.
          </p>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setLoading(true);
              setRefreshKey((value) => value + 1);
            }}
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
          <Link href={ROUTES.ADMIN_LISTINGS} className={styles.primaryButton}>
            <ListingIcon />
            <span>Manage Listings</span>
          </Link>
          <Link href={ROUTES.ADMIN_REPORTS} className={styles.secondaryButton}>
            <AlertIcon />
            <span>Open Reports</span>
          </Link>
          <Link href={ROUTES.ADMIN_MESSAGES} className={styles.secondaryButton}>
            <MessageIcon />
            <span>Open Inbox</span>
          </Link>
        </div>
      </section>

      <section className={styles.statsGrid}>
        {statCards.map((card) => (
          <article key={card.label} className={`${styles.statCard} ${card.tone}`}>
            <div className={styles.statIcon}>{card.icon}</div>
            <p className={styles.statLabel}>{card.label}</p>
            <h2 className={styles.statValue}>{card.value.toLocaleString()}</h2>
            <p className={styles.statDetail}>{card.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Last Six Months</p>
              <h2>Marketplace activity</h2>
            </div>
            <div className={styles.chartLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendUsers}`} />
                Users
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendListings}`} />
                Listings
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendReports}`} />
                Reports
              </span>
            </div>
          </div>

          <div className={styles.chartGrid}>
            {overview.activity.months.map((month) => (
              <div key={month.value} className={styles.chartColumn}>
                <div className={styles.chartBars}>
                  <span
                    className={`${styles.chartBar} ${styles.chartUsers}`}
                    style={{ height: `${Math.max((month.users / chartMax) * 100, month.users ? 10 : 4)}%` }}
                    title={`${month.label}: ${month.users} user(s)`}
                  />
                  <span
                    className={`${styles.chartBar} ${styles.chartListings}`}
                    style={{ height: `${Math.max((month.listings / chartMax) * 100, month.listings ? 10 : 4)}%` }}
                    title={`${month.label}: ${month.listings} listing(s)`}
                  />
                  <span
                    className={`${styles.chartBar} ${styles.chartReports}`}
                    style={{ height: `${Math.max((month.reports / chartMax) * 100, month.reports ? 10 : 4)}%` }}
                    title={`${month.label}: ${month.reports} report(s)`}
                  />
                </div>
                <span className={styles.chartLabel}>{month.label}</span>
              </div>
            ))}
          </div>

          <div className={styles.chartSummary}>
            <div>
              <span>Pending verification</span>
              <strong>{overview.health.pendingVerificationUsers.toLocaleString()}</strong>
            </div>
            <div>
              <span>Suspended users</span>
              <strong>{overview.health.suspendedUsers.toLocaleString()}</strong>
            </div>
            <div>
              <span>Sold this period</span>
              <strong>
                {overview.activity.months
                  .reduce((sum, month) => sum + month.soldItems, 0)
                  .toLocaleString()}
              </strong>
            </div>
          </div>
        </article>

        <aside className={styles.sideColumn}>
          <article className={styles.panel}>
            <p className={styles.sectionEyebrow}>Operational Focus</p>
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span>Email verification</span>
                <strong>{overview.health.verificationRate}%</strong>
              </div>
              <div className={styles.metricRow}>
                <span>Suspended accounts</span>
                <strong>{overview.health.suspendedUsers.toLocaleString()}</strong>
              </div>
              <div className={styles.metricRow}>
                <span>Moderation threads</span>
                <strong>{overview.health.moderationThreads.toLocaleString()}</strong>
              </div>
              <div className={styles.metricRow}>
                <span>Active regions</span>
                <strong>{overview.health.activeRegions.toLocaleString()}</strong>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <p className={styles.sectionEyebrow}>Spotlight</p>
            <div className={styles.spotlightCard}>
              <span className={styles.spotlightLabel}>Busiest region</span>
              <strong>{overview.spotlight.busiestState?.name || 'No region yet'}</strong>
              <p>
                {overview.spotlight.busiestState
                  ? `${overview.spotlight.busiestState.listingCount.toLocaleString()} live listing(s) currently mapped there.`
                  : 'Regional activity appears once listings are assigned to locations.'}
              </p>
            </div>

            <div className={`${styles.spotlightCard} ${styles.spotlightCardWarning}`}>
              <span className={styles.spotlightLabel}>Most reported listing</span>
              <strong>{overview.spotlight.mostReportedListing?.title || 'No reports yet'}</strong>
              <p>
                {overview.spotlight.mostReportedListing
                  ? `${overview.spotlight.mostReportedListing.reportCount.toLocaleString()} report(s) linked to the same item.`
                  : 'No listing has accumulated repeated reports yet.'}
              </p>
            </div>
          </article>

          <article className={`${styles.panel} ${styles.quickActionsPanel}`}>
            <p className={styles.sectionEyebrow}>Quick Actions</p>
            <div className={styles.quickActions}>
              <Link href={ROUTES.ADMIN_LISTINGS} className={styles.quickAction}>
                <ListingIcon />
                <span>Listing review</span>
              </Link>
              <Link href={ROUTES.ADMIN_REPORTS} className={styles.quickAction}>
                <AlertIcon />
                <span>Report queue</span>
              </Link>
              <Link href={ROUTES.ADMIN_USERS} className={styles.quickAction}>
                <UsersIcon />
                <span>User review</span>
              </Link>
              <Link href={ROUTES.ADMIN_MESSAGES} className={styles.quickAction}>
                <MessageIcon />
                <span>Moderation inbox</span>
              </Link>
              <Link href={ROUTES.ADMIN_STRUCTURE} className={styles.quickAction}>
                <StructureIcon />
                <span>Structure control</span>
              </Link>
            </div>
          </article>
        </aside>
      </section>

      <section className={styles.activityCard}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Live Timeline</p>
            <h2>Recent platform activity</h2>
          </div>
          <Link href={ROUTES.ADMIN_LISTINGS} className={styles.inlineLink}>
            Open listing management
          </Link>
        </div>

        {overview.recentActivity.length === 0 ? (
          <div className={styles.emptyInline}>No recent activity is available yet.</div>
        ) : (
          <div className={styles.activityList}>
            {overview.recentActivity.map((item) => (
              <article key={item.id} className={styles.activityRow}>
                <div className={styles.activityPrimary}>
                  <strong>{item.actorLabel}</strong>
                  <span>{item.actionLabel}</span>
                </div>
                <div className={styles.activityTarget}>{item.targetLabel}</div>
                <div
                  className={`${styles.statusPill} ${
                    item.statusTone === 'attention'
                      ? styles.statusAttention
                      : item.statusTone === 'success'
                        ? styles.statusSuccess
                        : styles.statusNeutral
                  }`}
                >
                  {item.statusLabel}
                </div>
                <time className={styles.activityTime}>{formatRelativeTime(item.timestamp)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
