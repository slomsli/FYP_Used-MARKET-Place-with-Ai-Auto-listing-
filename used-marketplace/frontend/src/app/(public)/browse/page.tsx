/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import ReportListingModal from '@/src/components/reports/ReportListingModal';
import { useAuth } from '@/src/hooks/useAuth';
import { getProfile } from '@/src/services/profileService';
import { getPublicListings } from '@/src/services/listingService';
import {
  toggleFavorite,
  checkFavoriteStatus,
} from '@/src/services/favoriteService';
import type {
  ListingCondition,
  PublicListingSortOption,
  PublicListingSummary,
  PublicListingsResponse,
} from '@/src/types/listing';
import styles from './page.module.css';

const PAGE_SIZE = 6;

const sortOptions: Array<{ value: PublicListingSortOption; label: string }> = [
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'popular', label: 'Most viewed' },
  { value: 'price_asc', label: 'Price low to high' },
  { value: 'price_desc', label: 'Price high to low' },
];

const toneClasses = ['toneSeafoam', 'toneInk', 'toneLinen', 'toneCopper'] as const;

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35 10.55 20C5.4 15.24 2 12.11 2 8.28 2 5.27 4.27 3 7.28 3c1.7 0 3.33.79 4.42 2.03A5.97 5.97 0 0 1 16.12 3C19.13 3 21.4 5.27 21.4 8.28c0 3.83-3.4 6.96-8.55 11.72L12 21.35Z" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4v16" />
      <path d="M5 5h10l-1.5 3L15 11H5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatCurrency(amount: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatConditionLabel(condition: ListingCondition) {
  switch (condition) {
    case 'like_new':
      return 'Like New';
    case 'new':
      return 'New';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'poor':
      return 'Poor';
    default:
      return condition;
  }
}

function getToneClass(listing: PublicListingSummary, index: number) {
  const seed =
    listing.category?.id ??
    listing.location.stateId ??
    listing.location.areaId ??
    index;

  return toneClasses[Math.abs(seed) % toneClasses.length];
}

function getImageUrls(listing: PublicListingSummary) {
  const seen = new Set<string>();
  const urls = [listing.coverImagePath, ...listing.imagePaths]
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    });

  return urls;
}

function getPlaceholderLabel(listing: PublicListingSummary) {
  const source = listing.category?.name || listing.brand || listing.title;

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'RM';
}

function getPaginationItems(totalPages: number, currentPage: number) {
  if (totalPages <= 1) {
    return [1];
  }

  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | 'start-ellipsis' | 'end-ellipsis'> = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    items.push('start-ellipsis');
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    items.push(page);
  }

  if (windowEnd < totalPages - 1) {
    items.push('end-ellipsis');
  }

  items.push(totalPages);
  return items;
}

