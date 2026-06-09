/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { getAdminListingDetails } from '@/src/services/adminService';
import type { AdminListingDetailResponse } from '@/src/types/admin';
import { scheduleEffectWork } from '@/src/utils/effectScheduling';
import ImageLightbox from '@/src/components/ui/ImageLightbox';
import styles from './page.module.css';

interface ListingDetailClientProps {
  listingId: string;
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function formatCurrency(value: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not published yet';
  }

  return new Intl.DateTimeFormat('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'RM';
}

function buildGallery(listing: AdminListingDetailResponse['listing']) {
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

function getSafeReturnTo(value: string | null) {
  if (value && value.startsWith('/admin/')) {
    return value;
  }

  return ROUTES.ADMIN_LISTINGS;
}

function getStatusTone(status: string) {
  if (status === 'active' || status === 'reserved' || status === 'sold') {
    return styles.statusActive;
  }

  if (status === 'archived') {
    return styles.statusPaused;
  }

  if (status === 'rejected') {
    return styles.statusPending;
  }

  return styles.statusNeutral;
}

function getReportTone(status: AdminListingDetailResponse['recentReports'][number]['status']) {
  if (status === 'resolved') {
    return styles.reportResolved;
  }

  if (status === 'reviewed') {
    return styles.reportReviewing;
  }

  if (status === 'rejected') {
    return styles.reportDismissed;
  }

  return styles.reportPending;
}

function getModerationSummary(detail: AdminListingDetailResponse) {
  if (detail.listing.status === 'rejected') {
    return 'Seller updated this paused listing and sent it back for your approval. Review the refreshed photos and listing text before making the next decision.';
  }

  if (detail.listing.status === 'archived') {
    return 'This listing is paused and hidden from public browse. The seller can edit it from the Paused tab and resubmit it after fixing the issue.';
  }

  if (detail.listing.hiddenFromBrowse) {
    return 'This listing is currently hidden from public browse because of its current status.';
  }

  return 'This listing is visible to buyers right now, so any moderation decision here affects the live marketplace immediately.';
}

export default function ListingDetailClient({ listingId }: ListingDetailClientProps) {
  const searchParams = useSearchParams();
  const { token, loading: authLoading } = useRequireAuth();

  const [detail, setDetail] = useState<AdminListingDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    const cancelScheduledWork = scheduleEffectWork(() => {
      if (cancelled) {
        return;
      }

      setLoading(true);
      setError(null);

      getAdminListingDetails(token, listingId).then((response) => {
        if (cancelled) {
          return;
        }

        if (response.data) {
          setDetail(response.data);
        } else {
          setError(response.error || 'Unable to load listing details');
        }

        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      cancelScheduledWork();
    };
  }, [listingId, token]);

  const returnTo = getSafeReturnTo(searchParams.get('returnTo'));
  const source = searchParams.get('source') === 'reports' ? 'reports' : 'listings';
  const backLabel = source === 'reports' ? 'Back to Reports' : 'Back to Listings';

  const gallery = useMemo(() => (detail ? buildGallery(detail.listing) : []), [detail]);

  if (authLoading || loading) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Listing Review Detail</p>
            <h1 className={styles.title}>Loading listing review...</h1>
          </div>
        </section>

        <section className={styles.stateCard}>
          <h2>Preparing the latest listing submission</h2>
          <p>We&apos;re loading the updated photos, seller information, and moderation context.</p>
        </section>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <Link href={returnTo} className={styles.backLink}>
              <ArrowLeftIcon />
              <span>{backLabel}</span>
            </Link>
            <p className={styles.eyebrow}>Listing Review Detail</p>
            <h1 className={styles.title}>We couldn&apos;t open this listing.</h1>
          </div>
        </section>

        <section className={styles.stateCard}>
          <h2>Detail view unavailable</h2>
          <p>{error || 'The listing may have been removed or is no longer available to review.'}</p>
        </section>
      </div>
    );
  }

  const { listing, seller, metrics, recentReports } = detail;
  const messageHref = `${ROUTES.ADMIN_MESSAGES}?${new URLSearchParams({
    listingId: listing.id,
    listingTitle: listing.title,
    recipientId: seller.id,
    recipientName: seller.fullName,
  }).toString()}`;
  const reportsHref = `${ROUTES.ADMIN_REPORTS}?q=${encodeURIComponent(listing.title)}`;
  const descriptionParagraphs = listing.description?.trim()
    ? listing.description
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean)
    : ['The seller did not provide extra descriptive text for this listing.'];
  const detailRows = [
    { label: 'Price', value: formatCurrency(listing.price, listing.currency) },
    { label: 'Condition', value: listing.conditionLabel },
    { label: 'Category', value: listing.category?.name ?? 'Uncategorized' },
    { label: 'Location', value: listing.locationLabel },
    { label: 'Published', value: formatDate(listing.publishedAt) },
    { label: 'Created', value: formatDateTime(listing.createdAt) },
    { label: 'Last Updated', value: formatDateTime(listing.updatedAt) },
    { label: 'Pricing Mode', value: listing.negotiable ? 'Negotiable' : 'Fixed price' },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link href={returnTo} className={styles.backLink}>
            <ArrowLeftIcon />
            <span>{backLabel}</span>
          </Link>

          <p className={styles.eyebrow}>Listing Review Detail</p>
          <h1 className={styles.title}>{listing.title}</h1>
          <p className={styles.subtitle}>
            Review every seller photo, the latest edited submission, and the current moderation
            context before sending this listing back live or pausing it again.
          </p>
        </div>

        <div className={styles.heroActions}>
          <Link href={messageHref} className={styles.primaryButton}>
            <MessageIcon />
            <span>Message Seller</span>
          </Link>
          <Link href={ROUTES.ADMIN_LISTINGS} className={styles.secondaryButton}>
            Open Listing Queue
          </Link>
          <Link href={reportsHref} className={styles.secondaryButton}>
            Open Related Reports
          </Link>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.galleryCard}>
          <div className={styles.galleryHeader}>
            <div className={styles.badgeRow}>
              <span className={`${styles.statusPill} ${getStatusTone(listing.status)}`}>
                {listing.statusLabel}
              </span>
              <span className={styles.softPill}>{listing.conditionLabel}</span>
              <span className={styles.softPill}>
                {listing.negotiable ? 'Negotiable price' : 'Fixed price'}
              </span>
            </div>
            <p className={styles.galleryNote}>Updated {formatDateTime(listing.updatedAt)}</p>
          </div>

