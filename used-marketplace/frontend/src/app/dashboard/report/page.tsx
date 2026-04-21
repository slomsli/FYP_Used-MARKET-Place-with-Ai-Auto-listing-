'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { getPublicListingById } from '@/src/services/listingService';
import { createListingReport } from '@/src/services/reportService';
import {
  REPORT_REASON_OPTIONS,
  type ListingReportReason,
} from '@/src/types/report';
import styles from './page.module.css';

const MINIMUM_DETAILS_LENGTH = 20;

export default function DashboardReportPage() {
  const searchParams = useSearchParams();
  const { user, token, loading } = useRequireAuth();
  const listingId = searchParams.get('listingId')?.trim() || '';
  const orderId = searchParams.get('orderId')?.trim() || '';
  const requestedTitle = searchParams.get('title')?.trim() || '';
  const scope = searchParams.get('scope')?.trim() || '';
  const source = searchParams.get('source')?.trim() || '';
  const [reason, setReason] = useState<ListingReportReason>('scam');
  const [details, setDetails] = useState('');
  const [listingTitle, setListingTitle] = useState(requestedTitle);
  const [loadingListing, setLoadingListing] = useState(Boolean(listingId));
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedReason = useMemo(
    () => REPORT_REASON_OPTIONS.find((option) => option.value === reason) ?? REPORT_REASON_OPTIONS[0],
    [reason]
  );

  useEffect(() => {
    let active = true;

    if (!listingId) {
      setLoadingListing(false);
      setLoadingError('A listing reference is required before you can submit a report.');
      return () => {
        active = false;
      };
    }

    setLoadingListing(true);
    setLoadingError(null);

    getPublicListingById(listingId)
      .then((response) => {
        if (!active) {
          return;
        }

        if (!response.data?.listing) {
          setLoadingError(response.error || 'The listing could not be loaded for reporting.');
          setLoadingListing(false);
          return;
        }

        setListingTitle(response.data.listing.title);
        setLoadingListing(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setLoadingError('The listing could not be loaded for reporting.');
        setLoadingListing(false);
      });

    return () => {
      active = false;
    };
  }, [listingId]);

  if (loading || !user) {
    return <div className={styles.state}>Loading report form...</div>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedDetails = details.trim();

    if (!token) {
      setSubmitError('Please sign in again before submitting the report.');
      return;
    }

    if (!listingId) {
      setSubmitError('A listing is required before you can submit this report.');
      return;
    }

    if (normalizedDetails.length < MINIMUM_DETAILS_LENGTH) {
      setSubmitError(
        `Please include at least ${MINIMUM_DETAILS_LENGTH} characters so the admin can review the report properly.`
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const response = await createListingReport(token, {
      listingId,
      reason,
      details: normalizedDetails,
    });

    setSubmitting(false);

    if (!response.data) {
      setSubmitError(response.error || 'Unable to submit your report right now.');
      return;
    }

    setSuccessMessage('Report submitted to admin review successfully.');
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Trust &amp; Safety</p>
        <h1 className={styles.title}>Report a marketplace issue</h1>
        <p className={styles.subtitle}>
          Use this form when you need admin review for a suspicious or unsafe listing.
        </p>
      </section>

      <section className={styles.panel}>
        <div className={styles.contextCard}>
          <span className={styles.contextLabel}>Assistant context</span>
          <strong className={styles.contextTitle}>
            {loadingListing ? 'Loading listing...' : listingTitle || 'Listing reference'}
          </strong>
          <div className={styles.contextMeta}>
            {orderId && <span>Order ID: {orderId}</span>}
            {scope && <span>Flow: {scope === 'sale' ? 'Sold item' : 'Purchase'}</span>}
            {source && <span>Opened from: {source}</span>}
          </div>
        </div>

        {loadingError && <div className={styles.errorBanner}>{loadingError}</div>}

        {successMessage ? (
          <div className={styles.successState}>
            <h2>Report submitted</h2>
            <p>{successMessage}</p>
            <div className={styles.successActions}>
              <Link href={ROUTES.MESSAGES} className={styles.secondaryLink}>
                Open messages
              </Link>
              <Link href={ROUTES.BROWSE} className={styles.primaryLink}>
                Back to marketplace
              </Link>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Reason</span>
              <select
                className={styles.select}
                value={reason}
                onChange={(event) => setReason(event.target.value as ListingReportReason)}
                disabled={submitting || loadingListing || Boolean(loadingError)}
              >
                {REPORT_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>{selectedReason.hint}</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Details</span>
              <div className={styles.prompt}>
                <strong>What the admin needs:</strong> {selectedReason.detailsPrompt}
              </div>
              <textarea
                className={styles.textarea}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Explain what happened, how you noticed it, and any proof the admin should review."
                minLength={MINIMUM_DETAILS_LENGTH}
                maxLength={1000}
                disabled={submitting || loadingListing || Boolean(loadingError)}
                required
              />
              <span className={styles.hint}>
                Minimum {MINIMUM_DETAILS_LENGTH} characters. {details.length}/1000 characters
              </span>
            </label>

            {submitError && <div className={styles.errorBanner}>{submitError}</div>}

            <div className={styles.actions}>
              <Link href={ROUTES.MESSAGES} className={styles.secondaryLink}>
                Cancel
              </Link>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={submitting || loadingListing || Boolean(loadingError)}
              >
                {submitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
