/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
'use client';

import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  createAdminUser,
  ensureAdminModerationThread,
  getAdminUserDetails,
  getAdminUsers,
  updateAdminUserStatus,
} from '@/src/services/adminService';
import {
  getAreasByState,
  getStates,
  type AreaLookup,
  type StateLookup,
} from '@/src/services/profileService';
import type {
  AdminUserDetailResponse,
  AdminUserListItem,
  AdminUsersResponse,
  AdminUserStatus,
} from '@/src/types/admin';
import styles from './page.module.css';

const EMPTY_FORM = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  stateId: '',
  areaId: '',
};

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function PlusUserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 19a4 4 0 0 0-8 0" />
      <circle cx="11" cy="8" r="4" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
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

function SuspendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 8.5l7 7" />
    </svg>
  );
}

function ActivateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function ListingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h18" />
      <path d="M7 3v18" />
      <path d="M3 17h18" />
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

function formatJoinDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'No recent activity';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
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

function getStatusLabel(status: AdminUserStatus) {
  if (status === 'pending_verification') {
    return 'Pending Verification';
  }

  if (status === 'suspended') {
    return 'Suspended';
  }

  return 'Active';
}

function buildPagination(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
}

function canChangeStatus(target: AdminUserListItem, currentUserId?: string) {
  return target.role !== 'admin' && target.id !== currentUserId;
}

