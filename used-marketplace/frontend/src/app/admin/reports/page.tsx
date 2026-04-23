/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { ensureAdminModerationThread, getAdminReports } from '@/src/services/adminService';
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

function ArrowUpRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
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

function parseStatusFilter(value: string | null): AdminReportStatusFilter {
  return value === 'pending' || value === 'reviewed' || value === 'resolved' || value === 'rejected'
    ? value
    : 'all';
}

function parseInitialPage(value: string | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
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

function buildPreviewText(report: AdminReportListItem) {
  if (report.deliveryIssue?.buyerStatement) {
    return report.deliveryIssue.buyerStatement;
  }

  return report.details?.trim() || 'No extra notes were provided for this report.';
}

function truncateText(value: string, maxLength = 150) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

export default function AdminReportsPage() {
  const router = useRouter();
  const { token } = useRequireAuth();
  const searchParams = useSearchParams();
  const deferredSearch = useDeferredValue(searchParams.get('q') ?? '');
  const requestedStatusFilter = parseStatusFilter(searchParams.get('status'));
  const initialPage = parseInitialPage(searchParams.get('page'));

  const [data, setData] = useState<AdminReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(initialPage);
  const [refreshKey, setRefreshKey] = useState(0);
  const [messageSellerId, setMessageSellerId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    getAdminReports(token, {
      page,
      pageSize: 12,
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

  function buildReportDetailsHref(reportId: string) {
    const returnParams = new URLSearchParams(searchParams.toString());

    if (page > 1) {
      returnParams.set('page', String(page));
    } else {
      returnParams.delete('page');
    }

    const currentParams = returnParams.toString();
    const returnTo = `${ROUTES.ADMIN_REPORTS}${currentParams ? `?${currentParams}` : ''}`;

    return `${ROUTES.ADMIN_REPORTS}/${reportId}?returnTo=${encodeURIComponent(returnTo)}`;
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
            Scan large report queues in a card grid, then open the cases that need deeper admin
            action on their own detail page.
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

                const nextQuery = nextParams.toString();
                router.replace(`${ROUTES.ADMIN_REPORTS}${nextQuery ? `?${nextQuery}` : ''}`);
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
            <p className={styles.statDetail}>All marketplace complaints tied to listings and completed sales.</p>
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
            <p className={styles.statDetail}>Cases actively being investigated by the admin team.</p>
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
          <>
            <div className={styles.reportGrid}>
              {data.reports.map((report) => {
                const sellerBusy = messageSellerId === report.seller.id;
                const previewText = truncateText(buildPreviewText(report), 170);
                const reportDetailsHref = buildReportDetailsHref(report.id);

                return (
                  <article key={report.id} className={styles.reportCard}>
                    <Link href={reportDetailsHref} className={styles.cardLink}>
                      <div className={styles.mediaShell}>
                        {report.listing.coverImagePath ? (
                          <img
                            src={report.listing.coverImagePath}
                            alt={report.listing.title}
                            className={styles.mediaImage}
                          />
                        ) : (
                          <div className={styles.mediaFallback}>{getInitials(report.listing.title)}</div>
                        )}

                        <div className={styles.badgeRow}>
                          <span className={`${styles.reasonBadge} ${getReasonTone(report)}`}>
                            {report.reasonLabel}
                          </span>
                          <span className={`${styles.statusBadge} ${getStatusTone(report.status)}`}>
                            {report.statusLabel}
                          </span>
                        </div>
                      </div>

                      <div className={styles.cardBody}>
                        <div className={styles.cardTop}>
                          <div>
                            <h2 className={styles.listingTitle}>{report.listing.title}</h2>
                            <p className={styles.listingMeta}>
                              {formatCurrency(report.listing.price, report.listing.currency)} -{' '}
                              {report.listing.locationLabel}
                            </p>
                          </div>
                          <div className={styles.timePill}>
                            <span>Submitted</span>
                            <strong>{formatDate(report.createdAt)}</strong>
                          </div>
                        </div>

                        <div className={styles.metricRow}>
                          <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>Reporter</span>
                            <strong>@{report.reporter.username}</strong>
                          </div>
                          <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>Seller</span>
                            <strong>@{report.seller.username}</strong>
                          </div>
                          <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>Open Reports</span>
                            <strong>{report.listing.openReportCount}</strong>
                          </div>
                        </div>

                        {report.deliveryIssue ? (
                          <div className={`${styles.previewPanel} ${styles.previewDelivery}`}>
                            <strong>Buyer says</strong>
                            <p>{previewText}</p>
                          </div>
                        ) : (
                          <div className={styles.previewPanel}>
                            <strong>Reporter notes</strong>
                            <p>{previewText}</p>
                          </div>
                        )}

                        <div className={styles.cardFooter}>
                          <span className={styles.openHint}>Open full details</span>
                          <span className={styles.openArrow}>
                            <ArrowUpRightIcon />
                          </span>
                        </div>
                      </div>
                    </Link>

                    <div className={styles.cardQuickActions}>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => void handleMessageSeller(report)}
                        disabled={sellerBusy}
                      >
                        <MessageIcon />
                        <span>{sellerBusy ? 'Opening chat...' : 'Message seller'}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

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
          </>
        )}
      </section>
    </div>
  );
}
