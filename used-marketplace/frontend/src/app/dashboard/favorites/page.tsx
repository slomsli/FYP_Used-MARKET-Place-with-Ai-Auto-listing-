'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  getFavorites,
  toggleFavorite,
  type FavoriteItemSummary,
  type FavoritesPageResponse,
  type FavoritesSortOption,
} from '@/src/services/favoriteService';
import { ROUTES } from '@/src/config/routes';
import styles from './favorites.module.css';

/* ── SVG Icons ─────────────────────────────────────────── */

const HeartFilledIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const SortIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 16 4 4 4-4" />
    <path d="M7 20V4" />
    <path d="m21 8-4-4-4 4" />
    <path d="M17 4v16" />
  </svg>
);

const FilterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const BrowseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

/* ── Sort labels ───────────────────────────────────────── */

const SORT_LABELS: Record<FavoritesSortOption, string> = {
  recent: 'Recently Added',
  oldest: 'Oldest First',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  name_asc: 'A — Z',
};

/* ── Helpers ───────────────────────────────────────────── */

function formatCurrency(price: number, currency = 'MYR'): string {
  try {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `RM ${price.toLocaleString()}`;
  }
}

function canRenderImage(path: string | null | undefined): boolean {
  return Boolean(
    path && (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/'))
  );
}

function getConditionClass(condition: string): string {
  switch (condition) {
    case 'new': return styles.conditionNew;
    case 'like_new': return styles.conditionLikeNew;
    case 'good': return styles.conditionGood;
    case 'fair': return styles.conditionFair;
    case 'poor': return styles.conditionPoor;
    default: return styles.conditionGood;
  }
}

function getBadge(item: FavoriteItemSummary): { label: string; className: string } | null {
  if (item.status === 'sold') {
    return null; // handled as overlay
  }
  if (item.condition === 'new') {
    return { label: 'NEW', className: styles.badgeNew };
  }
  if (item.negotiable && item.price > 0) {
    return { label: 'NEGOTIABLE', className: styles.badgePriceDrop };
  }
  return null;
}

/* ── Item Card Component ───────────────────────────────── */

function FavoriteItemCard({
  item,
  onUnfavorite,
  isRemoving,
}: {
  item: FavoriteItemSummary;
  onUnfavorite: (listingId: string) => void;
  isRemoving: boolean;
}) {
  const isSold = item.status === 'sold';
  const badge = getBadge(item);

  return (
    <Link 
      href={`/product/${item.listingId}`} 
      className={styles.itemCard} 
      id={`favorite-item-${item.listingId}`}
    >
      <div className={styles.itemImageWrap}>
        {/* Badge */}
        {badge && (
          <span className={`${styles.badge} ${badge.className}`}>
            {badge.label}
          </span>
        )}

        {/* Sold overlay */}
        {isSold && (
          <div className={styles.soldOverlay}>
            <span className={styles.soldOverlayText}>Sold Out</span>
          </div>
        )}

        {/* Image */}
        {canRenderImage(item.coverImagePath) ? (
          <img
            src={item.coverImagePath!}
            alt={item.title}
            className={styles.itemImage}
            loading="lazy"
          />
        ) : (
          <div className={styles.itemImageFallback}>
            {item.title.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Heart button */}
        <button
          className={`${styles.heartBtn} ${isRemoving ? styles.removing : ''}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUnfavorite(item.listingId);
          }}
          aria-label={`Remove ${item.title} from favorites`}
          type="button"
        >
          <HeartFilledIcon />
        </button>
      </div>

      <div className={styles.itemContent}>
        <div className={styles.itemTitleRow}>
          <span className={styles.itemTitle}>{item.title}</span>
          <span className={styles.itemPrice}>
            {formatCurrency(item.price, item.currency)}
          </span>
        </div>

        {item.categoryName && (
          <span className={styles.itemCategory}>
            {item.categoryName}
            {item.brand ? ` • ${item.brand}` : ''}
          </span>
        )}

        <span className={styles.itemCondition}>
          <span className={`${styles.conditionDot} ${getConditionClass(item.condition)}`} />
          {item.conditionLabel}
        </span>
      </div>
    </Link>
  );
}

/* ── Main Page Component ───────────────────────────────── */

export default function FavoritesPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [data, setData] = useState<FavoritesPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sort, setSort] = useState<FavoritesSortOption>('recent');
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  /** Load favorites */
  const loadFavorites = useCallback(
    async (currentSort: FavoritesSortOption) => {
      if (!token) return;

      setLoading(true);
      setErrorMsg(null);

      try {
        const response = await getFavorites(token, currentSort);

        if (response.data) {
          setData(response.data);
        } else {
          setErrorMsg(response.error || 'Failed to load favorites');
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Unknown error'
        );
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!user || !token) return;
    loadFavorites(sort);
  }, [user, token, sort, loadFavorites]);

  /** Toast auto-dismiss */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Unfavorite handler */
  const handleUnfavorite = useCallback(
    async (listingId: string) => {
      if (!token || removingIds.has(listingId)) return;

      setRemovingIds((prev) => new Set(prev).add(listingId));

      try {
        const response = await toggleFavorite(token, listingId);

        if (response.data && !response.data.favorited) {
          // Optimistically remove from the list
          setData((prev) => {
            if (!prev) return prev;
            const filtered = prev.items.filter((item) => item.listingId !== listingId);
            return {
              ...prev,
              totalCount: filtered.length,
              items: filtered,
            };
          });
          setToast('Removed from favorites');
        } else if (response.error) {
          setToast('Failed to remove — try again');
        }
      } catch {
        setToast('Failed to remove — try again');
      } finally {
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
      }
    },
    [token, removingIds]
  );

  /* ── Render ────────────────────────────────────── */

  // Auth loading
  if (authLoading || !user) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.loadingText}>Loading...</span>
      </div>
    );
  }

  // Data loading (first load)
  if (loading && !data) {
    return (
      <div className={styles.favorites}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Favorites</h1>
            <p className={styles.subtitle}>Loading your saved items...</p>
          </div>
        </div>
        <div className={styles.loadingWrap}>
          <span className={styles.loadingText}>Loading favorites...</span>
        </div>
      </div>
    );
  }

  // Error
  if (errorMsg && !data) {
    return (
      <div className={styles.favorites}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Favorites</h1>
          </div>
        </div>
        <div className={styles.errorWrap}>
          <p className={styles.errorText}>{errorMsg}</p>
          <button
            className={styles.retryBtn}
            onClick={() => loadFavorites(sort)}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <div className={styles.favorites} id="favorites-page">
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Favorites</h1>
          <p className={styles.subtitle}>
            {totalCount > 0 ? (
              <>
                You have{' '}
                <span className={styles.subtitleBold}>
                  {totalCount} saved item{totalCount !== 1 ? 's' : ''}
                </span>{' '}
                in your collection.
              </>
            ) : (
              'Items you\u2019ve saved for later. Keep track of listings you love.'
            )}
          </p>
        </div>

        {totalCount > 0 && (
          <div className={styles.headerControls}>
            <select
              className={styles.sortDropdown}
              value={sort}
              onChange={(e) => setSort(e.target.value as FavoritesSortOption)}
              id="favorites-sort"
            >
              {(Object.keys(SORT_LABELS) as FavoritesSortOption[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>

            <button className={styles.filterBtn} type="button" id="favorites-filter-btn">
              <FilterIcon />
              Filters
            </button>
          </div>
        )}
      </div>

      {/* ── Empty State ── */}
      {totalCount === 0 && (
        <div className={styles.emptyState} id="favorites-empty">
          <div className={styles.emptyIcon}>❤️</div>
          <p className={styles.emptyTitle}>No favorites yet</p>
          <p className={styles.emptyDesc}>
            Browse the marketplace and tap the heart icon on listings you
            love to save them here for later.
          </p>
          <Link href={ROUTES.BROWSE || '/'} className={styles.emptyBtn}>
            <BrowseIcon />
            Browse Marketplace
          </Link>
        </div>
      )}

      {/* ── All Saved Items ── */}
      {totalCount > 0 && (
        <>
          <div className={styles.sectionLabel}>All Saved Items</div>
          <div className={styles.itemsGrid} id="favorites-grid">
            {items.map((item) => (
              <FavoriteItemCard
                key={item.listingId}
                item={item}
                onUnfavorite={handleUnfavorite}
                isRemoving={removingIds.has(item.listingId)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* ── FAB ── */}
      <Link href={ROUTES.ADD_LISTING} className={styles.fab} id="post-new-item-fab">
        <PlusIcon />
        Post New Item
      </Link>
    </div>
  );
}
