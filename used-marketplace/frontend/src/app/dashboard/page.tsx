'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { subscribeToDashboardProfileUpdates } from '@/src/lib/profileSync';
import { getProfile } from '@/src/services/profileService';
import {
  getDashboardSummary,
  type DashboardSummary,
} from '@/src/services/dashboardService';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

const DASHBOARD_TIME_ZONE = 'Asia/Kuala_Lumpur';
const ALL_LISTINGS_VALUE = 'all-listings';

const ListIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5" />
    <path d="m21 3-7 7" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </svg>
);

const MsgIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const HeartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const SupportIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 18.72a9.1 9.1 0 0 0 3.35-5.22A9 9 0 1 0 5.78 19.5" />
    <path d="M22 22s-2-1-4-1.5" />
    <path d="M12 12h.01" />
    <path d="M8 12h.01" />
    <path d="M16 12h.01" />
  </svg>
);

const MoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

const ShieldCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4zm-1 14.59l-3.3-3.3 1.41-1.41L11 13.77l4.89-4.89 1.41 1.41L11 16.59z" />
  </svg>
);

function getCurrentMonthValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';

  return `${year}-${month}`;
}

function canRenderImage(path: string | null | undefined) {
  return Boolean(path && (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')));
}

function getFallbackLabel(value: string | null | undefined) {
  return value?.trim().charAt(0).toUpperCase() || 'R';
}

function formatListingStatus(status: string) {
  if (status === 'sold') return 'Sold';
  if (status === 'draft') return 'Draft';
  if (status === 'reserved') return 'Reserved';
  return 'Active';
}

function getListingStatusTone(status: string) {
  if (status === 'sold') return 'sold';
  if (status === 'draft') return 'draft';
  if (status === 'reserved') return 'reserved';
  return 'active';
}

function getListingStatusRank(status: string) {
  if (status === 'active') return 0;
  if (status === 'reserved') return 1;
  if (status === 'sold') return 2;
  if (status === 'draft') return 3;
  return 4;
}

export default function DashboardPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [chartMode, setChartMode] = useState<'views' | 'offers'>('views');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [selectedListingId, setSelectedListingId] = useState(ALL_LISTINGS_VALUE);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);

      try {
        if (!token) {
          if (!cancelled) {
            setErrorMsg('No auth session');
            setLoading(false);
          }
          return;
        }

        const response = await getDashboardSummary(token, {
          month: selectedMonth,
          listingId:
            selectedListingId === ALL_LISTINGS_VALUE ? undefined : selectedListingId,
        });
        if (cancelled) {
          return;
        }

        if (response.data) {
          setSummary(response.data);
          setSelectedListingId(
            response.data.insights.selectedListingId ?? ALL_LISTINGS_VALUE
          );
          setErrorMsg(null);
        } else {
          setErrorMsg(response.error || 'Failed to fetch data');
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMsg(error instanceof Error ? error.message : 'Unknown error from loadData');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedListingId, selectedMonth, token, user]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getProfile(token).then((response) => {
      if (!cancelled && response.data) {
        setProfileName(response.data.fullName);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(
    () =>
      subscribeToDashboardProfileUpdates(({ fullName }) => {
        if (fullName !== undefined) {
          setProfileName(fullName);
        }
      }),
    []
  );

  if (authLoading || !user || (loading && !summary)) {
    return (
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
        Loading dashboard...
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        style={{
          padding: '2rem',
          display: 'flex',
          justifyContent: 'center',
          color: 'red',
        }}
      >
        Failed to load dashboard data: {errorMsg}
      </div>
    );
  }

  const displayName =
    profileName?.trim() || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const availableListings = [...summary.insights.availableListings].sort((left, right) => {
    const statusDiff = getListingStatusRank(left.status) - getListingStatusRank(right.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    return left.title.localeCompare(right.title);
  });
  const selectedInsightListing =
    availableListings.find((listing) => listing.id === summary.insights.selectedListingId) ?? null;
  const weeklyData = summary.insights.weeklyData;
  const chartValues = weeklyData.map((bucket) =>
    chartMode === 'views' ? bucket.views : bucket.offers
  );
  const maxVal = Math.max(...chartValues, 1);
  const isRefreshing = loading && Boolean(summary);
  const chartContextLabel = summary.insights.selectedListingId
    ? summary.insights.selectedListingLabel
    : 'All Listings';

  return (
    <div className={styles.dashboard}>
      <section className={styles.welcome} id="welcome-section">
        <h1 className={styles.welcomeTitle}>Hello, {displayName}!</h1>
        <p className={styles.welcomeSub}>
          Manage your activity, track listings, and explore curated offers in your personal archive.
        </p>
        <div className={styles.badges}>
          <span className={styles.badgeGreen}>
            <ShieldCheck /> Curated Seller
          </span>
          <span className={styles.badgeGreen}>
            <ShieldCheck /> Verified Buyer
          </span>
        </div>
      </section>

      <section className={styles.statsRow} id="stats-section">
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statNumber}>{summary.stats.activeListings}</span>
            <span className={`${styles.statIconBg} ${styles.statIconBlue}`}>
              <ListIcon />
            </span>
          </div>
          <div className={styles.statTitle}>My Listings</div>
          <div className={styles.statDesc}>Active items in marketplace</div>
          <Link href={ROUTES.ADD_LISTING} className={styles.statAction}>
            List an item <ArrowIcon />
          </Link>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statNumber}>
              {summary.stats.unreadMessages}
              {summary.stats.unreadMessages > 0 && <span className={styles.notifDot} />}
            </span>
            <span className={`${styles.statIconBg} ${styles.statIconGray}`}>
              <MsgIcon />
            </span>
          </div>
          <div className={styles.statTitle}>Messages</div>
          <div className={styles.statDesc}>New unread inquiries</div>
          <Link href={ROUTES.MESSAGES} className={styles.statAction}>
            Open Inbox <ArrowIcon />
          </Link>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statNumber}>{summary.stats.favorites}</span>
            <span className={`${styles.statIconBg} ${styles.statIconPink}`}>
              <HeartIcon />
            </span>
          </div>
          <div className={styles.statTitle}>Favorites</div>
          <div className={styles.statDesc}>Saved for later</div>
          <Link href={ROUTES.FAVORITES} className={styles.statAction}>
            View Saved <ArrowIcon />
          </Link>
        </div>

        <div className={`${styles.statCard} ${styles.statCardDark}`}>
          <div className={styles.darkCardHeader}>
            <h3 className={styles.darkCardTitle}>
              Active
              <br />
              Offers
            </h3>
          </div>
          <p className={styles.darkCardDesc}>
            {summary.stats.pendingOffers > 0
              ? `You have ${summary.stats.pendingOffers} high-intent offers pending review.`
              : 'No active offers yet.'}
          </p>
          <div className={styles.darkCardProduct}>
            <div className={styles.darkProductImg}>
              {canRenderImage(summary.highlightedOffer?.imagePath) ? (
                <img
                  src={summary.highlightedOffer?.imagePath || ''}
                  alt={summary.highlightedOffer?.productName || 'Offer'}
                />
              ) : (
                <span className={styles.productFallback}>
                  {getFallbackLabel(summary.highlightedOffer?.productName || 'Offer')}
                </span>
              )}
            </div>
            <div>
              <div className={styles.darkProductName}>
                {summary.highlightedOffer?.productName || 'No Item'}
              </div>
              <div className={styles.darkProductPrice}>
                {summary.highlightedOffer?.price || '-'}
              </div>
            </div>
          </div>
          <Link href={ROUTES.OFFERS} className={styles.darkCardBtn}>
            Review Offers
          </Link>
        </div>
      </section>

      <section className={styles.middleRow} id="insights-section">
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h2 className={styles.chartTitle}>Inventory Insights</h2>
              <p className={styles.chartSub}>
                Listing visibility and demand trends ({summary.insights.selectedMonthLabel})
              </p>
            </div>

            <div className={styles.chartControls}>
              <label className={styles.monthSelectWrap}>
                <span className={styles.monthSelectLabel}>Month</span>
                <select
                  className={styles.monthSelect}
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  disabled={isRefreshing}
                >
                  {summary.insights.availableMonths.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.chartTabs}>
                <button
                  className={`${styles.chartTab} ${chartMode === 'views' ? styles.chartTabActive : ''}`}
                  onClick={() => setChartMode('views')}
                  type="button"
                >
                  Views
                </button>
                <button
                  className={`${styles.chartTab} ${chartMode === 'offers' ? styles.chartTabActive : ''}`}
                  onClick={() => setChartMode('offers')}
                  type="button"
                >
                  Offers
                </button>
              </div>
            </div>
          </div>

          <div className={styles.chartSelectionHeader}>
            <span className={styles.chartSelectionLabel}>Product</span>
            <span className={styles.chartSelectionText}>
              {summary.insights.selectedListingId
                ? `Showing data for ${chartContextLabel}`
                : 'Showing data for all of your listings'}
            </span>
          </div>

          {availableListings.length > 0 ? (
            <div className={styles.insightListingPanel}>
              <label className={styles.productSelectWrap}>
                <span className={styles.monthSelectLabel}>Choose Product</span>
                <select
                  className={styles.productSelect}
                  value={selectedListingId}
                  onChange={(event) => setSelectedListingId(event.target.value)}
                  disabled={isRefreshing}
                >
                  <option value={ALL_LISTINGS_VALUE}>All Inventory</option>
                  {availableListings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {`${formatListingStatus(listing.status)} | ${listing.title}`}
                    </option>
                  ))}
                </select>
              </label>

              {selectedInsightListing ? (
                <div
                  className={`${styles.selectedInsightCard} ${
                    getListingStatusTone(selectedInsightListing.status) === 'sold'
                      ? styles.selectedInsightCardSold
                      : ''
                  }`}
                >
                  <div className={styles.selectedInsightThumb}>
                    {canRenderImage(selectedInsightListing.imagePath) ? (
                      <img
                        src={selectedInsightListing.imagePath || ''}
                        alt={selectedInsightListing.title}
                      />
                    ) : (
                      <span className={styles.productFallback}>
                        {getFallbackLabel(selectedInsightListing.title)}
                      </span>
                    )}
                  </div>

                  <div className={styles.selectedInsightBody}>
                    <div className={styles.selectedInsightTop}>
                      <h3 className={styles.selectedInsightTitle}>
                        {selectedInsightListing.title}
                      </h3>
                      <span
                        className={`${styles.selectedInsightBadge} ${
                          styles[`selectedInsightBadge${formatListingStatus(selectedInsightListing.status)}`]
                        }`}
                      >
                        {formatListingStatus(selectedInsightListing.status)}
                      </span>
                    </div>

                    <div className={styles.selectedInsightMeta}>
                      {selectedInsightListing.views.toLocaleString()} views |{' '}
                      {selectedInsightListing.offers.toLocaleString()} offers
                    </div>

                    <p className={styles.selectedInsightNote}>
                      {selectedInsightListing.status === 'sold'
                        ? 'This item is sold. The chart keeps its historical views and offers for reference.'
                        : selectedInsightListing.status === 'draft'
                          ? 'This draft listing can still show early activity before it goes live.'
                          : 'Track how this product is performing week by week.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={styles.selectedInsightCard}>
                  <div
                    className={`${styles.selectedInsightThumb} ${styles.insightListingThumbNeutral}`}
                  >
                    All
                  </div>

                  <div className={styles.selectedInsightBody}>
                    <div className={styles.selectedInsightTop}>
                      <h3 className={styles.selectedInsightTitle}>All Inventory</h3>
                      <span
                        className={`${styles.selectedInsightBadge} ${styles.selectedInsightBadgeActive}`}
                      >
                        Portfolio
                      </span>
                    </div>

                    <div className={styles.selectedInsightMeta}>
                      {availableListings.length} tracked product
                      {availableListings.length === 1 ? '' : 's'}
                    </div>

                    <p className={styles.selectedInsightNote}>
                      Combined views and offers across active, sold, and draft listings.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.chartSelectionEmpty}>
              Add a listing to unlock per-product insight tracking.
            </div>
          )}

          <div className={styles.chart}>
            <div className={styles.chartYAxis}>
              <span>{maxVal.toLocaleString()}</span>
              <span>0</span>
            </div>

            <div className={styles.chartBars}>
              {weeklyData.map((bucket) => {
                const value = chartMode === 'views' ? bucket.views : bucket.offers;
                const barHeight = value > 0 ? Math.max((value / maxVal) * 100, 10) : 4;
                const metricLabel = chartMode === 'views' ? 'views' : 'offers';

                return (
                  <div key={bucket.week} className={styles.chartBarGroup}>
                    <div className={styles.chartBarWrapper}>
                      <button
                        type="button"
                        className={styles.chartBarButton}
                        title={`${bucket.rangeLabel}: ${value} ${metricLabel}`}
                      >
                        <span className={styles.chartTooltip}>
                          <strong>{bucket.rangeLabel}</strong>
                          <span>
                            {value.toLocaleString()} {metricLabel}
                          </span>
                        </span>
                        <span
                          className={styles.chartBar}
                          style={{ height: `${barHeight}%` }}
                        />
                      </button>
                    </div>
                    <span className={styles.chartBarLabel}>{bucket.shortLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {isRefreshing && (
            <div className={styles.chartLoadingText}>Refreshing chart...</div>
          )}
        </div>

        <div className={styles.rightCol}>
          <div className={styles.conciergeCard}>
            <div className={styles.conciergeIcon}>
              <SupportIcon />
            </div>
            <h3 className={styles.conciergeTitle}>Concierge Assistance</h3>
            <p className={styles.conciergeDesc}>
              As a premium member, you have access to our direct concierge line for luxury authentications and shipment logistics.
            </p>
            <button className={styles.conciergeBtn} type="button">
              Contact Support
            </button>
          </div>

          <div className={styles.recommendedCard}>
            <div className={styles.recommendedLabel}>Recommended For You</div>
            <div className={styles.recommendedProduct}>
              <div className={styles.recommendedImg}>
                {canRenderImage(summary.recommended?.imagePath) ? (
                  <img
                    src={summary.recommended?.imagePath || ''}
                    alt={summary.recommended?.productName || 'Recommended item'}
                  />
                ) : (
                  <span className={styles.productFallback}>
                    {getFallbackLabel(summary.recommended?.productName || 'Browse latest')}
                  </span>
                )}
              </div>
              <div>
                <div className={styles.recommendedName}>
                  {summary.recommended?.productName || 'Browse latest'}
                </div>
                <div className={styles.recommendedPrice}>
                  {summary.recommended?.price || ''}
                </div>
                <span className={styles.recommendedBadge}>
                  {summary.recommended?.badge || 'Find Items'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.activitySection} id="activity-section">
        <div className={styles.activityHeader}>
          <h2 className={styles.activityTitle}>Recent Listing Activity</h2>
          <Link href={ROUTES.MY_LISTINGS} className={styles.activityViewAll}>
            View All Activity
          </Link>
        </div>

        <div className={styles.activityList}>
          {summary.recentActivity.length === 0 ? (
            <div className={styles.activityEmpty}>No listing activity yet.</div>
          ) : (
            summary.recentActivity.map((item) => (
              <div key={item.id} className={styles.activityItem}>
                <div className={styles.activityLeft}>
                  <div className={styles.activityEmoji}>
                    {canRenderImage(item.imagePath) ? (
                      <img src={item.imagePath || ''} alt={item.name} />
                    ) : (
                      <span className={styles.productFallback}>
                        {getFallbackLabel(item.name)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className={styles.activityName}>
                      {item.name}
                      <span
                        className={styles.activityBadge}
                        style={{ background: item.badgeColor }}
                      >
                        {item.badge}
                      </span>
                    </div>
                    <div className={styles.activityMeta}>
                      {item.timeAgo} | {item.views} views
                    </div>
                  </div>
                </div>
                <div className={styles.activityRight}>
                  <div className={styles.activityPriceLabel}>{item.priceLabel}</div>
                  <div className={styles.activityPrice}>{item.price}</div>
                </div>
                <button className={styles.activityMore} aria-label="More actions" type="button">
                  <MoreIcon />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <Link href={ROUTES.ADD_LISTING} className={styles.fab} id="post-new-item-fab">
        <PlusIcon />
        Post New Item
      </Link>
    </div>
  );
}
