'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  confirmPurchaseReceiptPayment,
  getPurchaseReceipt,
  markPurchaseReceiptReceived,
  markPurchaseReceiptPaid,
} from '@/src/services/purchaseService';
import type { PurchaseReceiptDetail } from '@/src/types/purchase';
import ImageLightbox from '@/src/components/ui/ImageLightbox';
import styles from './page.module.css';

function formatCurrency(amount: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-MY', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildMessageHref(
  listingId: string,
  recipientId: string,
  recipientName: string
) {
  const params = new URLSearchParams({
    listingId,
    recipientId,
    recipientName,
  });

  return `${ROUTES.MESSAGES}?${params.toString()}`;
}

function buildDeliveryIssueHref(receipt: PurchaseReceiptDetail) {
  const params = new URLSearchParams({
    listingId: receipt.listing.id,
    receiptId: receipt.id,
    orderId: receipt.receiptNumber,
    title: receipt.listing.title,
    amount: formatCurrency(receipt.totalAmount, receipt.currency),
    seller: receipt.seller.displayName,
    scope: 'delivery',
    source: 'purchases',
  });

  if (receipt.offerId) {
    params.set('offerId', receipt.offerId);
  }

  if (receipt.paymentReference) {
    params.set('paymentReference', receipt.paymentReference);
  }

  return `${ROUTES.REPORT}?${params.toString()}`;
}

function getStatusClass(status: PurchaseReceiptDetail['paymentStatus']) {
  switch (status) {
    case 'seller_confirmed_paid':
      return styles.statusPaid;
    case 'buyer_marked_paid':
      return styles.statusWaiting;
    case 'pending':
    default:
      return styles.statusPending;
  }
}

function getDeliveryStatusClass(status: PurchaseReceiptDetail['deliveryStatus']) {
  switch (status) {
    case 'received':
      return styles.deliveryReceived;
    case 'not_received':
      return styles.deliveryIssue;
    case 'pending':
    default:
      return styles.deliveryPending;
  }
}

export default function PurchaseReceiptDetailPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptIdParam = params?.receiptId;
  const normalizedReceiptId: string = Array.isArray(receiptIdParam)
    ? receiptIdParam[0] ?? ''
    : receiptIdParam ?? '';
  const { user, token, loading: authLoading } = useRequireAuth();
  const [receipt, setReceipt] = useState<PurchaseReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [actionLoading, setActionLoading] = useState<
    'mark-paid' | 'confirm-payment' | 'mark-received' | null
  >(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [buyerNote, setBuyerNote] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token || !normalizedReceiptId) {
      return;
    }

    const authToken: string = token;

    let cancelled = false;

    async function loadReceipt() {
      setLoading(true);
      const response = await getPurchaseReceipt(authToken, normalizedReceiptId);

      if (cancelled) {
        return;
      }

      if (response.data) {
        const nextReceipt = response.data.receipt;
        setReceipt(nextReceipt);
        setPaymentMethod(nextReceipt.paymentMethod ?? '');
        setPaymentReference(nextReceipt.paymentReference ?? '');
        setBuyerNote(nextReceipt.buyerNote ?? '');
        setErrorMsg(null);
      } else {
        setErrorMsg(response.error || 'Failed to load the receipt.');
      }

      setLoading(false);
    }

    void loadReceipt();

    return () => {
      cancelled = true;
    };
  }, [normalizedReceiptId, token, user]);

  if (authLoading || loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>Loading receipt...</div>
      </div>
    );
  }

  if (!receipt || !user) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>{errorMsg || 'Receipt not found.'}</div>
      </div>
    );
  }

  const isBuyer = user.id === receipt.buyer.id;
  const counterparty = isBuyer ? receipt.seller : receipt.buyer;
  const messageHref = buildMessageHref(
    receipt.listing.id,
    counterparty.id,
    counterparty.displayName
  );
  const deliveryIssueHref = buildDeliveryIssueHref(receipt);

  async function handleMarkPaid() {
    const authToken = token;
    const currentReceipt = receipt;

    if (!authToken || !currentReceipt) {
      setNotice({ type: 'error', message: 'No auth session found. Please sign in again.' });
      return;
    }

    setActionLoading('mark-paid');
    const response = await markPurchaseReceiptPaid(authToken, currentReceipt.id, {
      paymentMethod: paymentMethod.trim() || undefined,
      paymentReference: paymentReference.trim() || undefined,
      buyerNote: buyerNote.trim() || undefined,
    });
    setActionLoading(null);

    if (response.data) {
      setReceipt(response.data.receipt);
      setNotice({
        type: 'success',
        message: 'Receipt marked as paid. The seller can now confirm it.',
      });
      setErrorMsg(null);
    } else {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to update payment status.',
      });
    }
  }

  async function handleConfirmPayment() {
    const authToken = token;
    const currentReceipt = receipt;

    if (!authToken || !currentReceipt) {
      setNotice({ type: 'error', message: 'No auth session found. Please sign in again.' });
      return;
    }

    setActionLoading('confirm-payment');
    const response = await confirmPurchaseReceiptPayment(authToken, currentReceipt.id);
    setActionLoading(null);

    if (response.data) {
      setReceipt(response.data.receipt);
      setNotice({
        type: 'success',
        message: 'Payment confirmed. This receipt is now marked as paid.',
      });
      setErrorMsg(null);
    } else {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to confirm payment.',
      });
    }
  }

  async function handleMarkReceived() {
    const authToken = token;
    const currentReceipt = receipt;

    if (!authToken || !currentReceipt) {
      setNotice({ type: 'error', message: 'No auth session found. Please sign in again.' });
      return;
    }

    setActionLoading('mark-received');
    const response = await markPurchaseReceiptReceived(authToken, currentReceipt.id);
    setActionLoading(null);

    if (response.data) {
      setReceipt(response.data.receipt);
      setNotice({
        type: 'success',
        message: 'Thanks. This purchase is now marked as received.',
      });
      setErrorMsg(null);
    } else {
      setNotice({
        type: 'error',
        message: response.error || 'Failed to update the delivery status.',
      });
    }
  }

  return (
    <div className={styles.page}>
      {notice && (
        <div
          className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}
        >
          {notice.message}
        </div>
      )}

      {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}

      <div className={styles.toolbar}>
        <Link href={ROUTES.PURCHASES} className={styles.toolbarLink}>
          Back to Purchase History
        </Link>
        <div className={styles.toolbarActions}>
          <Link href={messageHref} className={styles.secondaryButton}>
            Message {isBuyer ? 'Seller' : 'Buyer'}
          </Link>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Receipt</p>
          <h1 className={styles.title}>{receipt.receiptNumber}</h1>
          <p className={styles.subtitle}>
            Printable sale record for <strong>{receipt.listing.title}</strong>. Use this as the
            buyer/seller confirmation sheet for the transaction.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span className={`${styles.statusBadge} ${getStatusClass(receipt.paymentStatus)}`}>
            {receipt.paymentStatusLabel}
          </span>
          <span
            className={`${styles.deliveryBadge} ${getDeliveryStatusClass(
              receipt.deliveryStatus
            )}`}
          >
            {receipt.deliveryStatusLabel}
          </span>
          <span className={styles.heroDate}>
            Issued {formatDateTime(receipt.listing.soldAt || receipt.createdAt)}
          </span>
        </div>
      </section>

      <div className={styles.layout}>
        <article className={styles.sheet}>
          <header className={styles.sheetHeader}>
            <div>
              <span className={styles.brandMark}>ReMarket</span>
              <h2 className={styles.sheetTitle}>Marketplace Receipt</h2>
              <p className={styles.sheetText}>
                Buyer and seller summary with manual payment confirmation.
              </p>
            </div>
            <div className={styles.sheetMeta}>
              <span>Source: {receipt.sourceLabel}</span>
              <span>Status: {receipt.paymentStatusLabel}</span>
              <span>Delivery: {receipt.deliveryStatusLabel}</span>
              <span>Receipt No: {receipt.receiptNumber}</span>
            </div>
          </header>

          <section className={styles.partyGrid}>
            <div className={styles.partyCard}>
              <span className={styles.partyLabel}>Buyer</span>
              <strong>{receipt.buyer.displayName}</strong>
              <span>{receipt.buyer.username ? `@${receipt.buyer.username}` : 'Marketplace user'}</span>
            </div>
            <div className={styles.partyCard}>
              <span className={styles.partyLabel}>Seller</span>
              <strong>{receipt.seller.displayName}</strong>
              <span>{receipt.seller.username ? `@${receipt.seller.username}` : 'Marketplace user'}</span>
            </div>
            <div className={styles.partyCard}>
              <span className={styles.partyLabel}>Sender</span>
              <strong>{receipt.paymentFlow.senderLabel}</strong>
              <span>Pays the listed amount</span>
            </div>
            <div className={styles.partyCard}>
              <span className={styles.partyLabel}>Receiver</span>
              <strong>{receipt.paymentFlow.receiverLabel}</strong>
              <span>Receives the listed amount</span>
            </div>
          </section>

          <section className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Listing</span>
              <strong>{receipt.listing.title}</strong>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Offer reference</span>
              <strong>{receipt.offerId || 'Manual sale'}</strong>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Buyer marked paid</span>
              <strong>{formatDateTime(receipt.buyerMarkedPaidAt)}</strong>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Seller confirmed paid</span>
              <strong>{formatDateTime(receipt.sellerConfirmedPaidAt)}</strong>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Delivery status</span>
              <strong>{receipt.deliveryStatusLabel}</strong>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Delivery marked</span>
              <strong>{formatDateTime(receipt.deliveryMarkedAt)}</strong>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Payment method</span>
              <strong>{receipt.paymentMethod || 'Not provided yet'}</strong>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Payment reference</span>
              <strong>{receipt.paymentReference || 'Not provided yet'}</strong>
            </div>
          </section>

          <section className={styles.productRow}>
            <div className={styles.productVisual}>
              {receipt.listing.coverImagePath ? (
                <img
                  src={receipt.listing.coverImagePath}
                  alt={receipt.listing.title}
                  className={styles.productImage}
                  style={{ cursor: 'zoom-in' }}
                  onClick={() => setLightboxSrc(receipt.listing.coverImagePath!)}
                  title="Click to enlarge"
                />
              ) : (
                <div className={styles.productFallback}>
                  {receipt.listing.title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className={styles.productText}>
              <span className={styles.productLabel}>Transaction item</span>
              <h3 className={styles.productTitle}>{receipt.listing.title}</h3>
              <p className={styles.productDescription}>
                Sold through {receipt.sourceLabel.toLowerCase()} and tracked in the purchase
                center.
              </p>
            </div>
          </section>

          <section className={styles.breakdown}>
            <div className={styles.breakdownHeader}>
              <h3>Amount breakdown</h3>
              <span>{receipt.currency}</span>
            </div>
            <div className={styles.breakdownRows}>
              {receipt.breakdown.map((item) => (
                <div key={item.label} className={styles.breakdownRow}>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.amount, receipt.currency)}</strong>
                </div>
              ))}
            </div>
          </section>

          {receipt.buyerNote && (
            <section className={styles.noteBlock}>
              <span className={styles.noteLabel}>Buyer note</span>
              <p>{receipt.buyerNote}</p>
            </section>
          )}

          {receipt.deliveryReport && (
            <section className={styles.deliveryReportBlock}>
              <div className={styles.deliveryReportHeader}>
                <div>
                  <span className={styles.noteLabel}>Delivery issue report</span>
                  <strong>{receipt.deliveryReport.statusLabel}</strong>
                </div>
                <span>{formatDateTime(receipt.deliveryReport.createdAt)}</span>
              </div>
              <p>{receipt.deliveryReport.buyerStatement}</p>
              <div className={styles.deliveryReportMeta}>
                {receipt.deliveryReport.paymentReference && (
                  <span>Payment ref: {receipt.deliveryReport.paymentReference}</span>
                )}
                <span>{receipt.deliveryReport.proofUrls.length} proof file(s)</span>
              </div>
            </section>
          )}

          <footer className={styles.footer}>
            <div>
              <span className={styles.footerLabel}>Paid status</span>
              <strong>{receipt.paymentStatusLabel}</strong>
            </div>
            <div>
              <span className={styles.footerLabel}>Delivery</span>
              <strong>{receipt.deliveryStatusLabel}</strong>
            </div>
            <div>
              <span className={styles.footerLabel}>Total</span>
              <strong>{formatCurrency(receipt.totalAmount, receipt.currency)}</strong>
            </div>
          </footer>
        </article>

        <aside className={styles.sideCard}>
          <div className={styles.sideSection}>
            <span className={styles.sideLabel}>Current role</span>
            <strong>{isBuyer ? 'Buyer view' : 'Seller view'}</strong>
            <p className={styles.sideText}>
              {isBuyer
                ? 'After you mark payment as sent, confirm whether the item arrived or report it for customer-service review.'
                : 'You can verify the buyer payment after they mark the receipt as paid, then watch the delivery status.'}
            </p>
          </div>

          {receipt.canBuyerMarkPaid && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}>Confirm payment</h3>
              <p className={styles.sideText}>
                Add optional payment details, then confirm that you sent the money.
              </p>
              <label className={styles.field}>
                <span>Payment method</span>
                <input
                  type="text"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  placeholder="Bank transfer, cash, DuitNow..."
                />
              </label>
              <label className={styles.field}>
                <span>Payment reference</span>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Optional reference number"
                />
              </label>
              <label className={styles.field}>
                <span>Note to seller</span>
                <textarea
                  value={buyerNote}
                  onChange={(event) => setBuyerNote(event.target.value)}
                  rows={4}
                  placeholder="Optional note for the seller"
                />
              </label>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleMarkPaid}
                disabled={actionLoading === 'mark-paid'}
              >
                {actionLoading === 'mark-paid' ? 'Saving...' : 'I Have Paid'}
              </button>
            </div>
          )}

          {receipt.canSellerConfirmPaid && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}>Seller confirmation</h3>
              <p className={styles.sideText}>
                The buyer marked this as paid. Review the payment details above, then confirm if
                you received the money.
              </p>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={handleConfirmPayment}
                disabled={actionLoading === 'confirm-payment'}
              >
                {actionLoading === 'confirm-payment'
                  ? 'Confirming...'
                  : 'Seller Confirmed Payment'}
              </button>
            </div>
          )}

          {isBuyer &&
            (receipt.canBuyerMarkReceived || receipt.canBuyerReportNotReceived) && (
              <div className={styles.sideSection}>
                <h3 className={styles.sideTitle}>Confirm delivery</h3>
                <p className={styles.sideText}>
                  Choose the final delivery result after payment. If the item has not arrived,
                  send the issue to customer service with the receipt details.
                </p>
                <div className={styles.deliveryActions}>
                  {receipt.canBuyerMarkReceived && (
                    <button
                      type="button"
                      className={styles.confirmButton}
                      onClick={handleMarkReceived}
                      disabled={actionLoading === 'mark-received'}
                    >
                      {actionLoading === 'mark-received' ? 'Saving...' : 'Item Received'}
                    </button>
                  )}
                  {receipt.canBuyerReportNotReceived && (
                    <Link href={deliveryIssueHref} className={styles.dangerButton}>
                      Item Not Received
                    </Link>
                  )}
                </div>
              </div>
            )}

          {receipt.deliveryStatus !== 'pending' && (
            <div className={styles.sideSection}>
              <span className={styles.sideLabel}>Delivery result</span>
              <strong>{receipt.deliveryStatusLabel}</strong>
              <p className={styles.sideText}>
                {receipt.deliveryStatus === 'received'
                  ? `${isBuyer ? 'You' : 'The buyer'} confirmed the item arrived.`
                  : `${isBuyer ? 'You reported' : 'The buyer reported'} that the item was not received. Customer service can review the report.`}
              </p>
              {receipt.deliveryMarkedAt && (
                <span className={styles.sideMuted}>
                  Marked {formatDateTime(receipt.deliveryMarkedAt)}
                </span>
              )}
            </div>
          )}

          {!receipt.canBuyerMarkPaid && !receipt.canSellerConfirmPaid && (
            <div className={styles.sideSection}>
              <h3 className={styles.sideTitle}>Receipt progress</h3>
              <div className={styles.timeline}>
                <div className={styles.timelineItem}>
                  <strong>Receipt created</strong>
                  <span>{formatDateTime(receipt.createdAt)}</span>
                </div>
                <div className={styles.timelineItem}>
                  <strong>Buyer marked paid</strong>
                  <span>{formatDateTime(receipt.buyerMarkedPaidAt)}</span>
                </div>
                <div className={styles.timelineItem}>
                  <strong>Seller confirmed</strong>
                  <span>{formatDateTime(receipt.sellerConfirmedPaidAt)}</span>
                </div>
                <div className={styles.timelineItem}>
                  <strong>Buyer delivery status</strong>
                  <span>{receipt.deliveryStatusLabel}</span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <ImageLightbox
        src={lightboxSrc}
        onClose={() => setLightboxSrc(null)}
        alt={receipt?.listing.title}
      />
    </div>
  );
}