          {gallery.length === 0 && (
            <div className={styles.heroPlaceholder}>
              <PhotoIcon />
              <strong>{getInitials(listing.title)}</strong>
              <p>No seller photos were uploaded for this listing.</p>
            </div>
          )}

          {gallery.length > 0 && (
            <div className={styles.galleryRail}>
              {gallery.map((imageUrl, index) => (
                <button
                  key={imageUrl}
                  type="button"
                  className={styles.thumbnailButton}
                  onClick={() => {
                    setLightboxSrc(imageUrl);
                  }}
                  title="Click to enlarge"
                >
                  <img
                    src={imageUrl}
                    alt={`${listing.title} view ${index + 1}`}
                    className={styles.thumbnailImage}
                    style={{ cursor: 'zoom-in' }}
                  />
                  <span>Photo {index + 1}</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <aside className={styles.sidebar}>
          <article className={styles.sideCard}>
            <p className={styles.sectionEyebrow}>Submission Details</p>
            <h2>Current seller data</h2>
            <div className={styles.detailGrid}>
              {detailRows.map((row) => (
                <div key={row.label} className={styles.detailItem}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.sideCard}>
            <p className={styles.sectionEyebrow}>Seller Snapshot</p>
            <h2>{seller.fullName}</h2>
            <div className={styles.sellerRow}>
              <div className={styles.avatarShell}>
                {seller.avatarPath ? (
                  <img src={seller.avatarPath} alt={seller.fullName} className={styles.avatarImage} />
                ) : (
                  getInitials(seller.fullName)
                )}
              </div>
              <div className={styles.sellerCopy}>
                <strong>@{seller.username}</strong>
                <p>{seller.locationLabel}</p>
                <p>Member since {formatDate(seller.memberSince)}</p>
              </div>
            </div>
            <div className={styles.sellerStats}>
              <span>{seller.activeListings} active listing(s)</span>
              <span>{seller.totalSales} sold item(s)</span>
              <span>
                {seller.averageRating?.toFixed(1) ?? 'New'} rating from {seller.totalReviews} review(s)
              </span>
            </div>
          </article>

          <article className={styles.sideCard}>
            <p className={styles.sectionEyebrow}>Moderation Context</p>
            <h2>Current admin note</h2>
            <p className={styles.moderationSummary}>{getModerationSummary(detail)}</p>
            <div className={styles.reasonPanel}>
              <span className={styles.reasonLabel}>Latest reason sent to seller</span>
              <strong>{listing.moderationReason || 'No moderation reason was recorded yet.'}</strong>
              <p>
                {listing.moderationReasonUpdatedAt
                  ? `Sent ${formatDateTime(listing.moderationReasonUpdatedAt)}`
                  : 'No moderation timestamp found for this listing yet.'}
              </p>
            </div>
          </article>
        </aside>
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.contentCard}>
          <p className={styles.sectionEyebrow}>Listing Description</p>
          <h2>What the seller currently submitted</h2>
          {descriptionParagraphs.map((paragraph) => (
            <p key={paragraph} className={styles.bodyText}>
              {paragraph}
            </p>
          ))}
          {listing.brand?.trim() && (
            <div className={styles.inlineNote}>
              <span>Brand</span>
              <strong>{listing.brand}</strong>
            </div>
          )}
          {listing.soldTo && (
            <div className={styles.inlineNote}>
              <span>Buyer</span>
              <strong>{listing.soldTo.displayName}</strong>
            </div>
          )}
        </article>

        <article className={styles.contentCard}>
          <p className={styles.sectionEyebrow}>Marketplace Signals</p>
          <h2>Engagement and moderation risk</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <span>Views</span>
              <strong>{listing.viewsCount}</strong>
            </div>
            <div className={styles.signalItem}>
              <span>Favorites</span>
              <strong>{metrics.favoritesCount}</strong>
            </div>
            <div className={styles.signalItem}>
              <span>Offers</span>
              <strong>{metrics.offerCount}</strong>
            </div>
            <div className={styles.signalItem}>
              <span>Pending Offers</span>
              <strong>{metrics.pendingOfferCount}</strong>
            </div>
            <div className={styles.signalItem}>
              <span>Chats</span>
              <strong>{metrics.conversationCount}</strong>
            </div>
            <div className={styles.signalItem}>
              <span>Reports</span>
              <strong>{metrics.reportCount}</strong>
            </div>
            <div className={styles.signalItem}>
              <span>Open Reports</span>
              <strong>{metrics.openReportCount}</strong>
            </div>
            <div className={styles.signalItem}>
              <span>Pending Reports</span>
              <strong>{metrics.pendingReportCount}</strong>
            </div>
          </div>
        </article>

        <article className={styles.contentCard}>
          <p className={styles.sectionEyebrow}>Recent Reports</p>
          <h2>Complaint history for this listing</h2>
          {recentReports.length === 0 ? (
            <p className={styles.bodyText}>
              No reports have been filed against this listing so far.
            </p>
          ) : (
            <div className={styles.reportList}>
              {recentReports.map((report) => (
                <div key={report.id} className={styles.reportItem}>
                  <div className={styles.reportTop}>
                    <div className={styles.reportBadges}>
                      <span className={styles.reportReason}>{report.reasonLabel}</span>
                      <span className={`${styles.reportStatus} ${getReportTone(report.status)}`}>
                        {report.statusLabel}
                      </span>
                    </div>
                    <span className={styles.reportTime}>{formatDateTime(report.createdAt)}</span>
                  </div>
                  <strong className={styles.reportReporter}>
                    {report.reporter.fullName} (@{report.reporter.username})
                  </strong>
                  <p className={styles.reportMeta}>{report.reporter.locationLabel}</p>
                  <p className={styles.bodyText}>
                    {report.details?.trim() ||
                      'No extra notes were submitted with this report.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <ImageLightbox
        src={lightboxSrc}
        alt={detail?.listing.title}
        gallery={gallery}
        onClose={() => setLightboxSrc(null)}
        onNavigate={(index) => {
          setLightboxSrc(gallery[index] ?? null);
        }}
      />
    </div>
  );
}
