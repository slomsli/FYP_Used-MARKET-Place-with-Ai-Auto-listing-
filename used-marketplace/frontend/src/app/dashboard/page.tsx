'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

/* ══════════════════════════════════════════
   Inline SVG Icons
   ══════════════════════════════════════════ */

const ListIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5" /><path d="m21 3-7 7" />
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
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" /><path d="M5 12h14" />
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
    <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
  </svg>
);

const ShieldCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4zm-1 14.59l-3.3-3.3 1.41-1.41L11 13.77l4.89-4.89 1.41 1.41L11 16.59z" />
  </svg>
);

/* ══════════════════════════════════════════
   Mock Data
   ══════════════════════════════════════════ */

const weeklyData = [
  { week: 'WEEK 1', views: 2200, offers: 800 },
  { week: 'WEEK 2', views: 3400, offers: 1200 },
  { week: 'WEEK 3', views: 1800, offers: 600 },
  { week: 'WEEK 4', views: 2600, offers: 900 },
];

const recentActivity = [
  {
    id: '1',
    name: 'Vintage Leather Tote',
    badge: 'SINGLE OWNER',
    badgeColor: '#dc2626',
    timeAgo: 'Listed 2 days ago',
    views: 14,
    priceLabel: 'Highest Offer',
    price: '$1,200.00',
    emoji: '👜',
  },
  {
    id: '2',
    name: 'Smartphone X-Pro',
    badge: 'REFURBISHED',
    badgeColor: '#059669',
    timeAgo: 'Listed 5 days ago',
    views: 69,
    priceLabel: 'Asking Price',
    price: '$850.00',
    emoji: '📱',
  },
];

/* ══════════════════════════════════════════
   Dashboard Page Component
   ══════════════════════════════════════════ */

