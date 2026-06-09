/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import ReMarketVerifiedBadge from '@/src/components/identity/ReMarketVerifiedBadge';
import {
  approveAdminVerificationRequest,
  getAdminVerificationRequestDetail,
  getAdminVerificationRequests,
  rejectAdminVerificationRequest,
  requestAdminVerificationResubmission,
} from '@/src/services/verificationService';
import type {
  AdminVerificationRequestDetail,
  AdminVerificationRequestsResponse,
  IdentityDocumentType,
  IdentityRequestStatus,
} from '@/src/types/verification';
import { scheduleEffectWork } from '@/src/utils/effectScheduling';
import styles from './page.module.css';

const STATUS_TABS: Array<{ value: IdentityRequestStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'resubmission_required', label: 'Resubmission Required' },
];

const DOCUMENT_TYPE_LABELS: Record<IdentityDocumentType, string> = {
  passport: 'Passport',
  national_id: 'National ID',
  driving_license: 'Driving License',
  other: 'Other',
};

const STATUS_LABELS: Record<IdentityRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  resubmission_required: 'Resubmission Required',
};

type DecisionAction = 'approve' | 'reject' | 'resubmission';

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Not reviewed';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

function getStatusClass(status: IdentityRequestStatus) {
  if (status === 'approved') return styles.statusApproved;
  if (status === 'rejected') return styles.statusRejected;
  if (status === 'resubmission_required') return styles.statusResubmission;
  return styles.statusPending;
}

