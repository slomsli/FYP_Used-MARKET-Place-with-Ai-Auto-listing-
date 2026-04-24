'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  deleteAdminListing,
  getAdminListings,
  updateAdminListingStatus,
} from '@/src/services/adminService';
import type {
  AdminListingListItem,
  AdminListingsResponse,
  AdminListingStatusFilter,
} from '@/src/types/admin';
import styles from './page.module.css';

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
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

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
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

function ListingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
      <path d="M8 5v14" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
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
    day: '2-digit',
    year: 'numeric',
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

function getStatusTone(listing: AdminListingListItem) {
  if (listing.isFlagged) {
    return styles.statusFlagged;
  }

  if (listing.status === 'rejected') {
    return styles.statusFlagged;
  }

  if (listing.status === 'active') {
    return styles.statusActive;
  }

  if (listing.status === 'sold') {
    return styles.statusSold;
  }

  return styles.statusNeutral;
}

export default function AdminListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useRequireAuth();
  const deferredSearch = useDeferredValue(searchParams.get('q') ?? '');

  const [data, setData] = useState<AdminListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<AdminListingStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [stateFilter, setStateFilter] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [messageListingId, setMessageListingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [statusUpdatingAction, setStatusUpdatingAction] = useState<
    'pause' | 'resume' | 'approve' | 'reject' | null
  >(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getAdminListings(token, {
      page,
      pageSize: 8,
      search: deferredSearch,
      status: statusFilter,
      categoryId: categoryFilter,
      stateId: stateFilter,
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
        setError(response.error || 'Failed to load listings');
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [categoryFilter, deferredSearch, page, refreshKey, stateFilter, statusFilter, token]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const pagination = useMemo(
    () => buildPagination(page, data?.pagination.totalPages ?? 1),
    [data?.pagination.totalPages, page]
  );

  function buildListingDetailsHref(listingId: string) {
    const currentParams = searchParams.toString();
    const returnTo = `${ROUTES.ADMIN_LISTINGS}${currentParams ? `?${currentParams}` : ''}`;

    return `${ROUTES.ADMIN_LISTINGS}/${listingId}?source=listings&returnTo=${encodeURIComponent(returnTo)}`;
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

  async function handleMessageSeller(listing: AdminListingListItem) {
    if (!user || !token) {
      return;
    }

    if (listing.seller.id === user.id) {
      setNotice({
        type: 'error',
        message: 'This listing belongs to your own account, so seller outreach is not available here.',
      });
      return;
    }

    setMessageListingId(listing.id);

    const params = new URLSearchParams({
      listingId: listing.id,
      listingTitle: listing.title,
      recipientId: listing.seller.id,
      recipientName: listing.seller.fullName,
    });

    router.push(`${ROUTES.ADMIN_MESSAGES}?${params.toString()}`);
  }

  async function handleDeleteListing(listing: AdminListingListItem) {
    if (!token) {
      return;
    }

    const reason = requestReason('Delete', listing.title);
    if (!reason) {
      return;
    }

    const confirmed = window.confirm(
      `Remove "${listing.title}" by ${listing.seller.fullName} from the marketplace? The listing will be hidden, pending offers will be closed, and history will be preserved for audit and support.`
    );

    if (!confirmed) {
      return;
    }

    const typedConfirmation = window.prompt(
      `Type DELETE to remove "${listing.title}" from the marketplace while preserving its related history.`
    );

    if (typedConfirmation !== 'DELETE') {
      setNotice({
        type: 'error',
        message: 'Listing deletion was cancelled because DELETE was not entered exactly.',
      });
      return;
    }

    setDeletingId(listing.id);
    const response = await deleteAdminListing(token, listing.id, reason);
    setDeletingId(null);

    if (!response.data) {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to delete listing',
      });
      return;
    }

    setNotice({
      type: 'success',
      message: `"${listing.title}" was removed from marketplace view. Preserved ${response.data.deletedRecords.conversations} conversation(s), ${response.data.deletedRecords.offers} offer record(s), and ${response.data.deletedRecords.reports} report(s).`,
    });
    setRefreshKey((value) => value + 1);
  }

  async function handleListingAction(
    listing: AdminListingListItem,
    action: 'pause' | 'resume' | 'approve' | 'reject'
  ) {
    if (!token) {
      return;
    }

    const reason =
      action === 'pause' || action === 'reject'
        ? requestReason(action === 'pause' ? 'Pause' : 'Reject', listing.title)
        : undefined;

    if ((action === 'pause' || action === 'reject') && !reason) {
      return;
    }

    setStatusUpdatingId(listing.id);
    setStatusUpdatingAction(action);
    const response = await updateAdminListingStatus(
      token,
      listing.id,
      action,
      reason ?? undefined
    );
    setStatusUpdatingId(null);
    setStatusUpdatingAction(null);

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
        ? `"${listing.title}" is now paused and hidden from the public browse page.`
        : action === 'resume'
          ? `"${listing.title}" is live again and visible in public browse.`
          : action === 'approve'
            ? `"${listing.title}" was approved and is visible in public browse again.`
            : `"${listing.title}" was rejected and moved back to the paused queue.`,
    });
    setRefreshKey((value) => value + 1);
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Moderation Workspace</p>
          <h1 className={styles.title}>Listings Management</h1>
          <p className={styles.subtitle}>
            Review live marketplace inventory, contact the seller when something needs clarification,
            pause items with a required reason, and approve or reject seller resubmissions before
            they return to public browse.
          </p>
        </div>

        <div className={styles.heroActions}>
          <label className={styles.selectField}>
            <FilterIcon />
            <select
              value={statusFilter}
              onChange={(event) => {
                setLoading(true);
                setPage(1);
                setStatusFilter(event.target.value as AdminListingStatusFilter);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="reported">Reported</option>
              <option value="draft">Draft</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
              <option value="archived">Paused</option>
              <option value="rejected">Pending Review</option>
            </select>
          </label>

          <label className={styles.selectField}>
            <FilterIcon />
            <select
              value={categoryFilter ? String(categoryFilter) : 'all'}
              onChange={(event) => {
                setLoading(true);
                setPage(1);
                setCategoryFilter(event.target.value === 'all' ? null : Number(event.target.value));
              }}
            >
              <option value="all">All Categories</option>
              {(data?.lookups.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.selectField}>
            <FilterIcon />
            <select
              value={stateFilter ? String(stateFilter) : 'all'}
              onChange={(event) => {
                setLoading(true);
                setPage(1);
                setStateFilter(event.target.value === 'all' ? null : Number(event.target.value));
              }}
            >
              <option value="all">All Regions</option>
              {(data?.lookups.states ?? []).map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
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
          <article className={`${styles.statCard} ${styles.statCardDark}`}>
            <div className={styles.statIcon}>
              <ListingIcon />
            </div>
            <p className={styles.statLabel}>Managed Inventory</p>
            <h2 className={styles.statValue}>{data.stats.totalListings}</h2>
            <p className={styles.statDetail}>User-owned listings currently visible in admin moderation.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardSoft}`}>
            <div className={styles.statIcon}>
              <SignalIcon />
            </div>
            <p className={styles.statLabel}>Live Listings</p>
            <h2 className={styles.statValue}>{data.stats.activeListings}</h2>
            <p className={styles.statDetail}>Items still shown to shoppers right now.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardPeach}`}>
            <div className={styles.statIcon}>
              <AlertIcon />
            </div>
            <p className={styles.statLabel}>Flagged Listings</p>
            <h2 className={styles.statValue}>{data.stats.flaggedListings}</h2>
            <p className={styles.statDetail}>Listings with at least one pending report needing human review.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardMint}`}>
            <div className={styles.statIcon}>
              <MessageIcon />
            </div>
            <p className={styles.statLabel}>Pending Reports</p>
            <h2 className={styles.statValue}>{data.stats.pendingReports}</h2>
            <p className={styles.statDetail}>Open report records still attached to marketplace listings.</p>
          </article>
        </section>
      )}

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span>Listing</span>
          <span>Seller</span>
          <span>Signals</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading listings...</div>
        ) : error ? (
          <div className={styles.emptyState}>{error}</div>
        ) : !data || data.listings.length === 0 ? (
          <div className={styles.emptyState}>No listings matched the current search and filters.</div>
        ) : (
          data.listings.map((listing) => {
            const rowBusy =
              deletingId === listing.id ||
              messageListingId === listing.id ||
              statusUpdatingId === listing.id;
            const listingDetailsHref = buildListingDetailsHref(listing.id);

            return (
              <article key={listing.id} className={styles.listingRow}>
                <div className={styles.listingCell}>
                  <Link href={listingDetailsHref} className={styles.listingLink}>
                    <div className={styles.media}>
                      {listing.coverImagePath ? (
                        <img src={listing.coverImagePath} alt={listing.title} className={styles.mediaImage} />
                      ) : (
                        getInitials(listing.title)
                      )}
                    </div>

                    <div className={styles.listingCopy}>
                      <h2 className={styles.listingTitle}>{listing.title}</h2>
                      <p className={styles.listingMeta}>
                      {listing.categoryName || 'Uncategorized'} • {listing.locationLabel}
                      </p>
                      <div className={styles.listingHighlights}>
                        <span>{formatCurrency(listing.price, listing.currency)}</span>
                        <span>Updated {formatDate(listing.updatedAt)}</span>
                      </div>
                      <span className={styles.detailLink}>Open full details and photos</span>
                    </div>
                  </Link>
                </div>

                <div className={styles.sellerCell}>
                  <div className={styles.sellerAvatar}>
                    {listing.seller.avatarPath ? (
                      <img src={listing.seller.avatarPath} alt={listing.seller.fullName} className={styles.mediaImage} />
                    ) : (
                      getInitials(listing.seller.fullName)
                    )}
                  </div>
                  <div>
                    <strong className={styles.sellerName}>{listing.seller.fullName}</strong>
                    <p className={styles.sellerMeta}>@{listing.seller.username}</p>
                    <p className={styles.sellerMeta}>{listing.seller.locationLabel}</p>
                  </div>
                </div>

                <div className={styles.signalCell}>
                  <div className={styles.signalGrid}>
                    <div>
                      <span>Views</span>
                      <strong>{listing.viewsCount}</strong>
                    </div>
                    <div>
                      <span>Offers</span>
                      <strong>{listing.offerCount}</strong>
                    </div>
                    <div>
                      <span>Chats</span>
                      <strong>{listing.conversationCount}</strong>
                    </div>
                    <div>
                      <span>Reports</span>
                      <strong>{listing.reportCount}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.statusCell}>
                  <span className={`${styles.statusPill} ${getStatusTone(listing)}`}>
                    {listing.isFlagged ? 'Flagged' : listing.statusLabel}
                  </span>
                  <p className={styles.statusNote}>
                    {listing.pendingReportCount > 0
                      ? `${listing.pendingReportCount} pending report(s)`
                      : listing.status === 'rejected'
                        ? 'Seller updated this listing and it is waiting for admin review'
                      : listing.status === 'archived'
                        ? 'Paused by admin and hidden from public browse'
                      : `Created ${formatDate(listing.createdAt)}`}
                  </p>
                </div>

                <div className={styles.actionCell}>
                  <button
                    type="button"
                    className={styles.messageButton}
                    onClick={() => void handleMessageSeller(listing)}
                    disabled={rowBusy}
                  >
                    <MessageIcon />
                      <span>{messageListingId === listing.id ? 'Opening...' : 'Message Seller'}</span>
                    </button>

                  {(listing.status === 'active' || listing.status === 'reserved' || listing.status === 'archived') && (
                    <button
                      type="button"
                      className={styles.pauseButton}
                      onClick={() => void handleListingAction(
                        listing,
                        listing.status === 'archived' ? 'resume' : 'pause'
                      )}
                      disabled={rowBusy}
                    >
                      <span>
                        {statusUpdatingId === listing.id
                          ? statusUpdatingAction === 'resume'
                            ? 'Resuming...'
                            : 'Pausing...'
                          : listing.status === 'archived'
                            ? 'Resume Listing'
                            : 'Pause Listing'}
                      </span>
                    </button>
                  )}

                  {listing.status === 'rejected' && (
                    <>
                      <button
                        type="button"
                        className={styles.pauseButton}
                        onClick={() => void handleListingAction(listing, 'approve')}
                        disabled={rowBusy}
                      >
                        <span>
                          {statusUpdatingId === listing.id && statusUpdatingAction === 'approve'
                            ? 'Approving...'
                            : 'Approve Listing'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => void handleListingAction(listing, 'reject')}
                        disabled={rowBusy}
                      >
                        <span>
                          {statusUpdatingId === listing.id && statusUpdatingAction === 'reject'
                            ? 'Rejecting...'
                            : 'Reject Again'}
                        </span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => void handleDeleteListing(listing)}
                    disabled={rowBusy}
                  >
                    <DeleteIcon />
                    <span>{deletingId === listing.id ? 'Deleting...' : 'Delete Listing'}</span>
                  </button>
                </div>
              </article>
            );
          })
        )}

        {data && (
          <div className={styles.paginationBar}>
            <p>
              Showing page {data.pagination.page} of {data.pagination.totalPages} •{' '}
              {data.pagination.totalItems} matching listing(s)
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

      <section className={styles.insightGrid}>
        <article className={styles.insightCard}>
          <p className={styles.insightEyebrow}>Seller Outreach</p>
          <h3>Use conversation before enforcement when context is missing.</h3>
          <p>
            Message the seller for clarifications, missing proof, or location/category corrections
            before you remove a listing. The conversation opens inside the normal inbox flow so the
            record stays easy to follow.
          </p>
        </article>

        <article className={`${styles.insightCard} ${styles.insightCardWarning}`}>
          <p className={styles.insightEyebrow}>Deletion Scope</p>
          <h3>Policy deletion removes more than the card itself.</h3>
          <p>
            Admin deletion also clears the listing&apos;s offers, reports, chats, message history, and
            attached marketplace records to keep the data model clean after enforcement.
          </p>
        </article>
      </section>
    </div>
  );
}
