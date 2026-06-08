'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { getPublicListingById } from '@/src/services/listingService';
import { reportItemNotReceived } from '@/src/services/offerService';
import { reportPurchaseReceiptNotReceived } from '@/src/services/purchaseService';
import { createListingReport } from '@/src/services/reportService';
import {
  REPORT_REASON_OPTIONS,
  type ListingReportReason,
} from '@/src/types/report';
import styles from './page.module.css';

const MINIMUM_DETAILS_LENGTH = 20;
const MAXIMUM_DETAILS_LENGTH = 1000;
const MAXIMUM_CONTEXT_LENGTH = 420;

function formatSourceLabel(value: string) {
  switch (value) {
    case 'assistant':
      return 'Assistant';
    case 'purchases':
      return 'Purchases';
    case 'sales':
      return 'Sales';
    default:
      return value;
  }
}

function formatScopeLabel(value: string) {
  switch (value) {
    case 'delivery':
      return 'Delivery issue';
    case 'sale':
      return 'Sold item';
    case 'purchase':
      return 'Purchase';
    default:
      return value;
  }
}

function truncateReportText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, Math.max(maxLength, 0));
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

export default function DashboardReportPage() {
  const searchParams = useSearchParams();
  const { user, token, loading } = useRequireAuth();
  const listingId = searchParams.get('listingId')?.trim() || '';
  const offerId = searchParams.get('offerId')?.trim() || '';
  const receiptId = searchParams.get('receiptId')?.trim() || '';
  const orderId = searchParams.get('orderId')?.trim() || receiptId || offerId;
  const requestedTitle = searchParams.get('title')?.trim() || '';
  const agreedPrice = searchParams.get('amount')?.trim() || '';
  const sellerName = searchParams.get('seller')?.trim() || '';
  const buyerName = searchParams.get('buyer')?.trim() || '';
  const requestedPaymentReference = searchParams.get('paymentReference')?.trim() || '';
  const scope = searchParams.get('scope')?.trim() || '';
  const source = searchParams.get('source')?.trim() || '';
  const isDeliveryScope = scope === 'delivery';
  const isPurchaseScope = scope === 'purchase';
  const isSaleScope = scope === 'sale';
  const isPurchaseAreaReport =
    isDeliveryScope ||
    isPurchaseScope ||
    isSaleScope ||
    source === 'purchases' ||
    source === 'sales';
  const [reason, setReason] = useState<ListingReportReason>('scam');
  const [details, setDetails] = useState('');
  const [paymentReference, setPaymentReference] = useState(requestedPaymentReference);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
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
  const receiptHref = receiptId ? `${ROUTES.PURCHASES}/${receiptId}` : '';
  const cancelHref =
    receiptHref
      ? receiptHref
      : isDeliveryScope
        ? ROUTES.OFFERS
        : isPurchaseAreaReport
          ? ROUTES.PURCHASES
          : ROUTES.MESSAGES;
  const backLabel = receiptHref
    ? 'Back to receipt'
    : isDeliveryScope
      ? 'Back to offers'
      : isPurchaseAreaReport
        ? 'Back to purchases'
        : 'Open messages';
  const contextLabel = isDeliveryScope || isPurchaseScope
    ? 'Purchase context'
    : isSaleScope
      ? 'Sale context'
      : source
        ? 'Report context'
        : 'Assistant context';

  const pageTitle = isDeliveryScope
    ? 'Report an item not received'
    : isPurchaseScope
      ? 'Report a purchase problem'
      : isSaleScope
        ? 'Report a sold item problem'
        : 'Report a marketplace issue';
  const pageSubtitle = isDeliveryScope
    ? 'Use this form when a seller accepted your purchase but the item still has not arrived. The admin can review the payment details, proofs, and seller activity.'
    : isPurchaseScope
      ? 'Use this form when something about an item you bought needs admin review.'
      : isSaleScope
        ? 'Use this form when something about an item you sold needs admin review.'
        : 'Use this form when you need admin review for a suspicious or unsafe listing.';

  const successTitle = isDeliveryScope ? 'Delivery issue submitted' : 'Report submitted';
  const resolvedSuccessMessage = successMessage || (
    isDeliveryScope
      ? 'Your item-not-received report was sent to admin review successfully.'
      : 'Report submitted to admin review successfully.'
  );

  useEffect(() => {
    let active = true;

    if (!listingId) {
      Promise.resolve().then(() => {
        if (!active) {
          return;
        }

        setLoadingListing(false);
        setLoadingError('A listing reference is required before you can submit a report.');
      });

      return () => {
        active = false;
      };
    }

    Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      setLoadingListing(true);
      setLoadingError(null);
    });

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

  async function readFileAsBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Unable to read the selected file.'));
          return;
        }

        const [, base64Data] = reader.result.split(',');
        if (!base64Data) {
          reject(new Error('Unable to process the selected file.'));
          return;
        }

        resolve(base64Data);
      };

      reader.onerror = () => reject(new Error('Unable to read the selected file.'));
      reader.readAsDataURL(file);
    });
  }

  function handleProofSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length > 3) {
      setSubmitError('You can upload up to 3 proof images for a delivery issue.');
      return;
    }

    const invalidFile = selectedFiles.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      setSubmitError('Only image proof files are supported right now.');
      return;
    }

    const oversizedFile = selectedFiles.find((file) => file.size > 4 * 1024 * 1024);
    if (oversizedFile) {
      setSubmitError('Each proof image must be 4 MB or smaller.');
      return;
    }

    setSubmitError(null);
    setProofFiles(selectedFiles);
  }

  function buildListingReportDetails(normalizedDetails: string) {
    const contextLines = [
      scope ? `Flow: ${formatScopeLabel(scope)}` : null,
      source ? `Opened from: ${formatSourceLabel(source)}` : null,
      orderId ? `Order ID: ${orderId}` : null,
      receiptId ? `Receipt ID: ${receiptId}` : null,
      offerId ? `Offer ID: ${offerId}` : null,
      listingTitle ? `Listing: ${listingTitle}` : requestedTitle ? `Listing: ${requestedTitle}` : null,
      agreedPrice ? `Agreed price: ${agreedPrice}` : null,
      sellerName ? `Seller: ${sellerName}` : null,
      buyerName ? `Buyer: ${buyerName}` : null,
      requestedPaymentReference ? `Payment reference: ${requestedPaymentReference}` : null,
    ].filter((line): line is string => Boolean(line));

    if (contextLines.length === 0) {
      return normalizedDetails;
    }

    const contextBlock = `\n\nReport context:\n${truncateReportText(
      contextLines.join('\n'),
      MAXIMUM_CONTEXT_LENGTH
    )}`;

    if (normalizedDetails.length + contextBlock.length <= MAXIMUM_DETAILS_LENGTH) {
      return `${normalizedDetails}${contextBlock}`;
    }

    return `${truncateReportText(
      normalizedDetails,
      MAXIMUM_DETAILS_LENGTH - contextBlock.length
    )}${contextBlock}`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedDetails = details.trim();
    const normalizedPaymentReference = paymentReference.trim();

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
        isDeliveryScope
          ? `Please explain what happened in at least ${MINIMUM_DETAILS_LENGTH} characters so the admin can review the delivery issue properly.`
          : `Please include at least ${MINIMUM_DETAILS_LENGTH} characters so the admin can review the report properly.`
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    let successText = 'Report submitted to admin review successfully.';

    if (isDeliveryScope) {
      if (!offerId && !receiptId) {
        setSubmitting(false);
        setSubmitError('A purchase or receipt reference is required before you can report that the item was not received.');
        return;
      }

      let proofs: Array<{ fileName: string; contentType: string; base64Data: string }> = [];
      try {
        proofs = await Promise.all(
          proofFiles.map(async (file) => ({
            fileName: file.name,
            contentType: file.type,
            base64Data: await readFileAsBase64(file),
          }))
        );
      } catch (proofError) {
        setSubmitting(false);
        setSubmitError(
          proofError instanceof Error ? proofError.message : 'Unable to read one of the proof files.'
        );
        return;
      }

      const response = receiptId
        ? await reportPurchaseReceiptNotReceived(token, receiptId, {
            buyerStatement: normalizedDetails,
            paymentReference: normalizedPaymentReference || undefined,
            proofs,
          })
        : await reportItemNotReceived(token, offerId, {
            buyerStatement: normalizedDetails,
            paymentReference: normalizedPaymentReference || undefined,
            proofs,
          });

      setSubmitting(false);

      if (!response.data) {
        setSubmitError(response.error || 'Unable to submit your delivery issue right now.');
        return;
      }

      successText = 'Your item-not-received report was sent to admin review successfully.';
    } else {
      const response = await createListingReport(token, {
        listingId,
        reason,
        details: buildListingReportDetails(normalizedDetails),
      });

      setSubmitting(false);

      if (!response.data) {
        setSubmitError(response.error || 'Unable to submit your report right now.');
        return;
      }
    }

    setSuccessMessage(successText);
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Trust &amp; Safety</p>
        <h1 className={styles.title}>{pageTitle}</h1>
        <p className={styles.subtitle}>{pageSubtitle}</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.contextCard}>
          <span className={styles.contextLabel}>
            {contextLabel}
          </span>
          <strong className={styles.contextTitle}>
            {loadingListing ? 'Loading listing...' : listingTitle || 'Listing reference'}
          </strong>
          <div className={styles.contextMeta}>
            {orderId && <span>Order ID: {orderId}</span>}
            {receiptId && <span>Receipt ID: {receiptId}</span>}
            {scope && (
              <span>
                Flow: {formatScopeLabel(scope)}
              </span>
            )}
            {agreedPrice && <span>Agreed price: {agreedPrice}</span>}
            {sellerName && <span>Seller: {sellerName}</span>}
            {buyerName && <span>Buyer: {buyerName}</span>}
            {source && <span>Opened from: {formatSourceLabel(source)}</span>}
          </div>
          {isDeliveryScope && (
            <p className={styles.contextNote}>
              Share the payment reference, what you already paid, and any screenshots that prove the item has not arrived yet.
            </p>
          )}
        </div>

        {loadingError && <div className={styles.errorBanner}>{loadingError}</div>}

        {successMessage ? (
          <div className={styles.successState}>
            <h2>{successTitle}</h2>
            <p>{resolvedSuccessMessage}</p>
            <div className={styles.successActions}>
              <Link href={cancelHref} className={styles.secondaryLink}>
                {backLabel}
              </Link>
              <Link href={ROUTES.BROWSE} className={styles.primaryLink}>
                Back to marketplace
              </Link>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {!isDeliveryScope && (
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
            )}

            {isDeliveryScope && (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Payment reference</span>
                  <input
                    className={styles.input}
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="Optional: transfer number, receipt ID, or payment note"
                    disabled={submitting || loadingListing || Boolean(loadingError)}
                  />
                  <span className={styles.hint}>
                    This helps the admin verify how the purchase was paid.
                  </span>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Proof images</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className={styles.fileInput}
                    onChange={handleProofSelection}
                    disabled={submitting || loadingListing || Boolean(loadingError)}
                  />
                  <span className={styles.hint}>
                    Optional. Upload up to 3 screenshots such as receipts, transfer confirmations, or chat proof.
                  </span>
                  {proofFiles.length > 0 && (
                    <div className={styles.proofGrid}>
                      {proofFiles.map((file) => (
                        <div key={`${file.name}-${file.size}`} className={styles.proofCard}>
                          <strong>{file.name}</strong>
                          <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </label>
              </>
            )}

            <label className={styles.field}>
              <span className={styles.label}>
                {isDeliveryScope ? 'What happened?' : 'Details'}
              </span>
              <div className={styles.prompt}>
                <strong>What the admin needs:</strong>{' '}
                {isDeliveryScope
                  ? 'Explain when the seller accepted the deal, when you paid, what proof you have, and why you believe the item still has not arrived.'
                  : selectedReason.detailsPrompt}
              </div>
              <textarea
                className={styles.textarea}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder={
                  isDeliveryScope
                    ? 'Explain the payment, what the seller agreed to, what happened after that, and why the item is still not received.'
                    : 'Explain what happened, how you noticed it, and any proof the admin should review.'
                }
                minLength={MINIMUM_DETAILS_LENGTH}
                maxLength={MAXIMUM_DETAILS_LENGTH}
                disabled={submitting || loadingListing || Boolean(loadingError)}
                required
              />
              <span className={styles.hint}>
                Minimum {MINIMUM_DETAILS_LENGTH} characters. {details.length}/{MAXIMUM_DETAILS_LENGTH} characters.
              </span>
            </label>

            {submitError && <div className={styles.errorBanner}>{submitError}</div>}

            <div className={styles.actions}>
              <Link href={cancelHref} className={styles.secondaryLink}>
                Cancel
              </Link>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={submitting || loadingListing || Boolean(loadingError)}
              >
                {submitting
                  ? 'Submitting...'
                  : isDeliveryScope
                    ? 'Submit delivery issue'
                    : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