function toPercent(value: number, min: number, max: number) {
  if (max <= min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}

function getInitialBrowseQuery() {
  if (typeof window === 'undefined') {
    return '';
  }

  return new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
}

export default function BrowsePage() {
  const router = useRouter();
  const { user, session } = useAuth();

  const [searchText, setSearchText] = useState(getInitialBrowseQuery);
  const [query, setQuery] = useState(getInitialBrowseQuery);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<ListingCondition[]>([]);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [sortBy, setSortBy] = useState<PublicListingSortOption>('newest');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [response, setResponse] = useState<PublicListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = useState<PublicListingSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !session?.access_token) {
      setViewerRole(null);
      return;
    }

    let cancelled = false;

    getProfile(session.access_token).then((response) => {
      if (cancelled) {
        return;
      }

      setViewerRole(
        response.data?.role ||
          (typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null)
      );
    }).catch(() => {
      if (!cancelled) {
        setViewerRole(typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, user]);

  const resolvedViewerRole =
    viewerRole || (typeof user?.user_metadata?.role === 'string' ? user.user_metadata.role : null);
  const isAdminViewer = resolvedViewerRole === 'admin';
  const showMemberActions = !user || resolvedViewerRole === 'user';
  const accountHubRoute = isAdminViewer ? ROUTES.ADMIN : ROUTES.DASHBOARD;
  const inboxRoute = isAdminViewer ? ROUTES.ADMIN_MESSAGES : ROUTES.MESSAGES;

  // Check favorite status when listings load and user is authenticated
  useEffect(() => {
    if (!user || !session?.access_token || !response?.listings?.length || resolvedViewerRole !== 'user') return;
    let cancelled = false;

    const listingIds = response.listings.map((item) => item.id);
    checkFavoriteStatus(session.access_token, listingIds).then((result) => {
      if (!cancelled && result.data) {
        setFavoriteMap((prev) => ({ ...prev, ...result.data }));
      }
    });

    return () => { cancelled = true; };
  }, [resolvedViewerRole, session, user, response]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function handleFavoriteToggle(e: React.MouseEvent, listingId: string) {
    e.preventDefault();
    e.stopPropagation();

    if (!user || !session?.access_token) {
      router.push(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(ROUTES.BROWSE)}`);
      return;
    }

    if (resolvedViewerRole !== 'user') {
      setToast('Admin accounts cannot save marketplace favorites.');
      return;
    }

    if (favoriteLoadingIds.has(listingId)) return;
    setFavoriteLoadingIds((s) => new Set(s).add(listingId));

    try {
      const result = await toggleFavorite(session.access_token, listingId);
      if (result.data) {
        setFavoriteMap((prev) => ({ ...prev, [listingId]: result.data!.favorited }));
        setToast(result.data.favorited ? 'Added to favorites' : 'Removed from favorites');
      }
    } catch {
      setToast('Failed to update favorite');
    } finally {
      setFavoriteLoadingIds((s) => {
        const next = new Set(s);
        next.delete(listingId);
        return next;
      });
    }
  }

  function handleOpenReport(event: React.MouseEvent, listing: PublicListingSummary) {
    event.preventDefault();
    event.stopPropagation();

    if (!user || !session?.access_token) {
      const redirect =
        typeof window === 'undefined'
          ? ROUTES.BROWSE
          : `${window.location.pathname}${window.location.search}`;
      router.push(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(redirect)}`);
      return;
    }

    if (resolvedViewerRole !== 'user') {
      setToast('Admin accounts cannot submit marketplace reports.');
      return;
    }

    setReportTarget(listing);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(searchText.trim());
      setCurrentPage(1);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const currentQueryParam = params.get('q') ?? '';

    if (currentQueryParam === query) {
      return;
    }

    if (query) {
      params.set('q', query);
    } else {
      params.delete('q');
    }

    const nextUrl = params.toString() ? `${ROUTES.BROWSE}?${params.toString()}` : ROUTES.BROWSE;
    router.replace(nextUrl, { scroll: false });
  }, [query, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadListings() {
      setLoading(true);
      setError(null);

      const result = await getPublicListings({
        q: query || undefined,
        categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
        conditions: selectedConditions.length > 0 ? selectedConditions : undefined,
        stateId: selectedStateId ? Number(selectedStateId) : undefined,
        minPrice: minPrice ?? undefined,
        maxPrice: maxPrice ?? undefined,
        sort: sortBy,
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      });

      if (cancelled) {
        return;
      }

      if (result.data) {
        setResponse(result.data);
      } else {
        setError(result.error || 'Unable to load marketplace listings');
      }

      setLoading(false);
    }

    loadListings();

    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    maxPrice,
    minPrice,
    query,
    reloadToken,
    selectedCategoryIds,
    selectedConditions,
    selectedStateId,
    sortBy,
  ]);

  const availableMin = response?.summary.priceRange.min ?? 0;
  const rawAvailableMax = response?.summary.priceRange.max ?? 0;
  const sliderMax = Math.max(rawAvailableMax, availableMin + 1);
  const minimumGap = Math.max(1, Math.round((sliderMax - availableMin) / 40));
  const appliedMin = minPrice ?? availableMin;
  const appliedMax = maxPrice ?? (rawAvailableMax || sliderMax);
  const totalPages = response ? Math.max(1, Math.ceil(response.pagination.total / PAGE_SIZE)) : 1;
  const selectedState = response?.lookups.states.find((state) => String(state.id) === selectedStateId) ?? null;
  const selectedCategoryLabels =
    response?.lookups.categories
      .filter((category) => selectedCategoryIds.includes(category.id))
      .map((category) => category.name) ?? [];
  const selectedConditionLabels =
    response?.lookups.conditions
      .filter((condition) => selectedConditions.includes(condition.value))
      .map((condition) => condition.label) ?? [];

  const activeFilterCount =
    selectedCategoryIds.length +
    selectedConditions.length +
    (selectedStateId ? 1 : 0) +
    (minPrice !== null || maxPrice !== null ? 1 : 0) +
    (query ? 1 : 0);

  const summaryChips = [
    selectedCategoryLabels.length > 0 ? selectedCategoryLabels.join(', ') : 'All categories',
    selectedConditionLabels.length > 0 ? selectedConditionLabels.join(', ') : 'All conditions',
    selectedState?.name ?? 'All states',
    `${formatCurrency(appliedMin)} to ${formatCurrency(appliedMax)}`,
  ];

  function toggleCategory(categoryId: number) {
    setCurrentPage(1);
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId]
    );
  }

  function toggleCondition(condition: ListingCondition) {
    setCurrentPage(1);
    setSelectedConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition]
    );
  }

  function resetFilters() {
    setSearchText('');
    setQuery('');
    setSelectedCategoryIds([]);
    setSelectedConditions([]);
    setSelectedStateId('');
    setSortBy('newest');
    setMinPrice(null);
    setMaxPrice(null);
    setCurrentPage(1);
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <Link href={ROUTES.BROWSE} className={styles.brand}>
            <span className={styles.brandMark}>R</span>
            <span>ReMarket Archive</span>
          </Link>

          <nav className={styles.nav}>
            <Link href={accountHubRoute} className={styles.navLink}>
              {isAdminViewer ? 'Admin Console' : 'Dashboard'}
            </Link>
            <Link href={ROUTES.BROWSE} className={`${styles.navLink} ${styles.navLinkActive}`}>
              Browse
            </Link>
            <Link href={isAdminViewer ? ROUTES.ADMIN_USERS : ROUTES.ADD_LISTING} className={styles.navLink}>
              {isAdminViewer ? 'Users' : 'Sell'}
            </Link>
          </nav>
        </div>

        <div className={styles.topActions}>
          <label className={styles.searchShell}>
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search marketplace..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <Link href={accountHubRoute} className={styles.iconButton} aria-label="Dashboard alerts">
            <BellIcon />
          </Link>
          <Link href={inboxRoute} className={styles.iconButton} aria-label="Messages">
            <MailIcon />
          </Link>
          {showMemberActions && (
            <Link href={ROUTES.FAVORITES} className={styles.iconButton} aria-label="Favorites">
              <HeartIcon />
            </Link>
          )}

          <Link href={accountHubRoute} className={styles.avatarButton}>
            {isAdminViewer ? 'Admin' : 'Hub'}
          </Link>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <p className={styles.sidebarEyebrow}>Discovery Tools</p>
            <h2 className={styles.sidebarTitle}>Refine live inventory</h2>
            <p className={styles.sidebarText}>
              Browse only seller-published listings from the real marketplace database.
            </p>
          </div>

          <section className={styles.filterSection}>
            <h3 className={styles.filterLabel}>Category</h3>
            <div className={styles.checkList}>
              {(response?.lookups.categories ?? []).map((option) => (
                <label key={option.id} className={styles.checkRow}>
                  <span className={styles.checkMeta}>
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(option.id)}
                      onChange={() => toggleCategory(option.id)}
                    />
                    <span>{option.name}</span>
                  </span>
                  <span className={styles.checkCount}>{option.count}</span>
                </label>
              ))}
            </div>
          </section>

          <section className={styles.filterSection}>
            <div className={styles.filterRow}>
              <h3 className={styles.filterLabel}>Price Range</h3>
              <span className={styles.filterHint}>{activeFilterCount} active</span>
            </div>

            <div className={styles.rangeSlider}>
              <div className={styles.rangeTrackBase} />
              <div
                className={styles.rangeTrackFill}
                style={{
                  left: `${toPercent(appliedMin, availableMin, sliderMax)}%`,
                  right: `${100 - toPercent(appliedMax, availableMin, sliderMax)}%`,
                }}
              />
              <input
                type="range"
                min={availableMin}
                max={sliderMax}
                step={minimumGap}
                value={appliedMin}
                className={styles.rangeInput}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setCurrentPage(1);
                  setMinPrice(Math.min(nextValue, Math.max(appliedMax - minimumGap, availableMin)));
                }}
              />
              <input
                type="range"
                min={availableMin}
                max={sliderMax}
                step={minimumGap}
                value={appliedMax}
                className={styles.rangeInput}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setCurrentPage(1);
                  setMaxPrice(Math.max(nextValue, Math.min(appliedMin + minimumGap, sliderMax)));
                }}
              />
            </div>

            <div className={styles.priceOutputs}>
              <div className={styles.priceBox}>
                <span className={styles.priceLabel}>Min</span>
                <strong>{formatCurrency(appliedMin)}</strong>
              </div>
              <div className={styles.priceBox}>
                <span className={styles.priceLabel}>Max</span>
                <strong>{formatCurrency(appliedMax)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.filterSection}>
            <h3 className={styles.filterLabel}>Condition</h3>
            <div className={styles.pillGroup}>
              {(response?.lookups.conditions ?? []).map((option) => {
                const isActive = selectedConditions.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.conditionPill} ${isActive ? styles.conditionPillActive : ''}`}
                    onClick={() => toggleCondition(option.value)}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.filterSection}>
            <h3 className={styles.filterLabel}>Location</h3>
            <label className={styles.selectShell}>
              <select
                className={styles.select}
                value={selectedStateId}
                onChange={(event) => {
                  setCurrentPage(1);
                  setSelectedStateId(event.target.value);
                }}
              >
                <option value="">All states</option>
                {(response?.lookups.states ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <span className={styles.selectIcon}>
                <ChevronIcon />
              </span>
            </label>
          </section>

          <button type="button" className={styles.resetButton} onClick={resetFilters}>
            Reset Filters
          </button>
        </aside>

        <main className={styles.content}>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Curated Browse</p>
              <h1 className={styles.title}>Live listings, pulled straight from seller inventory.</h1>
              <p className={styles.subtitle}>
                Showing {response?.pagination.total ?? 0} active listing
                {response?.pagination.total === 1 ? '' : 's'} with real pricing, locations, and seller data.
              </p>
            </div>

            <label className={styles.sortShell}>
              <span className={styles.sortLabel}>Sort by</span>
              <select
                className={styles.sortSelect}
                value={sortBy}
                onChange={(event) => {
                  setCurrentPage(1);
                  setSortBy(event.target.value as PublicListingSortOption);
                }}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <div className={styles.summaryRow}>
            {summaryChips.map((chip) => (
              <span key={chip} className={styles.summaryChip}>
                {chip}
              </span>
            ))}
          </div>

          {loading && !response ? (
            <section className={styles.emptyState}>
              <h2>Loading live listings...</h2>
              <p>The archive is syncing with the backend right now.</p>
            </section>
          ) : error ? (
            <section className={styles.emptyState}>
              <h2>We couldn&apos;t load the marketplace.</h2>
              <p>{error}</p>
              <button
                type="button"
                className={styles.emptyButton}
                onClick={() => setReloadToken((current) => current + 1)}
              >
                Try again
              </button>
            </section>
          ) : (response?.listings.length ?? 0) === 0 ? (
            <section className={styles.emptyState}>
              <h2>No listings match these filters.</h2>
              <p>Try widening the price range or clearing a few filters to see more live results.</p>
              <button type="button" className={styles.emptyButton} onClick={resetFilters}>
                Clear filters
              </button>
            </section>
          ) : (
            <>
              <section className={styles.grid}>
                {response?.listings.map((listing, index) => {
                  const imageUrls = getImageUrls(listing);
                  const imageUrl = imageUrls[0] ?? null;
                  const toneClass = styles[getToneClass(listing, index)];

                  return (
                    <Link key={listing.id} href={`/product/${listing.id}`} className={styles.cardLink}>
                      <article className={styles.card}>
                        <div className={`${styles.media} ${toneClass}`}>
                          <span className={styles.cardBadge}>
                            {listing.negotiable ? 'Negotiable' : 'Fixed Price'}
                          </span>
                          {showMemberActions && (
                            <button
                              type="button"
                              className={`${styles.cardHeart} ${favoriteMap[listing.id] ? styles.cardHeartActive : ''}`}
                              onClick={(e) => handleFavoriteToggle(e, listing.id)}
                              disabled={favoriteLoadingIds.has(listing.id)}
                              aria-label={favoriteMap[listing.id] ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <HeartIcon />
                            </button>
                          )}
                          <div className={styles.mediaGlow} />
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={listing.title}
                              className={styles.mediaImage}
                            />
                          ) : (
                            <div className={styles.placeholderMedia}>
                              <span className={styles.placeholderGlyph}>
                                {getPlaceholderLabel(listing)}
                              </span>
                              <p>Photo coming soon</p>
                            </div>
                          )}
                        </div>

                        <div className={styles.cardBody}>
                          <div className={styles.cardTop}>
                            <div>
                              <h2 className={styles.cardTitle}>{listing.title}</h2>
                              <p className={styles.cardMeta}>
                                {listing.locationLabel} | {listing.seller.displayName}
                              </p>
                            </div>
                            <span className={styles.cardPrice}>
                              {formatCurrency(listing.price, listing.currency)}
                            </span>
                          </div>

                          <p className={styles.cardNote}>
                            {listing.description?.trim() ||
                              listing.brand?.trim() ||
                              'Published by a verified seller through the live marketplace backend.'}
                          </p>

                          <div className={styles.cardFooter}>
                            <div className={styles.cardPills}>
                              <span className={styles.cardCategory}>
                                {listing.category?.name ?? 'Uncategorized'}
                              </span>
                              <span className={styles.cardCondition}>
                                {listing.conditionLabel || formatConditionLabel(listing.condition)}
                              </span>
                            </div>

                            {showMemberActions && (
                              <button
                                type="button"
                                className={styles.cardReport}
                                onClick={(event) => handleOpenReport(event, listing)}
                              >
                                <FlagIcon />
                                <span>Report</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    </Link>
                  );
                })}
              </section>

              <div className={styles.footerControls}>
                {response && response.pagination.hasMore && (
                  <button
                    type="button"
                    className={styles.loadButton}
                    onClick={() => setCurrentPage((current) => current + 1)}
                  >
                    Load More Listings
                    <span className={styles.loadButtonIcon}>
                      <ChevronIcon />
                    </span>
                  </button>
                )}

                <div className={styles.pagination}>
                  {getPaginationItems(totalPages, currentPage).map((item) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        className={`${styles.pageNumber} ${item === currentPage ? styles.pageNumberActive : ''} ${styles.pageButton}`}
                        onClick={() => setCurrentPage(item)}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={item} className={styles.pageEllipsis}>
                        ...
                      </span>
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <ReportListingModal
        key={reportTarget?.id ?? 'hidden'}
        open={Boolean(reportTarget)}
        listing={reportTarget ? { id: reportTarget.id, title: reportTarget.title } : null}
        token={session?.access_token ?? null}
        onClose={() => setReportTarget(null)}
        onReported={(message) => {
          setReportTarget(null);
          setToast(message);
        }}
      />
    </div>
  );
}
