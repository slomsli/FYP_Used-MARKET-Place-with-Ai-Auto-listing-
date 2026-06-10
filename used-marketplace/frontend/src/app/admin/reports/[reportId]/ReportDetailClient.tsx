/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import ReMarketVerifiedBadge from '@/src/components/identity/ReMarketVerifiedBadge';
import ImageLightbox from '@/src/components/ui/ImageLightbox';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  ensureAdminModerationThread,
  getAdminReportDetails,
  updateAdminListingStatus,
  updateAdminReportStatus,
} from '@/src/services/adminService';
import type { AdminReportListItem } from '@/src/types/admin';
import type { IdentityVerificationStatus } from '@/src/types/verification';
import styles from './page.module.css';

interface ReportDetailClientProps {
  reportId: string;
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

function ListingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 12h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  );
}

function ProofIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l2.92-2.91a5 5 0 0 0-7.07-7.08L11.7 5.2" />
      <path d="M14 11a5 5 0 0 0-7.54-.54L3.54 13.37a5 5 0 0 0 7.07 7.08l1.67-1.67" />
    </svg>
  );
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'RM';
}

function formatCurrency(value: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getSafeReturnTo(value: string | null) {
  if (value && value.startsWith('/admin/')) {
    return value;
  }

  return ROUTES.ADMIN_REPORTS;
}

function getStatusTone(status: AdminReportListItem['status']) {
  if (status === 'resolved') {
    return styles.statusResolved;
  }

  if (status === 'reviewed') {
    return styles.statusReviewing;
  }

  if (status === 'rejected') {
    return styles.statusDismissed;
  }

  return styles.statusPending;
}

function getReasonTone(report: AdminReportListItem) {
  if (report.reportType === 'delivery_issue') {
    return styles.reasonDelivery;
  }

  if (report.reason === 'scam' || report.reason === 'fake' || report.reason === 'prohibited_item') {
    return styles.reasonCritical;
  }

  if (report.reason === 'spam' || report.reason === 'duplicate' || report.reason === 'wrong_category') {
    return styles.reasonNotice;
  }

  return styles.reasonNeutral;
}

function getListingTone(status: string) {
  if (status === 'active' || status === 'reserved') {
    return styles.listingLive;
  }

  if (status === 'archived') {
    return styles.listingPaused;
  }

  if (status === 'rejected') {
    return styles.listingPending;
  }

  if (status === 'sold') {
    return styles.listingSold;
  }

  return styles.listingNeutral;
}

function getIdentityVerificationLabel(status: IdentityVerificationStatus) {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'pending':
      return 'Pending review';
    case 'rejected':
      return 'Rejected';
    case 'resubmission_required':
      return 'Needs resubmission';
    case 'unverified':
    default:
      return 'Unverified';
  }
}

function getIdentityVerificationTone(status: IdentityVerificationStatus) {
  switch (status) {
    case 'verified':
      return styles.identityVerified;
    case 'pending':
      return styles.identityPending;
    case 'rejected':
    case 'resubmission_required':
      return styles.identityAttention;
    case 'unverified':
    default:
      return styles.identityNeutral;
  }
}

