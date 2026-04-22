/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  ensureAdminModerationThread,
  getAdminReports,
  updateAdminListingStatus,
  updateAdminReportStatus,
} from '@/src/services/adminService';
import type {
  AdminReportListItem,
  AdminReportStatusFilter,
  AdminReportsResponse,
} from '@/src/types/admin';
import styles from './page.module.css';

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2 5 5v6c0 5 3.4 9.5 7 11 3.6-1.5 7-6 7-11V5l-7-3Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
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

function getInitials(value: string) {
  return value
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCurrency(value: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function buildPagination(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
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

function getReasonTone(reason: AdminReportListItem['reason']) {
  if (reason === 'scam' || reason === 'fake' || reason === 'prohibited_item') {
    return styles.reasonCritical;
  }

  if (reason === 'spam' || reason === 'duplicate' || reason === 'wrong_category') {
    return styles.reasonNotice;
  }

  return styles.reasonNeutral;
}

function parseStatusFilter(value: string | null): AdminReportStatusFilter {
  return value === 'pending' || value === 'reviewed' || value === 'resolved' || value === 'rejected'
    ? value
    : 'all';
}

export default function AdminReportsPage() {
  const router = useRouter();
  const { token } = useRequireAuth();
  const searchParams = useSearchParams();
  const deferredSearch = useDeferredValue(searchParams.get('q') ?? '');
  const requestedStatusFilter = parseStatusFilter(searchParams.get('status'));

  const [data, setData] = useState<AdminReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [busyListingAction, setBusyListingAction] = useState<
    'pause' | 'resume' | 'approve' | 'reject' | null
  >(null);
  const [messageSellerId, setMessageSellerId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getAdminReports(token, {
      page,
      pageSize: 6,
      search: deferredSearch,
      status: requestedStatusFilter,
    }).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.data) {
        setData(response.data);
        setError(null);

        if (response.data.pagination.page !== page) {
          setPage(response.data.pagination.page);
        }
      } else {
        setError(response.error || 'Failed to load reports');
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, page, refreshKey, requestedStatusFilter, token]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function buildListingDetailsHref(listingId: string) {
    const currentParams = searchParams.toString();
    const returnTo = `${ROUTES.ADMIN_REPORTS}${currentParams ? `?${currentParams}` : ''}`;

    return `${ROUTES.ADMIN_LISTINGS}/${listingId}?source=reports&returnTo=${encodeURIComponent(returnTo)}`;
  }

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

  async function handleReportAction(
    report: AdminReportListItem,
    action: 'review' | 'resolve' | 'dismiss'
  ) {
    if (!token) {
      return;
    }

    setBusyReportId(report.id);
    const response = await updateAdminReportStatus(token, report.id, action);
    setBusyReportId(null);

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
    report: AdminReportListItem,
    action: 'pause' | 'resume' | 'approve' | 'reject'
  ) {
    if (!token) {
      return;
    }

    const reason =
      action === 'pause' || action === 'reject'
        ? requestReason(action === 'pause' ? 'Pause' : 'Reject', report.listing.title)
        : undefined;

    if ((action === 'pause' || action === 'reject') && !reason) {
      return;
    }

    setBusyListingId(report.listing.id);
    setBusyListingAction(action);
    const response = await updateAdminListingStatus(
      token,
      report.listing.id,
      action,
      reason ?? undefined
    );
    setBusyListingId(null);
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

  async function handleMessageSeller(report: AdminReportListItem) {
    if (!token) {
      return;
    }

    setMessageSellerId(report.seller.id);
    const response = await ensureAdminModerationThread(token, report.seller.id);
    setMessageSellerId(null);

    if (!response.data) {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to prepare a moderation chat with the seller',
      });
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

  const pagination = buildPagination(page, data?.pagination.totalPages ?? 1);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Trust &amp; Safety</p>
          <h1 className={styles.title}>Reports Management</h1>
          <p className={styles.subtitle}>
            Review listing complaints from shoppers, move them through moderation, and pause public
            listings with a required reason or handle seller resubmissions before they return to browse.
          </p>
        </div>

        <div className={styles.heroActions}>
          <label className={styles.selectField}>
            <AlertIcon />
            <select
              value={requestedStatusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value as AdminReportStatusFilter;
                const nextParams = new URLSearchParams(searchParams.toString());
                setLoading(true);
                setPage(1);

                if (nextStatus === 'all') {
                  nextParams.delete('status');
                } else {
                  nextParams.set('status', nextStatus);
                }

                router.replace(
                  `${ROUTES.ADMIN_REPORTS}${nextParams.size ? `?${nextParams.toString()}` : ''}`
                );
              }}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="reviewed">In Review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Dismissed</option>
            </select>
          </label>

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
            <PauseIcon />
            <span>Open Listings</span>
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

      {data && (
        <section className={styles.statsGrid}>
          <article className={`${styles.statCard} ${styles.statCardInk}`}>
            <div className={styles.statIcon}>
              <AlertIcon />
            </div>
            <p className={styles.statLabel}>Total Reports</p>
            <h2 className={styles.statValue}>{data.stats.totalReports}</h2>
            <p className={styles.statDetail}>All marketplace complaints linked to user listings.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardPeach}`}>
            <div className={styles.statIcon}>
              <ShieldIcon />
            </div>
            <p className={styles.statLabel}>Pending Review</p>
            <h2 className={styles.statValue}>{data.stats.pendingReports}</h2>
            <p className={styles.statDetail}>Reports that still need their first admin decision.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardSoft}`}>
            <div className={styles.statIcon}>
              <ReviewIcon />
            </div>
            <p className={styles.statLabel}>In Review</p>
            <h2 className={styles.statValue}>{data.stats.inReviewReports}</h2>
            <p className={styles.statDetail}>Items actively being investigated by the admin team.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardMint}`}>
            <div className={styles.statIcon}>
              <PauseIcon />
            </div>
            <p className={styles.statLabel}>Paused Listings</p>
            <h2 className={styles.statValue}>{data.stats.pausedListings}</h2>
            <p className={styles.statDetail}>Reported listings already hidden from public browse.</p>
          </article>
        </section>
      )}

      <section className={styles.queue}>
        {loading ? (
          <div className={styles.emptyState}>Loading reports...</div>
        ) : error ? (
          <div className={styles.emptyState}>{error}</div>
        ) : !data || data.reports.length === 0 ? (
          <div className={styles.emptyState}>No reports matched the current search and filter.</div>
        ) : (
          data.reports.map((report) => {
            const reportBusy = busyReportId === report.id;
            const listingBusy = busyListingId === report.listing.id;
            const sellerBusy = messageSellerId === report.seller.id;
            const listingDetailsHref = buildListingDetailsHref(report.listing.id);

            return (
              <article key={report.id} className={styles.reportCard}>
                <div className={styles.reportHeader}>
                  <Link href={listingDetailsHref} className={styles.listingPreviewLink}>
                    <div className={styles.listingPreview}>
                      <div className={styles.media}>
                        {report.listing.coverImagePath ? (
                          <img
                            src={report.listing.coverImagePath}
                            alt={report.listing.title}
                          className={styles.mediaImage}
                        />
                      ) : (
                        getInitials(report.listing.title)
                      )}
                    </div>

                    <div className={styles.headerCopy}>
                      <div className={styles.badgeRow}>
                        <span className={`${styles.reasonBadge} ${getReasonTone(report.reason)}`}>
                          {report.reasonLabel}
                        </span>
                        <span className={`${styles.statusBadge} ${getStatusTone(report.status)}`}>
                          {report.statusLabel}
                        </span>
                      </div>

                      <h2 className={styles.listingTitle}>{report.listing.title}</h2>
                      <p className={styles.listingMeta}>
                        {formatCurrency(report.listing.price, report.listing.currency)} -{' '}
                        {report.listing.locationLabel} - Seller @{report.seller.username}
                      </p>
                      <span className={styles.previewLinkNote}>Open full details and photos</span>
                    </div>
                    </div>
                  </Link>

                  <div className={styles.reportTime}>
                    <span>Submitted</span>
                    <strong>{formatDate(report.createdAt)}</strong>
                  </div>
                </div>

                <div className={styles.detailsGrid}>
                  <div className={styles.detailCard}>
                    <span className={styles.detailLabel}>Reported By</span>
                    <div className={styles.personRow}>
                      <div className={styles.personAvatar}>
                        {report.reporter.avatarPath ? (
                          <img
                            src={report.reporter.avatarPath}
                            alt={report.reporter.fullName}
                            className={styles.mediaImage}
                          />
                        ) : (
                          getInitials(report.reporter.fullName)
                        )}
                      </div>
                      <div>
                        <strong>{report.reporter.fullName}</strong>
                        <p>
                          @{report.reporter.username} - {report.reporter.locationLabel}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={styles.detailCard}>
                    <span className={styles.detailLabel}>Listing State</span>
                    <strong>{report.listing.statusLabel}</strong>
                    <p>
                      {report.listing.hiddenFromBrowse
                        ? 'This listing is currently hidden from public browse.'
                        : 'This listing is still visible to shoppers and eligible for visibility controls.'}
                    </p>
                  </div>

                  <div className={styles.detailCard}>
                    <span className={styles.detailLabel}>Moderation Signal</span>
                    <strong>
                      {report.listing.openReportCount} open / {report.listing.totalReportCount} total report(s)
                    </strong>
                    <p>
                      {report.listing.latestOpenReasonLabel
                        ? `Latest open reason: ${report.listing.latestOpenReasonLabel}.`
                        : 'No open reports remain on this listing right now.'}
                    </p>
                  </div>
                </div>

                <div className={styles.notesCard}>
                  <span className={styles.detailLabel}>Reporter Notes</span>
                  <p>
                    {report.details?.trim() ||
                      'No extra notes were provided. The reason tag above is the only complaint on file.'}
                  </p>
                </div>

                <div className={styles.notesCard}>
                  <span className={styles.detailLabel}>Moderation Summary</span>
                  <p>{report.listing.moderationSummary}</p>
                </div>

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.reviewButton}
                    onClick={() => void handleReportAction(report, 'review')}
                    disabled={reportBusy}
                  >
                    {reportBusy && report.status !== 'reviewed' ? 'Saving...' : 'Mark Reviewing'}
                  </button>

                  <button
                    type="button"
                    className={styles.resolveButton}
                    onClick={() => void handleReportAction(report, 'resolve')}
                    disabled={reportBusy}
                  >
                    {reportBusy && report.status !== 'resolved' ? 'Saving...' : 'Resolve Report'}
                  </button>

                  <button
                    type="button"
                    className={styles.dismissButton}
                    onClick={() => void handleReportAction(report, 'dismiss')}
                    disabled={reportBusy}
                  >
                    {reportBusy && report.status !== 'rejected' ? 'Saving...' : 'Dismiss Report'}
                  </button>

                  {(report.listing.status === 'active' ||
                    report.listing.status === 'reserved' ||
                    report.listing.status === 'archived') && (
                    <button
                      type="button"
                      className={styles.pauseButton}
                      onClick={() => void handleListingModerationAction(
                        report,
                        report.listing.status === 'archived' ? 'resume' : 'pause'
                      )}
                      disabled={listingBusy}
                    >
                      {listingBusy
                        ? busyListingAction === 'resume'
                          ? 'Resuming...'
                          : 'Pausing...'
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
                        onClick={() => void handleListingModerationAction(report, 'approve')}
                        disabled={listingBusy}
                      >
                        {listingBusy && busyListingAction === 'approve'
                          ? 'Approving...'
                          : 'Approve Listing'}
                      </button>

                      <button
                        type="button"
                        className={styles.dismissButton}
                        onClick={() => void handleListingModerationAction(report, 'reject')}
                        disabled={listingBusy}
                      >
                        {listingBusy && busyListingAction === 'reject'
                          ? 'Rejecting...'
                          : 'Reject Again'}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => void handleMessageSeller(report)}
                    disabled={sellerBusy}
                  >
                    <MessageIcon />
                    <span>{sellerBusy ? 'Opening chat...' : 'Message Seller'}</span>
                  </button>

                  <Link
                    href={`${ROUTES.ADMIN_LISTINGS}?q=${encodeURIComponent(report.listing.title)}`}
                    className={styles.linkButton}
                  >
                    Open Listing Queue
                  </Link>
                </div>
              </article>
            );
          })
        )}

        {data && (
          <div className={styles.paginationBar}>
            <p>
              Showing page {data.pagination.page} of {data.pagination.totalPages} -{' '}
              {data.pagination.totalItems} matching report(s)
            </p>

            <div className={styles.paginationButtons}>
              <button
                type="button"
                className={styles.paginationButton}
                disabled={page <= 1}
                onClick={() => {
                  setLoading(true);
                  setPage((current) => Math.max(1, current - 1));
                }}
              >
                Prev
              </button>

              {pagination.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`${styles.paginationButton} ${
                    pageNumber === page ? styles.paginationButtonActive : ''
                  }`}
                  onClick={() => {
                    setLoading(true);
                    setPage(pageNumber);
                  }}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                className={styles.paginationButton}
                disabled={page >= (data.pagination.totalPages || 1)}
                onClick={() => {
                  setLoading(true);
                  setPage((current) => Math.min(data.pagination.totalPages, current + 1));
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
