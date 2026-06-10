'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { useDashboardAccount } from '@/src/components/layout/DashboardAccountContext';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  deleteListing,
  getMyListings,
  getListingSaleBuyerCandidates,
  markListingAsActive,
  markListingAsSold,
  updateListing,
} from '@/src/services/listingService';
import { scheduleEffectWork } from '@/src/utils/effectScheduling';
import type {
  CreateListingPayload,
  ListingFilterStatus,
  ListingSaleBuyerCandidate,
  ListingSortOption,
  ListingSummary,
  MyListingsResponse,
} from '@/src/types/listing';
import styles from './page.module.css';

type ListingTone = 'porcelain' | 'studio' | 'midnight';

const tabItems: Array<{ label: string; value: ListingFilterStatus; countKey: keyof MyListingsResponse['statusCounts'] }> = [
  { label: 'Active', value: 'active', countKey: 'active' },
  { label: 'Paused', value: 'paused', countKey: 'paused' },
  { label: 'Sold', value: 'sold', countKey: 'sold' },
  { label: 'Drafts', value: 'draft', countKey: 'draft' },
];

const sortItems: Array<{ label: string; value: ListingSortOption }> = [
  { label: 'Recent', value: 'recent' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Most Views', value: 'views_desc' },
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

function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
      <path d="M4 7.5V16.5L12 21L20 16.5V7.5" />
      <path d="M12 12V21" />
    </svg>
  );
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `RM ${amount.toFixed(0)}`;
  }
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRelativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Updated recently';
  }

  const differenceHours = Math.max(Math.floor((Date.now() - timestamp) / (1000 * 60 * 60)), 0);
  if (differenceHours < 24) {
    return `Updated ${differenceHours}h ago`;
  }

  return `Updated ${Math.floor(differenceHours / 24)}d ago`;
}

function getTone(index: number): ListingTone {
  const tones: ListingTone[] = ['porcelain', 'studio', 'midnight'];
  return tones[index % tones.length];
}

