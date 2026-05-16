'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
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

function TicketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
      <path d="M9 9h6" />
      <path d="M9 15h4" />
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

function GuideIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
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

function ArrowUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const diffMinutes = Math.max(Math.floor((Date.now() - timestamp) / 60000), 0);
  if (diffMinutes < 60) return `${diffMinutes || 1} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function AdminPage() {
  const { token } = useRequireAuth();
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [selectedFocusKey, setSelectedFocusKey] = useState('verification');

  const loadOverview = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    const response = await getAdminOverview(token, selectedYear);

    if (response.data) {
      setOverview(response.data);
      setError(null);
      setLastRefreshedAt(new Intl.DateTimeFormat('en-MY', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date()));
    } else {
      setError(response.error || 'Failed to load the admin overview.');
    }

    setLoading(false);
  }, [selectedYear, token]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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

  const totalSoldThisPeriod = overview.activity.months.reduce((sum, m) => sum + m.soldItems, 0);
  const identityVerificationRate =
    overview.health.identityVerificationRate ?? overview.health.verificationRate;
  const pendingIdentityVerifications =
    overview.health.pendingIdentityVerifications ?? overview.health.pendingVerificationUsers;
  const verifiedIdentityUsers =
    overview.health.verifiedIdentityUsers ?? Math.round((overview.stats.totalUsers * identityVerificationRate) / 100);

  const statCards = [
    {
      label: 'Total Users',
      value: overview.stats.totalUsers,
      detail: `${identityVerificationRate}% ReMarket Verified`,
      icon: <UsersIcon />,
      tone: styles.statCardInk,
      trend:
        pendingIdentityVerifications > 0
          ? `${pendingIdentityVerifications} pending review`
          : `${verifiedIdentityUsers} verified`,
      trendUp: pendingIdentityVerifications === 0,
    },
    {
      label: 'Active Listings',
      value: overview.stats.activeListings,
      detail: `Across ${overview.health.activeRegions} regions`,
      icon: <ListingIcon />,
      tone: styles.statCardMint,
      trend: `${overview.health.activeRegions} active regions`,
      trendUp: overview.stats.activeListings > 0,
    },
    {
      label: 'Pending Reports',
      value: overview.stats.pendingReports,
      detail: `${overview.health.moderationThreads} threads open`,
      icon: <AlertIcon />,
      tone: styles.statCardPeach,
      trend: overview.stats.pendingReports === 0 ? 'All clear' : `${overview.health.moderationThreads} in review`,
      trendUp: overview.stats.pendingReports === 0,
    },
    {
      label: 'Items Sold',
      value: overview.stats.soldItems,
      detail: `${totalSoldThisPeriod} sold this period`,
      icon: <SoldIcon />,
      tone: styles.statCardSoft,
      trend: `${totalSoldThisPeriod} recent`,
      trendUp: totalSoldThisPeriod > 0,
    },
    {
      label: 'Open Offers',
      value: overview.stats.pendingOffers,
      detail: 'Active buyer-seller negotiations',
      icon: <OfferIcon />,
      tone: styles.statCardNavy,
      trend: overview.stats.pendingOffers === 0 ? 'None pending' : `${overview.stats.pendingOffers} active`,
      trendUp: overview.stats.pendingOffers === 0,
    },
  ];
  const focusItems = [
    {
      key: 'verification',
      label: 'Identity verification',
      value: pendingIdentityVerifications.toLocaleString(),
      description: `${identityVerificationRate}% of users are ReMarket Verified. ${pendingIdentityVerifications.toLocaleString()} request(s) are waiting for admin review.`,
      actionLabel: 'Open verification',
      actionHref: ROUTES.ADMIN_VERIFICATION,
      hasProgress: true,
      progress: identityVerificationRate,
    },
    {
      key: 'suspended',
      label: 'Suspended accounts',
      value: overview.health.suspendedUsers.toLocaleString(),
      description: `${overview.health.suspendedUsers.toLocaleString()} account(s) are currently restricted from normal marketplace activity. Use this to check whether users need reactivation or further review.`,
      actionLabel: 'Open users',
      actionHref: ROUTES.ADMIN_USERS,
    },
    {
      key: 'moderation',
      label: 'Moderation threads',
      value: overview.health.moderationThreads.toLocaleString(),
      description: `${overview.health.moderationThreads.toLocaleString()} admin conversation thread(s) are open for listing moderation or user follow-up.`,
      actionLabel: 'Open inbox',
      actionHref: ROUTES.ADMIN_MESSAGES,
    },
    {
      key: 'regions',
      label: 'Active regions',
      value: overview.health.activeRegions.toLocaleString(),
      description: `${overview.health.activeRegions.toLocaleString()} region(s) currently have marketplace activity from active listings. This helps you see how widely the marketplace is being used.`,
      actionLabel: 'Manage structure',
      actionHref: ROUTES.ADMIN_STRUCTURE,
    },
  ];
  const selectedFocus = focusItems.find((item) => item.key === selectedFocusKey) ?? focusItems[0];

  return (
    <div className={styles.page}>
      {/* ── Greeting Banner ── */}
      <section className={styles.greetingBanner}>
        <div className={styles.greetingLeft}>
          <p className={styles.greetingEyebrow}>Platform Control</p>
          <h1 className={styles.greetingTitle}>{getTimeGreeting()}, Admin</h1>
          <p className={styles.greetingSubtitle}>
            Here&apos;s what&apos;s happening across the marketplace today. Review activity, moderate content, and manage operations all from one place.
          </p>
        </div>

        <div className={styles.greetingActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void loadOverview()}
            disabled={loading}
          >
            <RefreshIcon />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <Link href={ROUTES.ADMIN_LISTINGS} className={styles.btnPrimary}>
            <ListingIcon />
            <span>Listings</span>
          </Link>
          <Link href={ROUTES.ADMIN_REPORTS} className={styles.btnGhost}>
            <AlertIcon />
            <span>Reports</span>
          </Link>
          <Link href={ROUTES.ADMIN_SUPPORT} className={styles.btnGhost}>
            <TicketIcon />
            <span>Support</span>
          </Link>
          <span className={styles.refreshStatus}>
            {error ? error : lastRefreshedAt ? `Updated ${lastRefreshedAt}` : 'Live overview'}
          </span>
        </div>
      </section>

      {/* ── Stat Cards ── */}
      <section className={styles.statsGrid}>
        {statCards.map((card) => (
          <article key={card.label} className={`${styles.statCard} ${card.tone}`}>
            <div className={styles.statTop}>
              <div className={styles.statIcon}>{card.icon}</div>
              <span className={`${styles.statTrend} ${card.trendUp ? styles.trendUp : styles.trendNeutral}`}>
                {card.trendUp && <ArrowUpIcon />}
                {card.trend}
              </span>
            </div>
            <h2 className={styles.statValue}>{card.value.toLocaleString()}</h2>
            <p className={styles.statLabel}>{card.label}</p>
            <p className={styles.statDetail}>{card.detail}</p>
          </article>
        ))}
      </section>

      {/* ── Content Grid ── */}
      <section className={styles.contentGrid}>
        <article className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Activity Breakdown</p>
              <h2 className={styles.sectionTitle}>Monthly Overview</h2>
            </div>
            <div className={styles.chartLegend}>
              <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendUsers}`} />Users</span>
              <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendListings}`} />Listings</span>
              <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendSold}`} />Sold</span>
              <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendReports}`} />Reports</span>
            </div>
          </div>

          {/* ── Year + Month Selector ── */}
          <div className={styles.filterBar}>
            <div className={styles.yearSelector}>
              <label className={styles.yearLabel} htmlFor="overview-year">Year</label>
              <select
                id="overview-year"
                className={styles.yearDropdown}
                value={selectedYear ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedYear(val ? Number(val) : undefined);
                  setSelectedMonthIndex(null);
                }}
              >
                <option value="">Recent 6 Months</option>
                {(overview.activity.availableYears ?? []).map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            <div className={styles.monthTabs}>
              <button
                type="button"
                className={`${styles.monthTab} ${selectedMonthIndex === null ? styles.monthTabActive : ''}`}
                onClick={() => setSelectedMonthIndex(null)}
              >
                View All
              </button>
              {overview.activity.months.map((month, index) => (
                <button
                  key={month.value}
                  type="button"
                  className={`${styles.monthTab} ${selectedMonthIndex === index ? styles.monthTabActive : ''}`}
                  onClick={() => setSelectedMonthIndex(index)}
                >
                  {month.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Chart content ── */}
          {selectedMonthIndex === null ? (
            <>
              {/* View All — vertical grouped bar chart */}
              {(() => {
                const chartMax = Math.max(
                  ...overview.activity.months.flatMap((m) => [m.users, m.listings, m.soldItems, m.reports]),
                  1,
                );
                const yLabels = [chartMax, Math.round(chartMax * 0.75), Math.round(chartMax * 0.5), Math.round(chartMax * 0.25), 0];

                return (
                  <div className={styles.chartWrapper}>
                    <div className={styles.chartArea}>
                      <div className={styles.chartYAxis}>
                        {yLabels.map((v, i) => (
                          <span key={i} className={styles.chartYLabel}>{v}</span>
                        ))}
                      </div>
                      <div className={styles.chartGrid}>
                        {overview.activity.months.map((month) => (
                          <div key={month.value} className={styles.chartColumn}>
                            <div className={styles.chartBars}>
                              <span
                                className={`${styles.chartBar} ${styles.barUsers}`}
                                style={{ height: `${Math.max((month.users / chartMax) * 100, month.users ? 5 : 2)}%` }}
                              >
                                <span className={styles.barValue}>Users: {month.users}</span>
                              </span>
                              <span
                                className={`${styles.chartBar} ${styles.barListings}`}
                                style={{ height: `${Math.max((month.listings / chartMax) * 100, month.listings ? 5 : 2)}%` }}
                              >
                                <span className={styles.barValue}>Listings: {month.listings}</span>
                              </span>
                              <span
                                className={`${styles.chartBar} ${styles.barSold}`}
                                style={{ height: `${Math.max((month.soldItems / chartMax) * 100, month.soldItems ? 5 : 2)}%` }}
                              >
                                <span className={styles.barValue}>Sold: {month.soldItems}</span>
                              </span>
                              <span
                                className={`${styles.chartBar} ${styles.barReports}`}
                                style={{ height: `${Math.max((month.reports / chartMax) * 100, month.reports ? 5 : 2)}%` }}
                              >
                                <span className={styles.barValue}>Reports: {month.reports}</span>
                              </span>
                            </div>
                            <span className={styles.chartLabel}>{month.label.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className={styles.chartFooter}>
                <div className={styles.chartFooterItem}>
                  <span className={styles.chartFooterLabel}>Pending identity reviews</span>
                  <strong className={styles.chartFooterValue}>{pendingIdentityVerifications.toLocaleString()}</strong>
                </div>
                <div className={styles.chartFooterItem}>
                  <span className={styles.chartFooterLabel}>Suspended users</span>
                  <strong className={styles.chartFooterValue}>{overview.health.suspendedUsers.toLocaleString()}</strong>
                </div>
                <div className={styles.chartFooterItem}>
                  <span className={styles.chartFooterLabel}>Sold this period</span>
                  <strong className={styles.chartFooterValue}>{totalSoldThisPeriod.toLocaleString()}</strong>
                </div>
              </div>
            </>
          ) : (
            (() => {
              const month = overview.activity.months[selectedMonthIndex];
              const prevMonth = selectedMonthIndex > 0 ? overview.activity.months[selectedMonthIndex - 1] : null;
              const metricMax = Math.max(month.users, month.listings, month.soldItems, month.reports, 1);

              function getChange(current: number, previous: number | undefined) {
                if (previous === undefined || previous === 0) return current > 0 ? '+100%' : '—';
                const pct = Math.round(((current - previous) / previous) * 100);
                if (pct > 0) return `+${pct}%`;
                if (pct < 0) return `${pct}%`;
                return '0%';
              }

              const metrics = [
                { label: 'New Users',     value: month.users,     prev: prevMonth?.users,     barClass: styles.barUsers },
                { label: 'New Listings',  value: month.listings,  prev: prevMonth?.listings,  barClass: styles.barListings },
                { label: 'Items Sold',    value: month.soldItems,  prev: prevMonth?.soldItems,  barClass: styles.barSold },
                { label: 'Reports Filed', value: month.reports,   prev: prevMonth?.reports,   barClass: styles.barReports },
              ];

              const yLabels = [metricMax, Math.round(metricMax * 0.75), Math.round(metricMax * 0.5), Math.round(metricMax * 0.25), 0];

              return (
                <div className={styles.monthDetail}>
                  <div className={styles.monthDetailHeader}>
                    <h3 className={styles.monthDetailTitle}>{month.label}</h3>
                    {prevMonth && <span className={styles.monthDetailCompare}>vs. {prevMonth.label}</span>}
                  </div>

                  <div className={styles.chartWrapper}>
                    <div className={styles.chartArea}>
                      <div className={styles.chartYAxis}>
                        {yLabels.map((v, i) => (
                          <span key={i} className={styles.chartYLabel}>{v}</span>
                        ))}
                      </div>
                      <div className={`${styles.chartGrid} ${styles.chartGridSingle}`}>
                        {metrics.map((m) => {
                          const changeLabel = getChange(m.value, m.prev);
                          const changeClass =
                            m.value > (m.prev ?? 0) ? styles.changeUp :
                            m.value < (m.prev ?? 0) ? styles.changeDown :
                            styles.changeFlat;

                          return (
                            <div key={m.label} className={`${styles.chartColumn} ${styles.chartColumnSingle}`}>
                              <div className={styles.chartBars}>
                                <span
                                  className={`${styles.chartBar} ${m.barClass} ${styles.chartBarWide}`}
                                  style={{ height: `${Math.max((m.value / metricMax) * 100, m.value ? 5 : 2)}%` }}
                                >
                                  {prevMonth && (
                                    <span className={`${styles.monthMetricChange} ${changeClass} ${styles.barChangeBadge}`}>
                                      {changeLabel}
                                    </span>
                                  )}
                                  <span className={styles.barValue}>
                                    {m.label}: {m.value}{prevMonth && m.prev !== undefined ? ` (prev: ${m.prev})` : ''}
                                  </span>
                                </span>
                              </div>
                              <span className={styles.chartLabel}>{m.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className={styles.monthTotalRow}>
                    <span>Total activity for {month.label}</span>
                    <strong>
                      {(month.users + month.listings + month.soldItems + month.reports).toLocaleString()} events
                    </strong>
                  </div>
                </div>
              );
            })()
          )}

          <div className={styles.compactActivity}>
            <div className={styles.compactActivityHeader}>
              <div>
                <p className={styles.compactActivityKicker}>Live Timeline</p>
                <h3 className={styles.compactActivityTitle}>Recent activity</h3>
              </div>
              <Link href={ROUTES.ADMIN_LISTINGS} className={styles.compactActivityLink}>
                Open listings
              </Link>
            </div>

            {overview.recentActivity.length === 0 ? (
              <div className={styles.compactActivityEmpty}>No recent activity is available yet.</div>
            ) : (
              <div className={styles.compactActivityList}>
                {overview.recentActivity.slice(0, 4).map((item) => (
                  <article key={item.id} className={styles.compactActivityRow}>
                    <div className={styles.compactActivityPrimary}>
                      <strong>{item.actorLabel}</strong>
                      <span>{item.actionLabel}</span>
                    </div>
                    <div className={styles.compactActivityTarget}>{item.targetLabel}</div>
                    <div
                      className={`${styles.statusPill} ${styles.compactStatus} ${
                        item.statusTone === 'attention' ? styles.statusAttention :
                        item.statusTone === 'success' ? styles.statusSuccess :
                        styles.statusNeutral
                      }`}
                    >
                      {item.statusLabel}
                    </div>
                    <time className={styles.compactActivityTime}>{formatRelativeTime(item.timestamp)}</time>
                  </article>
                ))}
              </div>
            )}
          </div>
        </article>

        <aside className={styles.sideColumn}>
          {/* Operational Focus */}
          <article className={styles.card}>
            <p className={styles.sectionEyebrow}>Operational Focus</p>
            <div className={styles.metricList}>
              {focusItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.metricButton} ${selectedFocus.key === item.key ? styles.metricButtonActive : ''}`}
                  onClick={() => setSelectedFocusKey(item.key)}
                  aria-pressed={selectedFocus.key === item.key}
                >
                  <span className={styles.metricButtonTop}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </span>
                  {item.hasProgress && (
                    <span className={styles.progressTrack}>
                      <span className={styles.progressFill} style={{ width: `${item.progress}%` }} />
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className={styles.focusDetail}>
              <span className={styles.focusDetailLabel}>What it means</span>
              <strong>{selectedFocus.label}</strong>
              <p>{selectedFocus.description}</p>
              <Link href={selectedFocus.actionHref} className={styles.focusDetailLink}>
                {selectedFocus.actionLabel}
              </Link>
            </div>
          </article>

          {/* Spotlight */}
          <article className={styles.card}>
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

          {/* Quick Actions */}
          <article className={`${styles.card} ${styles.quickActionsPanel}`}>
            <p className={styles.sectionEyebrow}>Quick Actions</p>
            <div className={styles.quickActions}>
              <Link href={ROUTES.ADMIN_LISTINGS} className={styles.quickAction}><ListingIcon /><span>Listings</span></Link>
              <Link href={ROUTES.ADMIN_VERIFICATION} className={styles.quickAction}><ShieldIcon /><span>Verification</span></Link>
              <Link href={ROUTES.ADMIN_REPORTS} className={styles.quickAction}><AlertIcon /><span>Reports</span></Link>
              <Link href={ROUTES.ADMIN_USERS} className={styles.quickAction}><UsersIcon /><span>Users</span></Link>
              <Link href={ROUTES.ADMIN_MESSAGES} className={styles.quickAction}><MessageIcon /><span>Inbox</span></Link>
              <Link href={ROUTES.ADMIN_SUPPORT} className={styles.quickAction}><TicketIcon /><span>Support</span></Link>
              <Link href={ROUTES.ADMIN_STRUCTURE} className={styles.quickAction}><StructureIcon /><span>Structure</span></Link>
              <Link href={ROUTES.ADMIN_GUIDE} className={styles.quickAction}><GuideIcon /><span>Guide</span></Link>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