export default function DashboardPage() {
  const { user } = useRequireAuth();
  const [chartMode, setChartMode] = useState<'views' | 'offers'>('views');

  if (!user) return null;

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const maxVal = Math.max(...weeklyData.map(d => chartMode === 'views' ? d.views : d.offers));

  return (
    <div className={styles.dashboard}>
      {/* ─── Welcome Section ─── */}
      <section className={styles.welcome} id="welcome-section">
        <h1 className={styles.welcomeTitle}>Hello, {displayName}!</h1>
        <p className={styles.welcomeSub}>
          Manage your activity, track listings, and explore curated offers in your personal archive.
        </p>
        <div className={styles.badges}>
          <span className={styles.badgeGreen}>
            <ShieldCheck /> CURATED SELLER
          </span>
          <span className={styles.badgeGreen}>
            <ShieldCheck /> VERIFIED BUYER
          </span>
        </div>
      </section>

      {/* ─── Stats Cards Row ─── */}
      <section className={styles.statsRow} id="stats-section">
        {/* My Listings */}
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statNumber}>12</span>
            <span className={`${styles.statIconBg} ${styles.statIconBlue}`}><ListIcon /></span>
          </div>
          <div className={styles.statTitle}>My Listings</div>
          <div className={styles.statDesc}>Active items in marketplace</div>
          <Link href={ROUTES.ADD_LISTING} className={styles.statAction}>
            List an item <ArrowIcon />
          </Link>
        </div>

        {/* Messages */}
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statNumber}>
              3
              <span className={styles.notifDot} />
            </span>
            <span className={`${styles.statIconBg} ${styles.statIconGray}`}><MsgIcon /></span>
          </div>
          <div className={styles.statTitle}>Messages</div>
          <div className={styles.statDesc}>New unread inquiries</div>
          <Link href={ROUTES.MESSAGES} className={styles.statAction}>
            Open Inbox <ArrowIcon />
          </Link>
        </div>

        {/* Favorites */}
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statNumber}>8</span>
            <span className={`${styles.statIconBg} ${styles.statIconPink}`}><HeartIcon /></span>
          </div>
          <div className={styles.statTitle}>Favorites</div>
          <div className={styles.statDesc}>Saved for later</div>
          <Link href={ROUTES.FAVORITES} className={styles.statAction}>
            View Saved <ArrowIcon />
          </Link>
        </div>

        {/* Active Offers - highlight card */}
        <div className={`${styles.statCard} ${styles.statCardDark}`}>
          <div className={styles.darkCardHeader}>
            <h3 className={styles.darkCardTitle}>Active<br />Offers</h3>
          </div>
          <p className={styles.darkCardDesc}>
            You have 5 high-intent offers pending review.
          </p>
          <div className={styles.darkCardProduct}>
            <div className={styles.darkProductImg}>👟</div>
            <div>
              <div className={styles.darkProductName}>Air Max Legacy</div>
              <div className={styles.darkProductPrice}>$210.00</div>
            </div>
          </div>
          <Link href={ROUTES.BROWSE} className={styles.darkCardBtn}>
            View Marketplace
          </Link>
        </div>
      </section>

      {/* ─── Middle Row: Chart + Concierge ─── */}
      <section className={styles.middleRow} id="insights-section">
        {/* Inventory Insights Chart */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h2 className={styles.chartTitle}>Inventory Insights</h2>
              <p className={styles.chartSub}>Listing visibility and demand trends (Last 30 Days)</p>
            </div>
            <div className={styles.chartTabs}>
              <button
                className={`${styles.chartTab} ${chartMode === 'views' ? styles.chartTabActive : ''}`}
                onClick={() => setChartMode('views')}
              >
                Views
              </button>
              <button
                className={`${styles.chartTab} ${chartMode === 'offers' ? styles.chartTabActive : ''}`}
                onClick={() => setChartMode('offers')}
              >
                Offers
              </button>
            </div>
          </div>

          <div className={styles.chart}>
            <div className={styles.chartYLabel}>{(maxVal / 1000).toFixed(1)}k</div>
            <div className={styles.chartBars}>
              {weeklyData.map((d, i) => {
                const val = chartMode === 'views' ? d.views : d.offers;
                const pct = (val / maxVal) * 100;
                return (
                  <div key={i} className={styles.chartBarGroup}>
                    <div className={styles.chartBarWrapper}>
                      <div
                        className={styles.chartBar}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className={styles.chartBarLabel}>{d.week}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Concierge + Recommended */}
        <div className={styles.rightCol}>
          {/* Concierge Card */}
          <div className={styles.conciergeCard}>
            <div className={styles.conciergeIcon}>
              <SupportIcon />
            </div>
            <h3 className={styles.conciergeTitle}>Concierge Assistance</h3>
            <p className={styles.conciergeDesc}>
              As a Premium Member, you have access to our direct concierge line for luxury authentications and shipment logistics.
            </p>
            <button className={styles.conciergeBtn}>Contact Support</button>
          </div>

          {/* Recommended card */}
          <div className={styles.recommendedCard}>
            <div className={styles.recommendedLabel}>RECOMMENDED FOR YOU</div>
            <div className={styles.recommendedProduct}>
              <div className={styles.recommendedImg}>⌚</div>
              <div>
                <div className={styles.recommendedName}>Minimalist Chrono</div>
                <div className={styles.recommendedPrice}>$450.00</div>
                <span className={styles.recommendedBadge}>New Arrival</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Recent Listing Activity ─── */}
      <section className={styles.activitySection} id="activity-section">
        <div className={styles.activityHeader}>
          <h2 className={styles.activityTitle}>Recent Listing Activity</h2>
          <Link href={ROUTES.MY_LISTINGS} className={styles.activityViewAll}>View All Activity</Link>
        </div>

        <div className={styles.activityList}>
          {recentActivity.map((item) => (
            <div key={item.id} className={styles.activityItem}>
              <div className={styles.activityLeft}>
                <div className={styles.activityEmoji}>{item.emoji}</div>
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
                    {item.timeAgo} • {item.views} views
                  </div>
                </div>
              </div>
              <div className={styles.activityRight}>
                <div className={styles.activityPriceLabel}>{item.priceLabel}</div>
                <div className={styles.activityPrice}>{item.price}</div>
              </div>
              <button className={styles.activityMore} aria-label="More actions">
                <MoreIcon />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Floating Action Button ─── */}
      <Link href={ROUTES.ADD_LISTING} className={styles.fab} id="post-new-item-fab">
        <PlusIcon />
        Post New Item
      </Link>
    </div>
  );
}
