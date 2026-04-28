/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import ReportListingModal from '@/src/components/reports/ReportListingModal';
import { ROUTES } from '@/src/config/routes';
import { resolveSupabaseUserRole } from '@/src/utils/authHelpers';
import { useAuth } from '@/src/hooks/useAuth';
import { getProfile } from '@/src/services/profileService';
import {
  getPublicListingById,
  recordPublicListingView,
} from '@/src/services/listingService';
import {
  toggleFavorite,
  checkFavoriteStatus,
} from '@/src/services/favoriteService';
import type { PublicListingDetailResponse, PublicListingSummary } from '@/src/types/listing';
import styles from './page.module.css';

interface ProductDetailClientProps {
  listingId: string;
}

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

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2 4 5v6c0 5.25 3.44 9.74 8 11 4.56-1.26 8-5.75 8-11V5l-8-3Z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 2.5 2.94 5.95 6.56.95-4.75 4.63 1.12 6.54L12 17.48l-5.87 3.09 1.12-6.54L2.5 9.4l6.56-.95L12 2.5Z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41 11 23l-9-9V3h11l9.59 9.59a2 2 0 0 1 0 2.82Z" />
      <path d="M7 7h.01" />
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

function formatDate(value: string | null) {
  if (!value) {
    return 'Recently published';
  }

  return new Intl.DateTimeFormat('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function buildGallery(listing: PublicListingSummary) {
  const seen = new Set<string>();

  return [listing.coverImagePath, ...listing.imagePaths]
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    });
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

function getToneClass(listing: PublicListingSummary) {
  const seed =
    listing.category?.id ??
    listing.location.stateId ??
    listing.location.areaId ??
    listing.title.length;

  return toneClasses[Math.abs(seed) % toneClasses.length];
}

function getSellerLocationLabel(response: PublicListingDetailResponse['seller']) {
  if (response.location.areaName && response.location.stateName) {
    return `${response.location.areaName}, ${response.location.stateName}`;
  }

  if (response.location.stateName) {
    return response.location.stateName;
  }

  return 'Malaysia';
}