export default function AdminVerificationPage() {
  const searchParams = useSearchParams();
  const { token } = useRequireAuth();
  const [activeStatus, setActiveStatus] = useState<IdentityRequestStatus>('pending');
  const [data, setData] = useState<AdminVerificationRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<AdminVerificationRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [decisionBusy, setDecisionBusy] = useState<DecisionAction | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const requestIdFromQuery = searchParams.get('requestId');

  const openReview = useCallback(async (requestId: string) => {
    if (!token) return;

    setDetail(null);
    setDetailError(null);
    setDecisionReason('');
    setAdminNotes('');
    setDetailLoading(true);

    const response = await getAdminVerificationRequestDetail(token, requestId);
    if (response.data) {
      setDetail(response.data);
      setAdminNotes(response.data.adminNotes ?? '');
    } else {
      setDetailError(response.error || 'Unable to open verification request.');
    }

    setDetailLoading(false);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const cancelScheduledWork = scheduleEffectWork(() => {
      if (cancelled) return;

      setLoading(true);

      getAdminVerificationRequests(token, activeStatus).then((response) => {
        if (cancelled) return;

        if (response.data) {
          setData(response.data);
          setError(null);
        } else {
          setError(response.error || 'Failed to load verification requests.');
        }

        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      cancelScheduledWork();
    };
  }, [activeStatus, refreshKey, token]);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!requestIdFromQuery || !token) return;

    return scheduleEffectWork(() => {
      void openReview(requestIdFromQuery);
    });
  }, [openReview, requestIdFromQuery, token]);

  const totalRequests = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.counts).reduce((sum, count) => sum + count, 0);
  }, [data]);

  function closeReview() {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setDecisionReason('');
    setAdminNotes('');
  }

  async function handleDecision(action: DecisionAction) {
    if (!token || !detail || decisionBusy) return;

    if ((action === 'reject' || action === 'resubmission') && !decisionReason.trim()) {
      setNotice({ type: 'error', message: 'A user-facing reason is required.' });
      return;
    }

    setDecisionBusy(action);

    const response =
      action === 'approve'
        ? await approveAdminVerificationRequest(token, detail.id, adminNotes)
        : action === 'reject'
          ? await rejectAdminVerificationRequest(token, detail.id, {
              rejectionReason: decisionReason,
              adminNotes,
            })
          : await requestAdminVerificationResubmission(token, detail.id, {
              rejectionReason: decisionReason,
              adminNotes,
            });

    setDecisionBusy(null);

    if (response.data) {
      setDetail(response.data);
      setNotice({
        type: 'success',
        message:
          action === 'approve'
            ? 'Verification approved and badge activated.'
            : action === 'reject'
              ? 'Verification rejected and the user was notified.'
              : 'Resubmission requested and the user was notified.',
      });
      setRefreshKey((key) => key + 1);
    } else {
      setNotice({ type: 'error', message: response.error || 'Unable to update request.' });
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ReMarket Verified</p>
          <h1 className={styles.title}>Identity Verification</h1>
          <p className={styles.subtitle}>
            Review private identity submissions with short-lived signed image links and clear user-facing outcomes.
          </p>
        </div>
        <div className={styles.heroStats}>
          <span>Total requests</span>
          <strong>{totalRequests}</strong>
        </div>
      </header>

      {notice && (
        <div className={`${styles.noticeBanner} ${notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}`}>
          {notice.message}
        </div>
      )}

      <nav className={styles.tabBar} aria-label="Verification status filters">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`${styles.tabItem} ${activeStatus === tab.value ? styles.tabItemActive : ''}`}
            onClick={() => setActiveStatus(tab.value)}
          >
            <span>{tab.label}</span>
            <span className={styles.tabBadge}>{data?.counts[tab.value] ?? 0}</span>
          </button>
        ))}
      </nav>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span>User name</span>
          <span>Email</span>
          <span>Document type</span>
          <span>Status</span>
          <span>Submitted</span>
          <span>Action</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading verification requests...</div>
        ) : error ? (
          <div className={styles.emptyState}>{error}</div>
        ) : !data || data.requests.length === 0 ? (
          <div className={styles.emptyState}>No requests in this status.</div>
        ) : (
          data.requests.map((request) => (
            <article key={request.id} className={styles.tableRow}>
              <div className={styles.userCell}>
                <div className={styles.avatar}>
                  {request.user.avatarPath ? (
                    <img src={request.user.avatarPath} alt={request.user.fullName} />
                  ) : (
                    getInitials(request.user.fullName)
                  )}
                </div>
                <div>
                  <strong>{request.user.fullName}</strong>
                  <span>@{request.user.username}</span>
                  {request.user.identityVerificationBadge && <ReMarketVerifiedBadge />}
                </div>
              </div>
              <span className={styles.emailCell}>{request.user.email || 'No email'}</span>
              <span>{DOCUMENT_TYPE_LABELS[request.documentType]}</span>
              <span className={`${styles.statusPill} ${getStatusClass(request.status)}`}>
                {STATUS_LABELS[request.status]}
              </span>
              <span>{formatDate(request.submittedAt)}</span>
              <button
                type="button"
                className={styles.reviewButton}
                onClick={() => void openReview(request.id)}
              >
                Review
              </button>
            </article>
          ))
        )}
      </section>

      {(detail || detailLoading || detailError) && (
        <div className={styles.modalBackdrop} onClick={closeReview}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Manual Review</p>
                <h2>{detail?.user.fullName || 'Verification request'}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeReview}>
                x
              </button>
            </div>

            {detailLoading ? (
              <div className={styles.emptyState}>Generating signed image links...</div>
            ) : detailError ? (
              <div className={styles.emptyState}>{detailError}</div>
            ) : detail ? (
              <div className={styles.reviewBody}>
                <section className={styles.profilePanel}>
                  <div className={styles.userCell}>
                    <div className={styles.avatarLarge}>
                      {detail.user.avatarPath ? (
                        <img src={detail.user.avatarPath} alt={detail.user.fullName} />
                      ) : (
                        getInitials(detail.user.fullName)
                      )}
                    </div>
                    <div>
                      <h3>{detail.user.fullName}</h3>
                      <p>@{detail.user.username} - {detail.user.email || 'No email'}</p>
                      <span className={`${styles.statusPill} ${getStatusClass(detail.status)}`}>
                        {STATUS_LABELS[detail.status]}
                      </span>
                    </div>
                  </div>

                  <div className={styles.detailGrid}>
                    <div>
                      <span>Document</span>
                      <strong>{DOCUMENT_TYPE_LABELS[detail.documentType]}</strong>
                    </div>
                    <div>
                      <span>Country</span>
                      <strong>{detail.documentCountry || 'Not provided'}</strong>
                    </div>
                    <div>
                      <span>Last 4</span>
                      <strong>{detail.documentNumberLast4 || 'Not provided'}</strong>
                    </div>
                    <div>
                      <span>Submitted</span>
                      <strong>{formatDate(detail.submittedAt)}</strong>
                    </div>
                  </div>
                </section>

                <section className={styles.imageGrid}>
                  <article>
                    <span>Selfie</span>
                    <img src={detail.images.selfieSignedUrl} alt="Verification selfie" />
                  </article>
                  <article>
                    <span>Document front</span>
                    <img src={detail.images.documentFrontSignedUrl} alt="Government document front" />
                  </article>
                </section>

                <section className={styles.notesGrid}>
                  <div>
                    <span>User notes</span>
                    <p>{detail.userNotes || 'No user notes provided.'}</p>
                  </div>
                  <label>
                    <span>Admin notes</span>
                    <textarea
                      value={adminNotes}
                      onChange={(event) => setAdminNotes(event.target.value)}
                      rows={4}
                      placeholder="Private notes for admins only"
                    />
                  </label>
                  <label>
                    <span>Reason for rejection or resubmission</span>
                    <textarea
                      value={decisionReason}
                      onChange={(event) => setDecisionReason(event.target.value)}
                      rows={3}
                      placeholder="Shown to the user when rejecting or requesting resubmission"
                    />
                  </label>
                </section>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.approveButton}
                    onClick={() => void handleDecision('approve')}
                    disabled={Boolean(decisionBusy)}
                  >
                    {decisionBusy === 'approve' ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className={styles.rejectButton}
                    onClick={() => void handleDecision('reject')}
                    disabled={Boolean(decisionBusy)}
                  >
                    {decisionBusy === 'reject' ? 'Rejecting...' : 'Reject'}
                  </button>
                  <button
                    type="button"
                    className={styles.resubmitButton}
                    onClick={() => void handleDecision('resubmission')}
                    disabled={Boolean(decisionBusy)}
                  >
                    {decisionBusy === 'resubmission' ? 'Requesting...' : 'Request Resubmission'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