function canMessageUser(target: AdminUserListItem, currentUserId?: string) {
  return target.id !== currentUserId;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, token } = useRequireAuth();
  const searchParams = useSearchParams();
  const deferredSearch = useDeferredValue(searchParams.get('q') ?? '');

  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending_verification' | 'suspended'>('all');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [states, setStates] = useState<StateLookup[]>([]);
  const [areas, setAreas] = useState<AreaLookup[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [details, setDetails] = useState<AdminUserDetailResponse | null>(null);
  const [detailsUserId, setDetailsUserId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [statusUserId, setStatusUserId] = useState<string | null>(null);
  const [messageUserId, setMessageUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    getAdminUsers(token, {
      page,
      pageSize: 8,
      search: deferredSearch,
      role: roleFilter,
      status: statusFilter,
    }).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.data) {
        setData(response.data);
        if (response.data.pagination.page !== page) {
          setPage(response.data.pagination.page);
        }
        setError(null);
      } else {
        setError(response.error || 'Failed to load users');
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, page, refreshKey, roleFilter, statusFilter, token]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, roleFilter, statusFilter]);

  useEffect(() => {
    if (!showCreateModal || !token || states.length > 0) {
      return;
    }

    getStates(token).then((response) => {
      if (response.data) {
        setStates(response.data);
      }
    });
  }, [showCreateModal, states.length, token]);

  useEffect(() => {
    if (!showCreateModal || !token || !form.stateId) {
      return;
    }

    getAreasByState(token, Number(form.stateId)).then((response) => {
      setAreas(response.data ?? []);
    });
  }, [form.stateId, showCreateModal, token]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const pagination = useMemo(
    () => buildPagination(page, data?.pagination.totalPages ?? 1),
    [data?.pagination.totalPages, page]
  );

  async function fetchDetails(userId: string) {
    if (!token) {
      return;
    }

    setDetailsUserId(userId);
    setDetailsLoading(true);
    setDetailsError(null);

    const response = await getAdminUserDetails(token, userId);

    if (response.data) {
      setDetails(response.data);
    } else {
      setDetails(null);
      setDetailsError(response.error || 'Failed to load user details');
    }

    setDetailsLoading(false);
  }

  function openManualEntry() {
    setShowCreateModal(true);
    setForm(EMPTY_FORM);
    setAreas([]);
    setFormError(null);
    setFormSuccess(null);
  }

  function openDetails(userId: string) {
    setShowDetailsModal(true);
    void fetchDetails(userId);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    const response = await createAdminUser(token, {
      fullName: form.fullName,
      username: form.username,
      email: form.email,
      password: form.password,
      stateId: form.stateId ? Number(form.stateId) : null,
      areaId: form.areaId ? Number(form.areaId) : null,
    });

    setSubmitting(false);

    if (!response.data) {
      setFormError(response.error || 'Failed to create user');
      return;
    }

    setFormSuccess(`Created ${response.data.fullName} as role user.`);
    setForm(EMPTY_FORM);
    setAreas([]);
    setRefreshKey((value) => value + 1);
  }

  async function handleStatusToggle(target: AdminUserListItem) {
    if (!token) {
      return;
    }

    if (!canChangeStatus(target, user?.id)) {
      setNotice({
        type: 'error',
        message: 'This account cannot be suspended or reactivated from this screen.',
      });
      return;
    }

    const action = target.status === 'suspended' ? 'activate' : 'suspend';
    const confirmed = window.confirm(
      action === 'suspend'
        ? `Suspend ${target.fullName}? They will still be able to browse, but they will not be able to post listings, send offers, or start normal marketplace messages until reactivated.`
        : `Reactivate ${target.fullName}? Their marketplace actions will be available again.`
    );

    if (!confirmed) {
      return;
    }

    setStatusUserId(target.id);

    const response = await updateAdminUserStatus(token, target.id, action);
    setStatusUserId(null);

    if (!response.data) {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to update account status',
      });
      return;
    }

    setNotice({
      type: 'success',
      message:
        action === 'suspend'
          ? `${target.fullName} has been suspended from new marketplace actions.`
          : `${target.fullName} is active again.`,
    });
    setRefreshKey((value) => value + 1);

    if (showDetailsModal && detailsUserId === target.id) {
      void fetchDetails(target.id);
    }
  }

  async function handleMessageUser(target: AdminUserListItem) {
    if (!token) {
      return;
    }

    if (!canMessageUser(target, user?.id)) {
      setNotice({
        type: 'error',
        message: 'You cannot open a moderation thread with your own account.',
      });
      return;
    }

    setMessageUserId(target.id);
    const response = await ensureAdminModerationThread(token, target.id);
    setMessageUserId(null);

    if (!response.data) {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to prepare the moderation conversation.',
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

    router.push(`${ROUTES.MESSAGES}?${params.toString()}`);
  }

  const detailTarget = details?.user ?? null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Management</p>
          <h1 className={styles.title}>Registered Users</h1>
          <p className={styles.subtitle}>
            Review marketplace accounts, inspect their listings and photos, suspend transaction access,
            and start a moderation conversation in the normal inbox flow.
          </p>
        </div>

        <div className={styles.heroActions}>
          <label className={styles.selectField}>
            <FilterIcon />
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | 'user' | 'admin')}>
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label className={styles.selectField}>
            <FilterIcon />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | 'active' | 'pending_verification' | 'suspended')
              }
            >
              <option value="all">Status</option>
              <option value="active">Active</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>

          <button type="button" className={styles.primaryButton} onClick={openManualEntry}>
            <PlusUserIcon />
            <span>Manual Entry</span>
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

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span>User Identity</span>
          <span>Role</span>
          <span>Join Date</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading users...</div>
        ) : error ? (
          <div className={styles.emptyState}>{error}</div>
        ) : !data || data.users.length === 0 ? (
          <div className={styles.emptyState}>No users matched the current search and filters.</div>
        ) : (
          data.users.map((listedUser) => {
            const rowBusy = statusUserId === listedUser.id || messageUserId === listedUser.id;
            const suspendLabel = listedUser.status === 'suspended' ? 'Reactivate user' : 'Suspend user';

            return (
              <article key={listedUser.id} className={styles.userRow}>
                <div className={styles.identityCell}>
                  <div className={styles.avatar}>
                    {listedUser.avatarPath ? (
                      <img src={listedUser.avatarPath} alt={listedUser.fullName} className={styles.avatarImage} />
                    ) : (
                      getInitials(listedUser.fullName)
                    )}
                  </div>

                  <div>
                    <h2 className={styles.userName}>{listedUser.fullName}</h2>
                    <p className={styles.userMeta}>{listedUser.email || 'No email on record'}</p>
                    <p className={styles.userSecondary}>
                      @{listedUser.username} - {listedUser.locationLabel}
                    </p>
                  </div>
                </div>

                <div className={styles.roleCell}>
                  <span className={`${styles.rolePill} ${listedUser.role === 'admin' ? styles.roleAdmin : styles.roleUser}`}>
                    {listedUser.role}
                  </span>
                </div>

                <div className={styles.dateCell}>
                  <strong>{formatJoinDate(listedUser.joinDate)}</strong>
                  <span>{listedUser.listingCount} listing(s)</span>
                </div>

                <div className={styles.statusCell}>
                  <span className={`${styles.statusDot} ${styles[`statusDot${getStatusLabel(listedUser.status).replace(/\s/g, '')}`]}`} />
                  <span>{getStatusLabel(listedUser.status)}</span>
                </div>

                <div className={styles.actionCell}>
                  <button
                    type="button"
                    className={styles.iconAction}
                    onClick={() => openDetails(listedUser.id)}
                    aria-label={`View details for ${listedUser.fullName}`}
                  >
                    <EyeIcon />
                  </button>

                  <button
                    type="button"
                    className={styles.iconAction}
                    onClick={() => void handleMessageUser(listedUser)}
                    disabled={rowBusy || !canMessageUser(listedUser, user?.id)}
                    aria-label={`Open moderation chat with ${listedUser.fullName}`}
                  >
                    <MessageIcon />
                  </button>

                  <button
                    type="button"
                    className={`${styles.iconAction} ${listedUser.status === 'suspended' ? styles.iconActionSuccess : styles.iconActionDanger}`}
                    onClick={() => void handleStatusToggle(listedUser)}
                    disabled={rowBusy || !canChangeStatus(listedUser, user?.id)}
                    aria-label={suspendLabel}
                    title={suspendLabel}
                  >
                    {listedUser.status === 'suspended' ? <ActivateIcon /> : <SuspendIcon />}
                  </button>
                </div>
              </article>
            );
          })
        )}

        {data && (
          <div className={styles.paginationBar}>
            <p>
              Showing page {data.pagination.page} of {data.pagination.totalPages} - {data.pagination.totalItems} matching users
            </p>

            <div className={styles.paginationButtons}>
              <button
                type="button"
                className={styles.paginationButton}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Prev
              </button>

              {pagination.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`${styles.paginationButton} ${pageNumber === page ? styles.paginationButtonActive : ''}`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                className={styles.paginationButton}
                disabled={page >= (data.pagination.totalPages || 1)}
                onClick={() => setPage((current) => Math.min(data.pagination.totalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {data && (
        <section className={styles.statsGrid}>
          <article className={`${styles.statCard} ${styles.statCardDark}`}>
            <p className={styles.statLabel}>New This Month</p>
            <h3 className={styles.statValue}>+{data.stats.newThisMonth}</h3>
            <p className={styles.statDetail}>Recently created marketplace accounts.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardMint}`}>
            <p className={styles.statLabel}>Identity Verified</p>
            <h3 className={styles.statValue}>{data.stats.verificationRate}%</h3>
            <p className={styles.statDetail}>Users with confirmed email access.</p>
          </article>

          <article className={styles.statCard}>
            <p className={styles.statLabel}>Active Users</p>
            <h3 className={styles.statValue}>{data.stats.activeUsers}</h3>
            <p className={styles.statDetail}>Currently active user accounts.</p>
          </article>

          <article className={`${styles.statCard} ${styles.statCardPeach}`}>
            <p className={styles.statLabel}>Pending Flags</p>
            <h3 className={styles.statValue}>{data.stats.pendingFlags}</h3>
            <p className={styles.statDetail}>Open moderation reports waiting for review.</p>
          </article>
        </section>
      )}

      {showCreateModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Manual Entry</p>
                <h2>Create New User</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setShowCreateModal(false)}>
                x
              </button>
            </div>

            <form className={styles.formGrid} onSubmit={handleCreateUser}>
              <label>
                <span>Full Name</span>
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Nadia Rahman"
                  required
                />
              </label>

              <label>
                <span>Username</span>
                <input
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="nadia_rahman"
                  required
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="nadia@example.com"
                  required
                />
              </label>

              <label>
                <span>Temporary Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Minimum 8 characters"
                  required
                />
              </label>

              <label>
                <span>Role</span>
                <input value="user" readOnly />
              </label>

              <label>
                <span>Region</span>
                <select
                  value={form.stateId}
                  onChange={(event) => {
                    setAreas([]);
                    setForm((current) => ({ ...current, stateId: event.target.value, areaId: '' }));
                  }}
                >
                  <option value="">Optional</option>
                  {states.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.fullWidth}>
                <span>Area</span>
                <select
                  value={form.areaId}
                  onChange={(event) => setForm((current) => ({ ...current, areaId: event.target.value }))}
                  disabled={!form.stateId}
                >
                  <option value="">Optional</option>
                  {(form.stateId ? areas : []).map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <p className={styles.formHint}>All manual entries are created with the role set to `user`.</p>

              {formError && <p className={styles.formError}>{formError}</p>}
              {formSuccess && <p className={styles.formSuccess}>{formSuccess}</p>}

              <div className={styles.formActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowCreateModal(false)}>
                  Close
                </button>
                <button type="submit" className={styles.primaryButton} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetailsModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowDetailsModal(false)}>
          <div className={`${styles.modal} ${styles.detailModal}`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>User Action Center</p>
                <h2>{detailTarget ? detailTarget.fullName : 'User details'}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setShowDetailsModal(false)}>
                x
              </button>
            </div>

            {detailsLoading ? (
              <div className={styles.detailLoading}>Loading account details...</div>
            ) : detailsError ? (
              <div className={styles.detailLoading}>{detailsError}</div>
            ) : !details ? (
              <div className={styles.detailLoading}>User details are not available.</div>
            ) : (
              <div className={styles.detailBody}>
                <section className={styles.detailHero}>
                  <div className={styles.detailIdentity}>
                    <div className={styles.detailAvatar}>
                      {detailTarget?.avatarPath ? (
                        <img src={detailTarget.avatarPath} alt={detailTarget.fullName} className={styles.avatarImage} />
                      ) : (
                        getInitials(detailTarget?.fullName || 'U')
                      )}
                    </div>

                    <div className={styles.detailCopy}>
                      <p className={styles.detailTitle}>{detailTarget?.fullName}</p>
                      <p className={styles.detailMeta}>
                        @{detailTarget?.username} - {detailTarget?.email || 'No email on record'}
                      </p>
                      <div className={styles.detailPills}>
                        <span className={`${styles.rolePill} ${detailTarget?.role === 'admin' ? styles.roleAdmin : styles.roleUser}`}>
                          {detailTarget?.role}
                        </span>
                        <span className={styles.detailStatusPill}>{detailTarget ? getStatusLabel(detailTarget.status) : 'Unknown'}</span>
                        <span className={styles.detailStatusPill}>
                          {detailTarget?.emailVerified ? 'Email Verified' : 'Email Pending'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => detailTarget && void handleMessageUser(detailTarget)}
                      disabled={!detailTarget || messageUserId === detailTarget.id || !canMessageUser(detailTarget, user?.id)}
                    >
                      <MessageIcon />
                      <span>{messageUserId === detailTarget?.id ? 'Opening...' : 'Message User'}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => detailTarget && void handleStatusToggle(detailTarget)}
                      disabled={!detailTarget || statusUserId === detailTarget.id || !canChangeStatus(detailTarget, user?.id)}
                    >
                      {detailTarget?.status === 'suspended' ? <ActivateIcon /> : <SuspendIcon />}
                      <span>
                        {statusUserId === detailTarget?.id
                          ? 'Saving...'
                          : detailTarget?.status === 'suspended'
                            ? 'Reactivate Account'
                            : 'Suspend Account'}
                      </span>
                    </button>
                  </div>
                </section>

                <section className={styles.detailStatsGrid}>
                  <article className={styles.detailStatCard}>
                    <span className={styles.detailStatLabel}>Joined</span>
                    <strong>{formatJoinDate(details.user.joinDate)}</strong>
                    <p>Last sign in: {formatDateTime(details.user.lastSignInAt)}</p>
                  </article>
                  <article className={styles.detailStatCard}>
                    <span className={styles.detailStatLabel}>Location</span>
                    <strong>{details.user.locationLabel}</strong>
                    <p>{details.user.areaName || details.user.stateName || 'No region selected'}</p>
                  </article>
                  <article className={styles.detailStatCard}>
                    <span className={styles.detailStatLabel}>Listings</span>
                    <strong>{details.stats.totalListings}</strong>
                    <p>{details.stats.activeListings} active, {details.stats.soldListings} sold</p>
                  </article>
                  <article className={styles.detailStatCard}>
                    <span className={styles.detailStatLabel}>Views</span>
                    <strong>{details.stats.totalViews}</strong>
                    <p>{details.stats.draftListings} draft listing(s)</p>
                  </article>
                </section>

                <section className={styles.accountInfoGrid}>
                  <article className={styles.infoCard}>
                    <p className={styles.infoCardTitle}>Account Details</p>
                    <div className={styles.infoRows}>
                      <div>
                        <span>Account ID</span>
                        <strong>{details.user.id}</strong>
                      </div>
                      <div>
                        <span>Last profile update</span>
                        <strong>{formatDateTime(details.user.updatedAt)}</strong>
                      </div>
                      <div>
                        <span>Login access</span>
                        <strong>Allowed</strong>
                      </div>
                    </div>
                  </article>

                  <article className={styles.infoCard}>
                    <p className={styles.infoCardTitle}>What suspension blocks</p>
                    <div className={styles.infoRows}>
                      <div>
                        <span>Listings</span>
                        <strong>Cannot create, edit, upload, or restore listings</strong>
                      </div>
                      <div>
                        <span>Offers</span>
                        <strong>Cannot send or respond to new offers</strong>
                      </div>
                      <div>
                        <span>Messages</span>
                        <strong>Normal marketplace messaging is blocked, moderation chat stays available</strong>
                      </div>
                    </div>
                  </article>
                </section>

                <section className={styles.listingsSection}>
                  <div className={styles.listingsSectionHeader}>
                    <div>
                      <p className={styles.detailSectionEyebrow}>Listing Preview</p>
                      <h3>Recent listings and photos</h3>
                    </div>
                    <div className={styles.listingsSummary}>
                      <ListingIcon />
                      <span>{details.listings.length} preview card(s)</span>
                    </div>
                  </div>

                  {details.listings.length === 0 ? (
                    <div className={styles.emptyListingState}>This user has not created any listings yet.</div>
                  ) : (
                    <div className={styles.listingsGrid}>
                      {details.listings.map((listing) => (
                        <article key={listing.id} className={styles.listingCard}>
                          <div className={styles.listingMedia}>
                            {listing.coverImagePath ? (
                              <img src={listing.coverImagePath} alt={listing.title} className={styles.listingImage} />
                            ) : (
                              <div className={styles.listingPlaceholder}>{getInitials(listing.title)}</div>
                            )}
                          </div>
                          <div className={styles.listingBody}>
                            <div className={styles.listingTop}>
                              <span className={styles.listingStatus}>{listing.statusLabel}</span>
                              <strong>{formatCurrency(listing.price, listing.currency)}</strong>
                            </div>
                            <h4>{listing.title}</h4>
                            <p>{listing.categoryName || 'Uncategorized'}</p>
                            <p>{listing.locationLabel}</p>
                            <div className={styles.listingMetaRow}>
                              <span>{listing.viewsCount} views</span>
                              <span>{formatJoinDate(listing.createdAt)}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
