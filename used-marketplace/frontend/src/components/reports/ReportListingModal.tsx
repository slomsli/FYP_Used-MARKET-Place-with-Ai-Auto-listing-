'use client';

import { useState } from 'react';
import { createListingReport } from '@/src/services/reportService';
import {
  REPORT_REASON_OPTIONS,
  type ListingReportReason,
} from '@/src/types/report';
import styles from './ReportListingModal.module.css';

interface ReportListingModalProps {
  open: boolean;
  listing: {
    id: string;
    title: string;
  } | null;
  token: string | null;
  onClose: () => void;
  onReported: (message: string) => void;
}

export default function ReportListingModal({
  open,
  listing,
  token,
  onClose,
  onReported,
}: ReportListingModalProps) {
  const [reason, setReason] = useState<ListingReportReason>('scam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedReason =
    REPORT_REASON_OPTIONS.find((option) => option.value === reason) ?? REPORT_REASON_OPTIONS[0];

  if (!open || !listing) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setError('Please sign in again before submitting a report.');
      return;
    }

    if (!listing) {
      setError('The selected listing could not be resolved.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const response = await createListingReport(token, {
      listingId: listing.id,
      reason,
      details,
    });

    setSubmitting(false);

    if (!response.data) {
      setError(response.error || 'Unable to submit your report right now.');
      return;
    }

    onReported('Report submitted to admin review.');
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.dialog} onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Trust &amp; Safety</p>
            <h2 className={styles.title}>Report this listing</h2>
            <p className={styles.subtitle}>
              Send the issue to the admin team so they can review the listing and seller activity.
            </p>
          </div>

          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close report form">
            x
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.listingCard}>
            <span className={styles.listingLabel}>Listing under review</span>
            <strong className={styles.listingTitle}>{listing.title}</strong>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Reason</span>
            <select
              className={styles.select}
              value={reason}
              onChange={(event) => setReason(event.target.value as ListingReportReason)}
              disabled={submitting}
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
            <textarea
              className={styles.textarea}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Tell the admin team what you noticed, including any suspicious payment requests, fake photos, or policy issues."
              maxLength={1000}
              disabled={submitting}
            />
            <span className={styles.hint}>{details.length}/1000 characters</span>
          </label>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  );
}