export default function ProductDetailClient({ listingId }: ProductDetailClientProps) {
  const router = useRouter();
  const { user, session } = useAuth();

  const [response, setResponse] = useState<PublicListingDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showOfferModal, setShowOfferModal] = useState<'purchase' | 'offer' | null>(null);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const recordedViewIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadListing() {
      setLoading(true);
      setError(null);

      const result = await getPublicListingById(listingId);

      if (cancelled) {
        return;
      }

      if (result.data) {
        setResponse(result.data);
        setActiveIndex(0);
        recordedViewIdsRef.current.delete(listingId);
      } else {
        setError(result.error || 'Unable to load listing details');
      }

      setLoading(false);
    }

    loadListing();

    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    if (!response || recordedViewIdsRef.current.has(listingId)) {
      return;
    }

    let cancelled = false;
    recordedViewIdsRef.current.add(listingId);

    async function trackView() {
      const result = await recordPublicListingView(listingId);

      if (cancelled || !result.data) {
        return;
      }

      const nextViewsCount = result.data.viewsCount;

      setResponse((current) =>
        current
          ? {
              ...current,
              listing: {
                ...current.listing,
                viewsCount: nextViewsCount,
              },
            }
          : current
      );
    }

    trackView();

    return () => {
      cancelled = true;
    };
  }, [listingId, response]);

  useEffect(() => {
    if (!user || !session?.access_token) {
      setViewerRole(null);
      return;
    }

    let cancelled = false;

    getProfile(session.access_token).then((profileResponse) => {
      if (cancelled) {
        return;
      }

      setViewerRole(
        resolveSupabaseUserRole(user, profileResponse.data?.role ?? null)
      );
    }).catch(() => {
      if (!cancelled) {
        setViewerRole(resolveSupabaseUserRole(user));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, user]);

  const resolvedViewerRole = resolveSupabaseUserRole(user, viewerRole);
  const isAdminViewer = resolvedViewerRole === 'admin';
  const memberAccessResolved = !user || resolvedViewerRole !== null;
  const showMemberActions = !user || resolvedViewerRole === 'user';
  const accountHubRoute = isAdminViewer ? ROUTES.ADMIN : ROUTES.DASHBOARD;
  const inboxRoute = isAdminViewer ? ROUTES.ADMIN_MESSAGES : ROUTES.MESSAGES;

  // Check favorite status when user is authenticated
  useEffect(() => {
    if (!user || !session?.access_token || !response || resolvedViewerRole !== 'user') return;
    let cancelled = false;

    async function checkStatus() {
      const result = await checkFavoriteStatus(session!.access_token, [listingId]);
      if (!cancelled && result.data) {
        setIsFavorited(result.data[listingId] ?? false);
      }
    }

    checkStatus();
    return () => { cancelled = true; };
  }, [listingId, resolvedViewerRole, response, session, user]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function handleProtectedNavigation(path: string) {
    if (user) {
      router.push(path);
      return;
    }

    router.push(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(path)}`);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = searchText.trim()
      ? `${ROUTES.BROWSE}?q=${encodeURIComponent(searchText.trim())}`
      : ROUTES.BROWSE;
    router.push(target);
  }

  async function handleFavoriteToggle() {
    if (!user || !session?.access_token) {
      router.push(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(`/product/${listingId}`)}`);
      return;
    }

    if (resolvedViewerRole !== 'user') {
      setToast('Admin accounts cannot save marketplace favorites.');
      return;
    }

    if (favoriteLoading) return;
    setFavoriteLoading(true);

    try {
      const result = await toggleFavorite(session.access_token, listingId);
      if (result.data) {
        setIsFavorited(result.data.favorited);
        setToast(result.data.favorited ? 'Added to favorites' : 'Removed from favorites');
      } else {
        setToast(result.error || 'Failed to update favorite');
      }
    } catch {
      setToast('Failed to update favorite');
    } finally {
      setFavoriteLoading(false);
    }
  }

  async function handleOfferSubmit() {
    if (!user || !session?.access_token || !response) return;
    if (offerSubmitting) return;

    if (resolvedViewerRole !== 'user') {
      setToast('Admin accounts cannot place offers or purchase requests.');
      return;
    }

    const { createOffer } = await import('@/src/services/offerService');
    setOfferSubmitting(true);

    const price = showOfferModal === 'purchase'
      ? response.listing.price
      : parseFloat(offerPrice);

    if (isNaN(price) || price < 0) {
      setToast('Please enter a valid price');
      setOfferSubmitting(false);
      return;
    }

    const result = await createOffer(session.access_token, {
      listingId,
      offerPrice: price,
      message: offerMessage.trim() || undefined,
      offerKind: showOfferModal === 'purchase' ? 'purchase_request' : 'offer',
    });

    setOfferSubmitting(false);

    if (result.data) {
      setShowOfferModal(null);
      setOfferPrice('');
      setOfferMessage('');
      setToast('Offer sent successfully!');
    } else {
      setToast(result.error || 'Failed to send offer');
    }
  }

  function handleOpenReport() {
    if (!user || !session?.access_token) {
      router.push(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(`/product/${listingId}`)}`);
      return;
    }

    if (resolvedViewerRole !== 'user') {
      setToast('Admin accounts cannot submit marketplace reports.');
      return;
    }

    setReportOpen(true);
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.emptyState}>
            <h1>Loading listing...</h1>
            <p>We&apos;re pulling the latest product detail from the backend.</p>
          </section>
        </main>
      </div>
    );
  }

  if (error || !response) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.emptyState}>
            <h1>We couldn&apos;t load this listing.</h1>
            <p>{error || 'The item may have been removed or is no longer public.'}</p>
            <Link href={ROUTES.BROWSE} className={styles.emptyLink}>
              Return to browse
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const { listing, seller, related } = response;
  const gallery = buildGallery(listing);
  const activeImage = gallery[activeIndex] ?? null;
  const toneClass = styles[getToneClass(listing)];
  const sellerLocationLabel = getSellerLocationLabel(seller);
  const isSoldOut = listing.status === 'sold';
  const availabilityLabel = isSoldOut ? 'Sold Out' : listing.statusLabel;
  const breadcrumb = ['Marketplace', listing.category?.name ?? 'Listings', listing.locationLabel];
  const detailRows = [
    { label: 'Condition', value: listing.conditionLabel },
    { label: 'Location', value: listing.locationLabel },
    { label: 'Category', value: listing.category?.name ?? 'Uncategorized' },
    { label: 'Brand', value: listing.brand?.trim() || 'Not specified' },
    { label: 'Published', value: formatDate(listing.publishedAt || listing.createdAt) },
    { label: 'Views', value: `${listing.viewsCount} total views` },
  ];
  const storyParagraphs = [
    listing.description?.trim() ||
      `${listing.title} is a live seller listing in ReMarket.`,
    listing.brand?.trim()
      ? `The seller listed this piece under ${listing.brand.trim()} and marked it as ${listing.conditionLabel.toLowerCase()}.`
      : `The seller marked this item as ${listing.conditionLabel.toLowerCase()} and published it from ${listing.locationLabel}.`,
    isAdminViewer
      ? 'Administrators can review this listing and seller history here, but offers, favorites, and direct marketplace actions stay disabled in admin mode.'
      : isSoldOut
        ? 'This listing is now sold out. Buyers can still review the listing history here, but new offers and messages are closed.'
        : listing.negotiable
          ? 'The asking price is currently negotiable, so buyers can reach out or submit an offer from the marketplace flow.'
          : 'The listing is currently set to a fixed asking price, but buyers can still contact the seller through the marketplace flow.',
  ];
  const highlights = [
    `${listing.favoritesCount} saves and ${listing.totalOffersCount} recorded offer${listing.totalOffersCount === 1 ? '' : 's'}.`,
    `${gallery.length} image${gallery.length === 1 ? '' : 's'} attached by the seller.`,
    `Seller has ${seller.activeListings} active listing${seller.activeListings === 1 ? '' : 's'} and ${seller.totalSales} completed sale${seller.totalSales === 1 ? '' : 's'}.`,
  ];
  const included = [
    `Listing currency: ${listing.currency}`,
    `Seller region: ${sellerLocationLabel}`,
    `Status: ${availabilityLabel}`,
  ];

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <Link href={ROUTES.BROWSE} className={styles.brand}>
            <span className={styles.brandMark}>R</span>
            <span>ReMarket</span>
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
          <form className={styles.searchShell} onSubmit={handleSearchSubmit}>
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search the marketplace..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </form>

          <Link href={accountHubRoute} className={styles.iconButton} aria-label="Dashboard alerts">
            <BellIcon />
          </Link>
          {showMemberActions && (
            <Link href={ROUTES.FAVORITES} className={styles.iconButton} aria-label="Saved listings">
              <HeartIcon />
            </Link>
          )}
          <Link href={accountHubRoute} className={styles.avatarButton}>
            {isAdminViewer ? 'Admin' : 'Hub'}
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          {breadcrumb.map((crumb) => (
            <span key={crumb} className={styles.breadcrumbItem}>
              <span>{crumb}</span>
              <ChevronRightIcon />
            </span>
          ))}
          <span className={styles.breadcrumbCurrent}>{listing.title}</span>
        </nav>

        <section className={styles.heroSection}>
          <div className={styles.mediaColumn}>
            <div className={`${styles.heroMedia} ${toneClass}`}>
                <div className={styles.heroMediaTop}>
                  <div className={styles.heroBadges}>
                  <span className={styles.badgeSoft}>{availabilityLabel}</span>
                  <span className={styles.badgeMint}>{listing.conditionLabel}</span>
                </div>
                {showMemberActions && (
                  <button
                    type="button"
                    className={`${styles.saveButton} ${isFavorited ? styles.saveButtonActive : ''}`}
                    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    onClick={handleFavoriteToggle}
                    disabled={favoriteLoading}
                  >
                    <HeartIcon />
                  </button>
                )}
              </div>

              <div className={styles.heroGlow} />
              {activeImage ? (
                <img src={activeImage} alt={listing.title} className={styles.heroImage} />
              ) : (
                <div className={styles.heroPlaceholder}>
                  <span className={styles.heroPlaceholderGlyph}>{getPlaceholderLabel(listing)}</span>
                  <p>No seller photos uploaded yet.</p>
                </div>
              )}

              <div className={styles.mediaAnnotation}>
                <span className={styles.mediaAnnotationLabel}>Listing Note</span>
                <p>
                  Published {formatDate(listing.publishedAt || listing.createdAt)} from {listing.locationLabel}.
                </p>
              </div>
            </div>

            {gallery.length > 0 && (
              <div className={styles.galleryRail}>
                {gallery.map((imageUrl, index) => {
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={imageUrl}
                      type="button"
                      className={`${styles.thumbnailButton} ${isActive ? styles.thumbnailButtonActive : ''}`}
                      onClick={() => setActiveIndex(index)}
                      aria-pressed={isActive}
                    >
                      <div className={`${styles.thumbnailFrame} ${toneClass}`}>
                        <img src={imageUrl} alt={`${listing.title} view ${index + 1}`} className={styles.thumbnailImage} />
                      </div>
                      <span className={styles.thumbnailLabel}>View {index + 1}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className={styles.purchaseRail}>
            <div className={styles.titleBlock}>
              <p className={styles.collectionEyebrow}>{listing.category?.name ?? 'Marketplace listing'}</p>
              <h1 className={styles.title}>{listing.title}</h1>
              <div className={styles.priceRow}>
                <span className={styles.price}>{formatCurrency(listing.price, listing.currency)}</span>
                {isSoldOut && <span className={styles.soldOutPill}>{availabilityLabel}</span>}
                <span className={styles.negotiablePill}>
                  <TagIcon />
                  {listing.negotiable ? 'Negotiable' : 'Fixed price'}
                </span>
              </div>
              <p className={styles.titleNote}>
                Sold by {seller.displayName} in {listing.locationLabel}.
              </p>
              {isSoldOut && (
                <div className={styles.soldOutBanner}>
                  <strong>{availabilityLabel}</strong>
                  <span>This listing has already been purchased and is now shown for reference only.</span>
                </div>
              )}
            </div>

            <div className={styles.detailCard}>
              {detailRows.map((detail) => (
                <div key={detail.label} className={styles.detailItem}>
                  <span className={styles.detailLabel}>{detail.label}</span>
                  <strong className={styles.detailValue}>{detail.value}</strong>
                </div>
              ))}
            </div>

            <div className={styles.sellerCard}>
              <div className={styles.sellerTop}>
                <div className={styles.sellerAvatar}>
                  {seller.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className={styles.sellerMeta}>
                  <div className={styles.sellerNameRow}>
                    <h2 className={styles.sellerName}>{seller.displayName}</h2>
                    <span className={styles.verifiedMark}>
                      <ShieldIcon />
                    </span>
                  </div>
                  <p className={styles.sellerTitle}>@{seller.username || 'seller'}</p>
                  <div className={styles.sellerStats}>
                    <span className={styles.rating}>
                      <StarIcon />
                      {seller.averageRating?.toFixed(1) ?? 'New'}
                    </span>
                    <span>{seller.totalSales} sales</span>
                    <span>Since {seller.memberSince}</span>
                  </div>
                </div>
              </div>

              <div className={styles.sellerFoot}>
                <p>{seller.activeListings} active listing(s) from {sellerLocationLabel}.</p>
                <Link href={ROUTES.BROWSE} className={styles.sellerProfileLink}>
                  View marketplace
                </Link>
              </div>
            </div>

            <div className={styles.actionStack}>
              {listing.status === 'active' ? (
                !memberAccessResolved ? (
                  <div className={styles.statusNotice}>
                    Checking account permissions for marketplace actions...
                  </div>
                ) : isAdminViewer ? (
                  <div className={styles.statusNotice}>
                    <strong>Admin view only.</strong> You can inspect listings and seller history here,
                    but favorites, offers, and purchase requests are disabled for administrator
                    accounts. Seller outreach stays inside the admin console listing-management flow.
                  </div>
                ) : (
                <>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={() => {
                      if (!user) {
                        router.push(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(`/product/${listingId}`)}`);
                        return;
                      }
                      setOfferPrice(String(listing.price));
                      setOfferMessage('');
                      setShowOfferModal('purchase');
                    }}
                  >
                    Request to Buy
                  </button>
                  <div className={styles.secondaryActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() =>
                        handleProtectedNavigation(
                          `${inboxRoute}?${new URLSearchParams({
                            listingId: listing.id,
                            recipientId: seller.id,
                            recipientName: seller.displayName,
                          }).toString()}`
                        )
                      }
                    >
                      <MailIcon />
                      Message Seller
                    </button>
                    {listing.negotiable && (
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() => {
                          if (!user) {
                            router.push(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(`/product/${listingId}`)}`);
                            return;
                          }
                          setOfferPrice('');
                          setOfferMessage('');
                          setShowOfferModal('offer');
                        }}
                      >
                        <TagIcon />
                        Make Offer
                      </button>
                    )}
                  </div>
                </>
                )
              ) : (
                <div className={styles.statusNotice}>
                  {isSoldOut ? (
                    <>
                      This listing is <strong>{availabilityLabel}</strong>. You can still view the full details,
                      but it is no longer accepting offers or new messages.
                    </>
                  ) : (
                    <>
                      This listing is currently <strong>{availabilityLabel}</strong> and is not accepting new
                      offers.
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={styles.assuranceCard}>
              <div>
                <span className={styles.assuranceLabel}>Seller</span>
                <strong>{seller.totalReviews} review(s) on record</strong>
              </div>
              <div>
                <span className={styles.assuranceLabel}>Interest</span>
                <strong>{listing.favoritesCount} saves, {listing.totalOffersCount} offers</strong>
              </div>
              <div>
                <span className={styles.assuranceLabel}>Workflow</span>
                <strong>Offers and messages are linked to this listing</strong>
              </div>
            </div>
          </aside>
        </section>

        <section className={styles.storySection}>
          <article className={`${styles.storyCard} ${styles.storyMain}`}>
            <p className={styles.sectionEyebrow}>The Story</p>
            <h2>What this live listing tells buyers.</h2>
            {storyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {showMemberActions && (
              <button type="button" className={styles.reportButton} onClick={handleOpenReport}>
                Report this listing
              </button>
            )}
          </article>

          <article className={styles.storyCard}>
            <p className={styles.sectionEyebrow}>Listing Notes</p>
            <h2>Marketplace signals</h2>
            <ul className={styles.pointList}>
              {highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </article>

          <article className={styles.storyCard}>
            <p className={styles.sectionEyebrow}>Included</p>
            <h2>Current listing details</h2>
            <ul className={styles.pointList}>
              {included.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </article>
        </section>

        {related.length > 0 && (
          <section className={styles.recommendSection}>
            <div className={styles.recommendHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Curated Recommendations</p>
                <h2>More from ReMarket</h2>
              </div>
              <Link href={ROUTES.BROWSE} className={styles.viewAllLink}>
                View all items
              </Link>
            </div>

            <div className={styles.recommendGrid}>
              {related.map((relatedItem) => {
                const relatedImage = buildGallery(relatedItem)[0] ?? null;

                return (
                  <Link
                    key={relatedItem.id}
                    href={`/product/${relatedItem.id}`}
                    className={styles.recommendCard}
                  >
                    <div className={`${styles.recommendMedia} ${styles[getToneClass(relatedItem)]}`}>
                      <span className={styles.recommendSave} aria-hidden="true">
                        <HeartIcon />
                      </span>
                      {relatedImage ? (
                        <img src={relatedImage} alt={relatedItem.title} className={styles.recommendImage} />
                      ) : (
                        <div className={styles.recommendPlaceholder}>
                          {getPlaceholderLabel(relatedItem)}
                        </div>
                      )}
                    </div>
                    <div className={styles.recommendBody}>
                      <h3>{relatedItem.title}</h3>
                      <p>{relatedItem.locationLabel}</p>
                      <strong>{formatCurrency(relatedItem.price, relatedItem.currency)}</strong>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <footer className={styles.footer}>
          <div className={styles.footerBrand}>
            <Link href={ROUTES.BROWSE} className={styles.footerLogo}>
              ReMarket
            </Link>
            <p>
              Real seller inventory, presented with cleaner product storytelling and backend-backed listing details.
            </p>
          </div>

          <div className={styles.footerColumns}>
            <div>
              <h3>Marketplace</h3>
              <Link href={ROUTES.BROWSE}>New arrivals</Link>
              <Link href={ROUTES.BROWSE}>Curated selections</Link>
              <Link href={ROUTES.BROWSE}>Verification flow</Link>
            </div>
            <div>
              <h3>Support</h3>
              <Link href={inboxRoute}>{isAdminViewer ? 'Admin inbox' : 'Messages'}</Link>
              <Link href={isAdminViewer ? ROUTES.ADMIN_USERS : ROUTES.OFFERS}>
                {isAdminViewer ? 'User review' : 'Offers'}
              </Link>
              <Link href={isAdminViewer ? ROUTES.ADMIN_STRUCTURE : ROUTES.SETTINGS}>
                {isAdminViewer ? 'Structure' : 'Contact'}
              </Link>
            </div>
            <div>
              <h3>{isAdminViewer ? 'Admin' : 'Account'}</h3>
              <Link href={isAdminViewer ? ROUTES.ADMIN : ROUTES.FAVORITES}>
                {isAdminViewer ? 'Overview' : 'Saved items'}
              </Link>
              <Link href={isAdminViewer ? ROUTES.ADMIN_USERS : ROUTES.MY_LISTINGS}>
                {isAdminViewer ? 'Users' : 'My listings'}
              </Link>
              <Link href={isAdminViewer ? ROUTES.ADMIN_STRUCTURE : ROUTES.PROFILE}>
                {isAdminViewer ? 'Structure' : 'Profile'}
              </Link>
            </div>
          </div>
        </footer>
      </main>

      {/* ── Offer Modal ── */}
      {showOfferModal && response && (
        <div className={styles.modalOverlay} onClick={() => setShowOfferModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={() => setShowOfferModal(null)}>
              ✕
            </button>
            <h2 className={styles.modalTitle}>
              {showOfferModal === 'purchase' ? 'Request to Buy' : 'Make an Offer'}
            </h2>
            <p className={styles.modalSubtitle}>
              {showOfferModal === 'purchase'
                ? `You are requesting to buy "${response.listing.title}" at the asking price.`
                : `Submit a custom offer for "${response.listing.title}".`}
            </p>

            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                {showOfferModal === 'purchase' ? 'Price' : 'Your Offer Price'}
              </label>
              <div className={styles.modalInputRow}>
                <span className={styles.modalCurrency}>{response.listing.currency}</span>
                <input
                  type="number"
                  className={styles.modalInput}
                  value={showOfferModal === 'purchase' ? String(response.listing.price) : offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  disabled={showOfferModal === 'purchase'}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              {showOfferModal === 'offer' && (
                <p className={styles.modalHint}>
                  Asking price: {formatCurrency(response.listing.price, response.listing.currency)}
                </p>
              )}
            </div>

            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Message (optional)</label>
              <textarea
                className={styles.modalTextarea}
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                placeholder={showOfferModal === 'purchase'
                  ? 'Hi, I want to buy this item.'
                  : 'Add a note for the seller...'}
                rows={3}
              />
            </div>

            <button
              type="button"
              className={styles.modalSubmit}
              onClick={handleOfferSubmit}
              disabled={offerSubmitting}
            >
              {offerSubmitting
                ? 'Sending...'
                : showOfferModal === 'purchase'
                  ? 'Send Purchase Request'
                  : 'Send Offer'}
            </button>
          </div>
        </div>
      )}

      <ReportListingModal
        key={reportOpen ? listing.id : 'hidden'}
        open={reportOpen}
        listing={{ id: listing.id, title: listing.title }}
        token={session?.access_token ?? null}
        onClose={() => setReportOpen(false)}
        onReported={(message) => {
          setReportOpen(false);
          setToast(message);
        }}
      />

      {toast && (
        <div className={styles.toast}>
          {toast}
          {toast === 'Offer sent successfully!' && (
            <Link href={ROUTES.OFFERS} className={styles.toastLink}>
              View My Offers
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