function getReporterCopy(report: AdminReportListItem) {
  if (report.deliveryIssue?.buyerStatement) {
    return report.deliveryIssue.buyerStatement;
  }

  return report.details?.trim() || 'No extra notes were provided for this report.';
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildReportModerationTopic(report: AdminReportListItem) {
  const issueLabel = report.reportType === 'delivery_issue' ? 'Delivery dispute' : report.reasonLabel;
  const rawTopic = `Report ${report.id.slice(0, 8)}: ${issueLabel} - ${report.listing.title}`;

  return truncateText(rawTopic, 80);
}

function ReportPersonCard({
  label,
  person,
}: {
  label: string;
  person: AdminReportListItem['reporter'];
}) {
  return (
    <div className={styles.personCard}>
      <div className={styles.avatarShell}>
        {person.avatarPath ? (
          <img
            src={person.avatarPath}
            alt={person.fullName}
            className={styles.avatarImage}
          />
        ) : (
          getInitials(person.fullName)
        )}
      </div>
      <div className={styles.personContent}>
        <span className={styles.personLabel}>{label}</span>
        <div className={styles.personNameRow}>
          <strong>{person.fullName}</strong>
          {person.identityVerificationBadge && (
            <ReMarketVerifiedBadge compact className={styles.personVerifiedBadge} />
          )}
        </div>
        <p className={styles.personMeta}>
          @{person.username} - {person.locationLabel}
        </p>
        <div className={styles.identityRow}>
          <span
            className={`${styles.identityPill} ${getIdentityVerificationTone(
              person.identityVerificationStatus
            )}`}
          >
            ReMarket Stamp: {getIdentityVerificationLabel(person.identityVerificationStatus)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ReportDetailClient({ reportId }: ReportDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, loading: authLoading } = useRequireAuth();

  const [report, setReport] = useState<AdminReportListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyReportAction, setBusyReportAction] = useState<'review' | 'resolve' | 'dismiss' | null>(null);
  const [busyListingAction, setBusyListingAction] = useState<
    'pause' | 'resume' | 'approve' | 'reject' | null
  >(null);
  const [messagingSeller, setMessagingSeller] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }

      setLoading(true);
      setError(null);
      setReport(null);
    });

    getAdminReportDetails(token, reportId).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.data) {
        setReport(response.data.report);
      } else {
        setError(response.error || 'Unable to load this report');
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [reportId, refreshKey, token]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function requestReason(actionLabel: string, listingTitle: string) {
    const value = window.prompt(`${actionLabel} reason for "${listingTitle}"`, '');

    if (value === null) {
      return null;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setNotice({
        type: 'error',
        message: `A reason is required to ${actionLabel.toLowerCase()} "${listingTitle}".`,
      });
      return null;
    }

    return trimmedValue;
  }

  async function handleReportAction(action: 'review' | 'resolve' | 'dismiss') {
    if (!token || !report) {
      return;
    }

    setBusyReportAction(action);
    const response = await updateAdminReportStatus(token, report.id, action);
    setBusyReportAction(null);

    if (!response.data) {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to update report status',
      });
      return;
    }

    setNotice({
      type: 'success',
      message:
        action === 'review'
          ? `"${report.listing.title}" is now marked as in review.`
          : action === 'resolve'
            ? `Report for "${report.listing.title}" was resolved.`
            : `Report for "${report.listing.title}" was dismissed.`,
    });
    setRefreshKey((value) => value + 1);
  }

  async function handleListingModerationAction(
    action: 'pause' | 'resume' | 'approve' | 'reject'
  ) {
    if (!token || !report) {
      return;
    }

    const reason =
      action === 'pause' || action === 'reject'
        ? requestReason(action === 'pause' ? 'Pause' : 'Reject', report.listing.title)
        : undefined;

    if ((action === 'pause' || action === 'reject') && !reason) {
      return;
    }

    setBusyListingAction(action);
    const response = await updateAdminListingStatus(
      token,
      report.listing.id,
      action,
      reason ?? undefined
    );
    setBusyListingAction(null);

    if (!response.data) {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to update listing visibility',
      });
      return;
    }

    setNotice({
      type: 'success',
      message: action === 'pause'
        ? `"${report.listing.title}" is now paused and hidden from browse.`
        : action === 'resume'
          ? `"${report.listing.title}" is live again on browse.`
          : action === 'approve'
            ? `"${report.listing.title}" was approved and is visible in browse again.`
            : `"${report.listing.title}" was rejected and moved back to the paused queue.`,
    });
    setRefreshKey((value) => value + 1);
  }

  async function handleMessageSeller() {
    if (!token || !report) {
      return;
    }

    setMessagingSeller(true);
    const response = await ensureAdminModerationThread(token, report.seller.id, {
      topic: buildReportModerationTopic(report),
    });
    setMessagingSeller(false);

    if (!response.data) {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to prepare a moderation chat with the seller',
      });
      return;
    }

    if (response.data.conversationId) {
      router.push(`${ROUTES.ADMIN_MESSAGES}?conversationId=${encodeURIComponent(response.data.conversationId)}`);
      return;
    }

    const params = new URLSearchParams({
      listingId: response.data.listingId,
      listingTitle: response.data.listingTitle,
      recipientId: response.data.recipientId,
      recipientName: response.data.recipientName,
      topicType: response.data.topicType,
    });

    router.push(`${ROUTES.ADMIN_MESSAGES}?${params.toString()}`);
  }

  const returnTo = getSafeReturnTo(searchParams.get('returnTo'));
  const currentSearch = searchParams.toString();
  const currentReportHref = `${ROUTES.ADMIN_REPORTS}/${reportId}${currentSearch ? `?${currentSearch}` : ''}`;

  if (authLoading || loading) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <Link href={returnTo} className={styles.backLink}>
              <ArrowLeftIcon />
              <span>Back to Reports</span>
            </Link>
            <p className={styles.eyebrow}>Report Detail</p>
            <h1 className={styles.title}>Loading report detail...</h1>
            <p className={styles.subtitle}>
              We&apos;re loading the complaint, listing context, and moderation actions for this case.
            </p>
          </div>
        </section>

        <section className={styles.stateCard}>
          <h2>Preparing the case file</h2>
          <p>Review data is on the way.</p>
        </section>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <Link href={returnTo} className={styles.backLink}>
              <ArrowLeftIcon />
              <span>Back to Reports</span>
            </Link>
            <p className={styles.eyebrow}>Report Detail</p>
            <h1 className={styles.title}>We couldn&apos;t open this report.</h1>
            <p className={styles.subtitle}>
              The report may have been removed or is no longer available in the moderation queue.
            </p>
          </div>
        </section>

        <section className={styles.stateCard}>
          <h2>Detail view unavailable</h2>
          <p>{error || 'This report is no longer available to review.'}</p>
        </section>
      </div>
    );
  }

  const listingDetailsHref =
    `${ROUTES.ADMIN_LISTINGS}/${report.listing.id}?source=reports&returnTo=${encodeURIComponent(currentReportHref)}`;
  const sellerAccountHref = `${ROUTES.ADMIN_USERS}?q=${encodeURIComponent(report.seller.username)}`;
  const reportNarrative = getReporterCopy(report);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link href={returnTo} className={styles.backLink}>
            <ArrowLeftIcon />
            <span>Back to Reports</span>
          </Link>

          <p className={styles.eyebrow}>Report Detail</p>
          <h1 className={styles.title}>{report.listing.title}</h1>
          <p className={styles.subtitle}>
            Review the case context, inspect the listing and seller, then decide whether to keep the
            report open, resolve it, or take listing action.
          </p>

          <div className={styles.badgeRow}>
            <span className={`${styles.reasonBadge} ${getReasonTone(report)}`}>
              {report.reasonLabel}
            </span>
            <span className={`${styles.statusBadge} ${getStatusTone(report.status)}`}>
              {report.statusLabel}
            </span>
            <span className={`${styles.listingBadge} ${getListingTone(report.listing.status)}`}>
              {report.listing.statusLabel}
            </span>
          </div>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleMessageSeller()}
            disabled={messagingSeller}
          >
            <MessageIcon />
            <span>{messagingSeller ? 'Opening chat...' : 'Message Seller'}</span>
          </button>

          <Link href={listingDetailsHref} className={styles.secondaryButton}>
            <ListingIcon />
            <span>Open Listing</span>
          </Link>

          <Link href={sellerAccountHref} className={styles.secondaryButton}>
            <UserIcon />
            <span>Seller Account</span>
          </Link>
        </div>
      </section>

      {notice && (
        <div
          className={`${styles.noticeBanner} ${
            notice.type === 'success' ? styles.noticeBannerSuccess : styles.noticeBannerError
          }`}
        >
          {notice.message}
        </div>
      )}

      <section className={styles.mainGrid}>
        <div className={styles.leftColumn}>
          <article className={styles.mediaCard}>
            <div className={styles.mediaShell}>
              {report.listing.coverImagePath ? (
                <button
                  type="button"
                  className={styles.mediaButton}
                  onClick={() => setLightboxSrc(report.listing.coverImagePath)}
                  title="Click to enlarge"
                >
                  <img
                    src={report.listing.coverImagePath}
                    alt={report.listing.title}
                    className={styles.mediaImage}
                  />
                </button>
              ) : (
                <div className={styles.mediaFallback}>{getInitials(report.listing.title)}</div>
              )}
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Price</span>
                <strong>{formatCurrency(report.listing.price, report.listing.currency)}</strong>
              </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Location</span>
                <strong>{report.listing.locationLabel}</strong>
              </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Submitted</span>
                <strong>{formatDateTime(report.createdAt)}</strong>
              </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Updated</span>
                <strong>{formatDateTime(report.updatedAt)}</strong>
              </div>
            </div>
          </article>

          <section className={styles.contentGrid}>
            <article className={styles.contentCard}>
              <p className={styles.sectionEyebrow}>
                {report.deliveryIssue ? 'Delivery Dispute' : 'Reporter Notes'}
              </p>
              <h2>{report.deliveryIssue ? 'Buyer statement and proof' : 'Submitted complaint details'}</h2>
              <p className={styles.bodyCopy}>{reportNarrative}</p>

              {report.deliveryIssue && (
                <>
                  <div className={styles.tokenRow}>
                    {report.deliveryIssue.agreedPriceLabel && (
                      <span className={styles.token}>{report.deliveryIssue.agreedPriceLabel}</span>
                    )}
                    {report.deliveryIssue.paymentReference && (
                      <span className={styles.token}>
                        Payment ref: {report.deliveryIssue.paymentReference}
                      </span>
                    )}
                    <span className={styles.token}>
                      {report.deliveryIssue.proofUrls.length} proof file(s)
                    </span>
                  </div>

                  {report.deliveryIssue.proofUrls.length > 0 ? (
                    <div className={styles.proofGrid}>
                      {report.deliveryIssue.proofUrls.map((proofUrl, index) => (
                        <a
                          key={proofUrl}
                          href={proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.proofLink}
                        >
                          <ProofIcon />
                          <span>Open proof {index + 1}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.bodyCopy}>No proof files were attached to this delivery report.</p>
                  )}
                </>
              )}
            </article>

            <article className={styles.contentCard}>
              <p className={styles.sectionEyebrow}>Report Actions</p>
              <h2>Move the case through moderation</h2>
              <div className={styles.actionGroup}>
                <button
                  type="button"
                  className={styles.reviewButton}
                  onClick={() => void handleReportAction('review')}
                  disabled={busyReportAction !== null}
                >
                  {busyReportAction === 'review' ? 'Saving...' : 'Mark Reviewing'}
                </button>

                <button
                  type="button"
                  className={styles.resolveButton}
                  onClick={() => void handleReportAction('resolve')}
                  disabled={busyReportAction !== null}
                >
                  {busyReportAction === 'resolve' ? 'Saving...' : 'Resolve Report'}
                </button>

                <button
                  type="button"
                  className={styles.dismissButton}
                  onClick={() => void handleReportAction('dismiss')}
                  disabled={busyReportAction !== null}
                >
                  {busyReportAction === 'dismiss' ? 'Saving...' : 'Dismiss Report'}
                </button>
              </div>
            </article>

            <article className={styles.contentCard}>
              <p className={styles.sectionEyebrow}>Listing Actions</p>
              <h2>Control the seller listing</h2>
              <div className={styles.actionGroup}>
                {(report.listing.status === 'active' ||
                  report.listing.status === 'reserved' ||
                  report.listing.status === 'archived') && (
                  <button
                    type="button"
                    className={styles.pauseButton}
                    onClick={() => void handleListingModerationAction(
                      report.listing.status === 'archived' ? 'resume' : 'pause'
                    )}
                    disabled={busyListingAction !== null}
                  >
                    {busyListingAction === 'resume'
                      ? 'Resuming...'
                      : busyListingAction === 'pause'
                        ? 'Pausing...'
                        : report.listing.status === 'archived'
                          ? 'Resume Listing'
                          : 'Pause Listing'}
                  </button>
                )}

                {report.listing.status === 'rejected' && (
                  <>
                    <button
                      type="button"
                      className={styles.resolveButton}
                      onClick={() => void handleListingModerationAction('approve')}
                      disabled={busyListingAction !== null}
                    >
                      {busyListingAction === 'approve' ? 'Approving...' : 'Approve Listing'}
                    </button>

                    <button
                      type="button"
                      className={styles.dismissButton}
                      onClick={() => void handleListingModerationAction('reject')}
                      disabled={busyListingAction !== null}
                    >
                      {busyListingAction === 'reject' ? 'Rejecting...' : 'Reject Again'}
                    </button>
                  </>
                )}
              </div>
              <p className={styles.bodyCopy}>
                Use listing controls when the problem requires the item to be hidden, resumed, or pushed
                back into the approval queue.
              </p>
            </article>
          </section>
        </div>

        <aside className={styles.sidebar}>
          <article className={styles.sideCard}>
            <p className={styles.sectionEyebrow}>Case Snapshot</p>
            <h2>Queue position</h2>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Report ID</span>
                <strong>{report.id}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Open Reports</span>
                <strong>{report.listing.openReportCount}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Total Reports</span>
                <strong>{report.listing.totalReportCount}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Visibility</span>
                <strong>{report.listing.hiddenFromBrowse ? 'Hidden from browse' : 'Visible on browse'}</strong>
              </div>
            </div>
          </article>

          <article className={styles.sideCard}>
            <p className={styles.sectionEyebrow}>People</p>
            <h2>Reporter and seller</h2>
            <div className={styles.peopleList}>
              <ReportPersonCard label="Reporter" person={report.reporter} />
              <ReportPersonCard label="Seller" person={report.seller} />
            </div>
          </article>

          <article className={styles.sideCard}>
            <p className={styles.sectionEyebrow}>Moderation Summary</p>
            <h2>Current signal</h2>
            <p className={styles.bodyCopy}>{report.listing.moderationSummary}</p>
            {report.listing.latestOpenReasonLabel && (
              <div className={styles.inlineNote}>
                <span className={styles.summaryLabel}>Latest open reason</span>
                <strong>{report.listing.latestOpenReasonLabel}</strong>
              </div>
            )}
          </article>
        </aside>
      </section>

      <ImageLightbox
        src={lightboxSrc}
        alt={report.listing.title}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}