function canRenderImage(path: string | null) {
  return Boolean(path && (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')));
}

function getGalleryImages(listing: ListingSummary) {
  const seenPaths = new Set<string>();

  return [...listing.imagePaths, listing.coverImagePath]
    .filter((path): path is string => canRenderImage(path))
    .filter((path) => {
      if (seenPaths.has(path)) {
        return false;
      }

      seenPaths.add(path);
      return true;
    });
}

function buildRestorePayload(listing: ListingSummary): CreateListingPayload | null {
  if (!listing.category?.id) {
    return null;
  }

  const seenPaths = new Set<string>();
  const imageStoragePaths = [...listing.imageStoragePaths, listing.coverImageStoragePath]
    .filter((path): path is string => Boolean(path))
    .filter((path) => {
      if (seenPaths.has(path)) {
        return false;
      }

      seenPaths.add(path);
      return true;
    });

  return {
    title: listing.title,
    categoryId: listing.category.id,
    description: listing.description ?? undefined,
    brand: listing.brand ?? undefined,
    condition: listing.condition,
    price: listing.price,
    currency: listing.currency,
    negotiable: listing.negotiable,
    status: 'active',
    stateId: listing.location.stateId,
    areaId: listing.location.areaId,
    imageStoragePaths,
    coverImageStoragePath: listing.coverImageStoragePath,
  };
}

function getLocationLabel(listing: ListingSummary) {
  if (listing.location.areaName && listing.location.stateName) {
    return `${listing.location.areaName}, ${listing.location.stateName}`;
  }

  if (listing.location.stateName) {
    return listing.location.stateName;
  }

  return 'Location not set';
}

function parseStatus(value: string | null): ListingFilterStatus {
  if (value === 'archived' || value === 'rejected') {
    return 'paused';
  }

  return value === 'draft' || value === 'sold' || value === 'active' || value === 'paused'
    ? value
    : 'active';
}

function parseSort(value: string | null): ListingSortOption {
  return sortItems.some((item) => item.value === value) ? (value as ListingSortOption) : 'recent';
}

function getAccent(listing: ListingSummary) {
  if (listing.status === 'archived') {
    return 'Action Needed';
  }

  if (listing.status === 'rejected') {
    return 'In Review';
  }

  if (listing.status === 'sold') {
    return listing.soldTo ? 'Completed Sale' : 'Sold';
  }

  if (listing.pendingOffersCount > 0) {
    return `${listing.pendingOffersCount} Pending`;
  }

  if (listing.favoritesCount > 0) {
    return `${listing.favoritesCount} Saves`;
  }

  if (listing.autoNegotiationEnabled) {
    return 'Auto-Negotiate';
  }

  return listing.negotiable ? 'Negotiable' : 'Fixed Price';
}

function getModerationNote(listing: ListingSummary) {
  if (listing.status === 'archived') {
    return listing.moderationReason
      ? `Paused reason: ${listing.moderationReason}`
      : 'Paused by admin. Edit this listing and resubmit it from the paused workflow.';
  }

  if (listing.status === 'rejected') {
    return listing.moderationReason
      ? `Pending admin review. Last reason: ${listing.moderationReason}`
      : 'Your update was sent back to admin and is waiting for review.';
  }

  return null;
}

const SUSPENDED_LISTING_NOTICE =
  'Your account is suspended. Posting, editing, deleting, and listing status changes are disabled until an admin reactivates your account.';

export default function MyListingsPage() {
  const searchParams = useSearchParams();
  const { user, token, loading: authLoading } = useRequireAuth();
  const { isSuspended } = useDashboardAccount();
  const [status, setStatus] = useState<ListingFilterStatus>(() => parseStatus(searchParams.get('status')));
  const [sort, setSort] = useState<ListingSortOption>(() => parseSort(searchParams.get('sort')));
  const [data, setData] = useState<MyListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'sold' | 'active' | 'delete' | null>(null);
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({});
  const [saleTarget, setSaleTarget] = useState<ListingSummary | null>(null);
  const [saleCandidates, setSaleCandidates] = useState<ListingSaleBuyerCandidate[]>([]);
  const [saleCandidatesLoading, setSaleCandidatesLoading] = useState(false);
  const [selectedSaleBuyerId, setSelectedSaleBuyerId] = useState('');

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    async function loadListings() {
      setLoading(true);
      setError(null);

      if (!token) {
        if (!cancelled) {
          setError('No auth session found. Please sign in again.');
          setLoading(false);
        }
        return;
      }

      const response = await getMyListings(token, { status, sort });
      if (cancelled) {
        return;
      }

      if (response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Unable to load your listings');
      }

      setLoading(false);
    }

    loadListings();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, sort, status, token, user]);

  useEffect(() => {
    if (!data?.listings.length) {
      return;
    }

    const rotatableListings = data.listings
      .map((listing) => ({
        id: listing.id,
        totalImages: getGalleryImages(listing).length,
      }))
      .filter((listing) => listing.totalImages > 1);

    if (rotatableListings.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setCarouselIndexes((current) => {
        const nextIndexes = { ...current };

        for (const listing of rotatableListings) {
          nextIndexes[listing.id] = ((current[listing.id] ?? 0) + 1) % listing.totalImages;
        }

        return nextIndexes;
      });
    }, 3200);

    return () => {
      window.clearInterval(interval);
    };
  }, [data]);

  useEffect(() => {
    if (!saleTarget || !token) {
      return;
    }

    const currentSaleTarget = saleTarget;
    const currentToken = token;
    let cancelled = false;
    const cancelScheduledWork = scheduleEffectWork(() => {
      if (cancelled) {
        return;
      }

      setSaleCandidatesLoading(true);
      setSaleCandidates([]);
      setSelectedSaleBuyerId('');

      async function loadSaleCandidates() {
        const response = await getListingSaleBuyerCandidates(currentToken, currentSaleTarget.id);

        if (cancelled) {
          return;
        }

        if (!response.data) {
          setSaleTarget(null);
          setNotice({
            type: 'error',
            message: response.error || 'Failed to load recent buyers for this listing.',
          });
          setSaleCandidatesLoading(false);
          return;
        }

        setSaleCandidates(response.data);
        if (response.data.length === 1) {
          setSelectedSaleBuyerId(response.data[0].id);
        }
        setSaleCandidatesLoading(false);
      }

      void loadSaleCandidates();
    });

    return () => {
      cancelled = true;
      cancelScheduledWork();
    };
  }, [saleTarget, token]);

  const sellerStats = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      {
        label: 'Total Sales',
        value: formatCurrency(data.sellerStats.totalSalesAmount, 'MYR'),
      },
      {
        label: 'Active Items',
        value: String(data.sellerStats.activeItems),
      },
      {
        label: 'Seller Rating',
        value: data.sellerStats.averageRating
          ? `${data.sellerStats.averageRating}/5`
          : 'No reviews',
      },
    ];
  }, [data]);

  function closeSaleModal() {
    setSaleTarget(null);
    setSaleCandidates([]);
    setSaleCandidatesLoading(false);
    setSelectedSaleBuyerId('');
  }

  async function handleMarkSold(listing: ListingSummary) {
    if (isSuspended) {
      setNotice({ type: 'error', message: SUSPENDED_LISTING_NOTICE });
      return;
    }

    setNotice(null);
    setSaleTarget(listing);
  }

  async function submitMarkSold() {
    if (!saleTarget) {
      return;
    }

    if (!token) {
      setNotice({ type: 'error', message: 'No auth session found. Please sign in again.' });
      return;
    }

    setActingOnId(saleTarget.id);
    setActionType('sold');
    setNotice(null);

    const response = await markListingAsSold(token, saleTarget.id, {
      buyerUserId: selectedSaleBuyerId || null,
    });
    if (!response.data) {
      setActingOnId(null);
      setActionType(null);
      setNotice({ type: 'error', message: response.error || 'Failed to mark listing as sold' });
      return;
    }

    const soldBuyerName =
      response.data.soldTo?.displayName ||
      saleCandidates.find((candidate) => candidate.id === selectedSaleBuyerId)?.displayName ||
      null;

    setActingOnId(null);
    setActionType(null);
    closeSaleModal();
    setNotice({
      type: 'success',
      message: soldBuyerName
        ? `"${saleTarget.title}" was marked as sold to ${soldBuyerName}.`
        : `"${saleTarget.title}" was marked as sold.`,
    });
    setRefreshKey((current) => current + 1);
  }

  async function handleMarkActive(listing: ListingSummary) {
    if (isSuspended) {
      setNotice({ type: 'error', message: SUSPENDED_LISTING_NOTICE });
      return;
    }

    const confirmed = window.confirm(`Move "${listing.title}" back to active listings?`);
    if (!confirmed) {
      return;
    }

    setActingOnId(listing.id);
    setActionType('active');
    setNotice(null);

    if (!token) {
      setActingOnId(null);
      setActionType(null);
      setNotice({ type: 'error', message: 'No auth session found. Please sign in again.' });
      return;
    }

    let response = await markListingAsActive(token, listing.id);

    if (!response.data && response.error?.includes('status 404')) {
      const fallbackPayload = buildRestorePayload(listing);

      if (!fallbackPayload) {
        setActingOnId(null);
        setActionType(null);
        setNotice({
          type: 'error',
          message: 'This listing is missing category data, so it could not be restored.',
        });
        return;
      }

      response = await updateListing(token, listing.id, fallbackPayload);
    }

    if (!response.data) {
      setActingOnId(null);
      setActionType(null);
      setNotice({ type: 'error', message: response.error || 'Failed to mark listing as active' });
      return;
    }

    setActingOnId(null);
    setActionType(null);
    setNotice({ type: 'success', message: `"${listing.title}" is active again.` });

    if (status === 'sold') {
      setStatus('active');
      return;
    }

    setRefreshKey((current) => current + 1);
  }

  async function handleDelete(listingId: string, title: string) {
    if (isSuspended) {
      setNotice({ type: 'error', message: SUSPENDED_LISTING_NOTICE });
      return;
    }

    const confirmed = window.confirm(
      `Delete "${title}"? This only works when the listing has no offers, conversations, reviews, or reports.`
    );
    if (!confirmed) {
      return;
    }

    setActingOnId(listingId);
    setActionType('delete');
    setNotice(null);

    if (!token) {
      setActingOnId(null);
      setActionType(null);
      setNotice({ type: 'error', message: 'No auth session found. Please sign in again.' });
      return;
    }

    const response = await deleteListing(token, listingId);
    if (!response.data) {
      setActingOnId(null);
      setActionType(null);
      setNotice({ type: 'error', message: response.error || 'Failed to delete listing' });
      return;
    }

    setActingOnId(null);
    setActionType(null);
    setNotice({ type: 'success', message: `"${title}" was deleted.` });
    setRefreshKey((current) => current + 1);
  }

  function jumpToSlide(listingId: string, index: number) {
    setCarouselIndexes((current) => ({
      ...current,
      [listingId]: index,
    }));
  }

  const headerSubtitle = isSuspended
    ? 'Your inventory is available in read-only mode while listing activity is suspended by an administrator.'
    : data
      ? `You have ${data.statusCounts.all} total listings across active, paused, sold, and draft inventory.`
      : 'Review listing performance and manage your live inventory.';

  if (authLoading || (loading && !data)) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>Loading your inventory...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Curated Inventory</p>
          <h1 className={styles.title}>Inventory Management</h1>
          <p className={styles.subtitle}>{headerSubtitle}</p>
        </div>

        {isSuspended ? (
          <span className={`${styles.primaryCta} ${styles.primaryCtaDisabled}`}>
            Posting Suspended
          </span>
        ) : (
          <Link href={ROUTES.ADD_LISTING} className={styles.primaryCta}>
            Post New Item
          </Link>
        )}
      </section>

      <section className={styles.toolbar}>
        <div className={styles.tabs} aria-label="Listing status tabs">
          {tabItems.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`${styles.tab} ${status === tab.value ? styles.tabActive : ''}`}
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
              <span className={styles.tabCount}>
                {data?.statusCounts[tab.countKey] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.toolbarActions}>
          <label className={styles.utilityButton}>
            <SortIcon />
            <select
              className={styles.toolbarSelect}
              value={sort}
              onChange={(event) => setSort(event.target.value as ListingSortOption)}
            >
              {sortItems.map((item) => (
                <option key={item.value} value={item.value}>
                  Sort: {item.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={styles.utilityButton}
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            <FilterIcon />
            Refresh
          </button>
        </div>
      </section>

      {notice && (
        <div
          className={`${styles.noticeBar} ${
            notice.type === 'success' ? styles.noticeSuccess : styles.noticeError
          }`}
        >
          {notice.message}
        </div>
      )}

      {error && (
        <div className={styles.errorState}>
          <p>{error}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Try Again
          </button>
        </div>
      )}

      <section className={styles.grid} aria-label="Listing cards">
        {data && data.listings.length === 0 ? (
          <div className={styles.emptyState}>
            <p>
              {status === 'paused'
                ? 'No paused or pending-review listings are waiting right now.'
                : 'No listings found for this filter yet.'}
            </p>
            {isSuspended ? (
              <div className={styles.emptyRestriction}>
                {SUSPENDED_LISTING_NOTICE}
              </div>
            ) : (
              <Link href={ROUTES.ADD_LISTING} className={styles.emptyAction}>
                Create your first listing
              </Link>
            )}
          </div>
        ) : (
          data?.listings.map((listing, index) => {
            const tone = getTone(index);
            const galleryImages = getGalleryImages(listing);
            const moderationNote = getModerationNote(listing);
            const currentImageIndex = galleryImages.length > 0
              ? (carouselIndexes[listing.id] ?? 0) % galleryImages.length
              : 0;
            const currentImage = galleryImages[currentImageIndex] ?? null;

            return (
              <article key={listing.id} className={styles.card}>
                <div className={`${styles.media} ${styles[`tone${tone}`]}`}>
                  <div className={styles.badgeRow}>
                    <span className={`${styles.badge} ${styles.statusBadge}`}>
                      {listing.statusLabel}
                    </span>
                    <span className={`${styles.badge} ${styles.accentBadge}`}>
                      {getAccent(listing)}
                    </span>
                  </div>

                  <div className={styles.imageWrap}>
                    {currentImage ? (
                      <img
                        src={currentImage}
                        alt={listing.title}
                        className={styles.mediaImage}
                      />
                    ) : (
                      <div className={styles.mediaFallback}>
                        <span className={styles.mediaFallbackInitial}>
                          {listing.title.charAt(0).toUpperCase()}
                        </span>
                        <span className={styles.mediaFallbackLabel}>
                          {listing.category?.name || 'Marketplace'}
                        </span>
                      </div>
                    )}

                    {galleryImages.length > 1 && (
                      <>
                        <div className={styles.imageCounter}>
                          {currentImageIndex + 1} / {galleryImages.length}
                        </div>

                        <div className={styles.carouselDots} aria-label={`${listing.title} image selector`}>
                          {galleryImages.map((image, imageIndex) => (
                            <button
                              key={image}
                              type="button"
                              className={`${styles.carouselDot} ${
                                imageIndex === currentImageIndex ? styles.carouselDotActive : ''
                              }`}
                              onClick={() => jumpToSlide(listing.id, imageIndex)}
                              aria-label={`Show photo ${imageIndex + 1} for ${listing.title}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h2 className={styles.cardTitle}>{listing.title}</h2>
                      <div className={styles.cardLocation}>{getLocationLabel(listing)}</div>
                    </div>
                    <span className={styles.cardPrice}>
                      {formatCurrency(listing.price, listing.currency)}
                    </span>
                  </div>

                  <div className={styles.metaRow}>
                    <span className={styles.metaItem}>
                      <EyeIcon />
                      {formatCompactNumber(listing.viewsCount)} views
                    </span>
                    <span className={styles.metaItem}>
                      <HeartIcon />
                      {formatCompactNumber(listing.favoritesCount)} saves
                    </span>
                    <span className={styles.metaItem}>
                      <BoxIcon />
                      {listing.pendingOffersCount} pending offers
                    </span>
                  </div>

                  {listing.status === 'sold' && (
                    <div className={styles.saleNote}>
                      {listing.soldTo
                        ? `Bought by ${listing.soldTo.displayName}`
                        : 'Marked as sold'}
                    </div>
                  )}

                  {moderationNote && (
                    <div className={styles.moderationNote}>
                      {moderationNote}
                    </div>
                  )}

                  <div className={styles.cardActions}>
                    <div className={styles.cardActionInfo}>
                      {listing.conditionLabel}
                    </div>
                    <div className={styles.cardActionInfo}>
                      {formatRelativeDate(listing.updatedAt)}
                    </div>
                  </div>

                  <div className={styles.managementActions}>
                    {listing.status !== 'sold' && listing.status !== 'rejected' && (
                      isSuspended ? (
                        <span className={`${styles.secondaryAction} ${styles.actionDisabled}`}>
                          Edit Disabled
                        </span>
                      ) : (
                        <Link
                          href={`${ROUTES.ADD_LISTING}?listingId=${listing.id}`}
                          className={styles.secondaryAction}
                        >
                          {listing.status === 'archived' ? 'Edit & Resubmit' : 'Edit'}
                        </Link>
                      )
                    )}

                    {data.features?.aiListingCoachEnabled !== false &&
                      listing.status !== 'sold' &&
                      listing.status !== 'rejected' &&
                      !isSuspended && (
                      <Link
                        href={`${ROUTES.ADD_LISTING}?listingId=${listing.id}&coach=true`}
                        className={styles.coachAction}
                      >
                        AI Coach
                      </Link>
                    )}

                    {listing.status === 'rejected' && (
                      <span className={`${styles.secondaryAction} ${styles.actionDisabled}`}>
                        Waiting for Admin
                      </span>
                    )}

                    {(listing.status === 'active' || listing.status === 'reserved') && (
                      <button
                        type="button"
                        className={`${styles.successAction} ${isSuspended ? styles.actionDisabled : ''}`}
                        onClick={() => handleMarkSold(listing)}
                        disabled={isSuspended || actingOnId === listing.id}
                      >
                        {actingOnId === listing.id && actionType === 'sold'
                          ? 'Saving...'
                          : isSuspended
                            ? 'Sale Updates Disabled'
                            : 'Mark as Sold'}
                      </button>
                    )}

                    {listing.status === 'sold' && (
                      <button
                        type="button"
                        className={`${styles.successAction} ${isSuspended ? styles.actionDisabled : ''}`}
                        onClick={() => handleMarkActive(listing)}
                        disabled={isSuspended || actingOnId === listing.id}
                      >
                        {actingOnId === listing.id && actionType === 'active'
                          ? 'Saving...'
                          : isSuspended
                            ? 'Reactivation Disabled'
                            : 'Mark Active'}
                      </button>
                    )}

                    <button
                      type="button"
                      className={`${styles.dangerAction} ${isSuspended ? styles.actionDisabled : ''}`}
                      onClick={() => handleDelete(listing.id, listing.title)}
                      disabled={isSuspended || actingOnId === listing.id}
                    >
                      {actingOnId === listing.id && actionType === 'delete'
                        ? 'Deleting...'
                        : isSuspended
                          ? 'Delete Disabled'
                          : 'Delete'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {saleTarget && (
        <div className={styles.modalOverlay} onClick={closeSaleModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={closeSaleModal}>
              x
            </button>

            <p className={styles.modalEyebrow}>Complete Sale</p>
            <h2 className={styles.modalTitle}>Mark &quot;{saleTarget.title}&quot; as sold</h2>
            <p className={styles.modalText}>
              Save the buyer if this sale came from a marketplace offer or conversation. You can
              also leave it blank for an outside sale.
            </p>

            {saleCandidatesLoading ? (
              <div className={styles.modalLoading}>Loading recent buyers...</div>
            ) : (
              <>
                <div className={styles.saleBuyerChoices}>
                  <button
                    type="button"
                    className={`${styles.saleBuyerOption} ${
                      selectedSaleBuyerId === '' ? styles.saleBuyerOptionActive : ''
                    }`}
                    onClick={() => setSelectedSaleBuyerId('')}
                  >
                    <div className={styles.saleBuyerCopy}>
                      <strong>Leave buyer blank</strong>
                      <span>Use this when the item sold outside the marketplace flow.</span>
                    </div>
                  </button>

                  {saleCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`${styles.saleBuyerOption} ${
                        selectedSaleBuyerId === candidate.id ? styles.saleBuyerOptionActive : ''
                      }`}
                      onClick={() => setSelectedSaleBuyerId(candidate.id)}
                    >
                      <div className={styles.saleBuyerIdentity}>
                        {candidate.avatarPath ? (
                          <img
                            src={candidate.avatarPath}
                            alt=""
                            className={styles.saleBuyerAvatar}
                          />
                        ) : (
                          <span className={styles.saleBuyerFallback}>
                            {candidate.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className={styles.saleBuyerCopy}>
                          <strong>{candidate.displayName}</strong>
                          <span>{candidate.contextLabel}</span>
                        </div>
                      </div>
                      {candidate.lastActivityAt && (
                        <span className={styles.saleBuyerMeta}>
                          {formatRelativeDate(candidate.lastActivityAt)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {saleCandidates.length === 0 && (
                  <div className={styles.saleBuyerHint}>
                    No marketplace buyer was found for this listing yet, so the sale can only be
                    saved without a linked buyer.
                  </div>
                )}

                <div className={styles.modalActions}>
                  <button type="button" className={styles.secondaryAction} onClick={closeSaleModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.successAction}
                    onClick={() => void submitMarkSold()}
                    disabled={actingOnId === saleTarget.id && actionType === 'sold'}
                  >
                    {actingOnId === saleTarget.id && actionType === 'sold'
                      ? 'Saving...'
                      : 'Mark Sold'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {data && (
        <section className={styles.insights}>
          <div className={styles.insightsCopy}>
            <p className={styles.insightsEyebrow}>Seller Insights</p>
            <h2 className={styles.insightsTitle}>
              {data.statusCounts.all > 0
                ? `You currently have ${data.statusCounts.active} active listings, ${data.statusCounts.paused} paused items, and ${data.sellerStats.soldItems} completed sales.`
                : 'Your showroom is ready for its first listing.'}
            </h2>
            <p className={styles.insightsText}>
              The numbers below are pulled from the backend and update from your real listing, review, and sales data.
            </p>
          </div>

          <div className={styles.insightsStats}>
            {sellerStats.map((stat) => (
              <div key={stat.label} className={styles.statCard}>
                <span
                  className={`${styles.statValue} ${
                    stat.value.length >= 10 ? styles.statValueCompact : ''
                  }`}
                >
                  {stat.value}
                </span>
                <span className={styles.statLabel}>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
