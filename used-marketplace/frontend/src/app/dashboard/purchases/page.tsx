'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { getPurchases } from '@/src/services/purchaseService';
import type {
  PurchaseReceiptSummary,
  PurchasesDashboardResponse,
} from '@/src/types/purchase';
import { buildPurchaseReportHref } from '@/src/utils/purchaseReportLinks';
import styles from './page.module.css';

type PurchaseTab = 'purchases' | 'sales';

function formatCurrency(amount: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-MY', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

function getPaymentStatusClass(status: PurchaseReceiptSummary['paymentStatus']) {
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

function getDeliveryStatusClass(status: PurchaseReceiptSummary['deliveryStatus']) {
  switch (status) {
    case 'received':
      return styles.statusDeliveryReceived;
    case 'not_received':
      return styles.statusDeliveryIssue;
    case 'pending':
    default:
      return styles.statusDeliveryPending;
  }
}

function getReceiptHint(receipt: PurchaseReceiptSummary, activeTab: PurchaseTab): string {
  if (receipt.deliveryStatus === 'received') {
    return activeTab === 'purchases'
      ? 'You confirmed this item was received.'
      : 'The buyer confirmed this item was received.';
  }

  if (receipt.deliveryStatus === 'not_received') {
    return activeTab === 'purchases'
      ? 'You reported this item as not received. Customer service can review the report.'
      : 'The buyer reported this item as not received. Customer service can review the report.';
  }

  if (receipt.paymentStatus === 'seller_confirmed_paid') {
    return activeTab === 'purchases'
      ? 'Payment has been confirmed. Open the receipt to mark received or report not received.'
      : 'You confirmed that payment was received. Waiting for the buyer delivery result.';
  }

  if (receipt.paymentStatus === 'buyer_marked_paid') {
    return activeTab === 'purchases'
      ? 'You marked this receipt as paid. You can now confirm delivery or report a problem.'
      : 'Buyer says payment was sent. Open the receipt to confirm payment.';
  }

  return activeTab === 'purchases'
    ? 'Open the receipt to confirm payment details and mark this as paid.'
    : 'Open the receipt to review the breakdown and wait for buyer payment.';
}

export default function PurchasesPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<PurchaseTab>('purchases');
  const [data, setData] = useState<PurchasesDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token) {
      return;
    }

    const authToken: string = token;

    let cancelled = false;

    async function loadPurchases() {
      setLoading(true);
      const response = await getPurchases(authToken);

      if (cancelled) {
        return;
      }

      if (response.data) {
        setData(response.data);
        setErrorMsg(null);
      } else {
        setErrorMsg(response.error || 'Failed to load purchase history.');
      }

      setLoading(false);
    }

    void loadPurchases();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const receipts = activeTab === 'purchases' ? data?.purchases ?? [] : data?.sales ?? [];

  if (authLoading || loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>Loading your purchase history...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Purchase Center</p>
          <h1 className={styles.title}>Purchases and receipts</h1>
          <p className={styles.subtitle}>
            Review everything you bought or sold, open a receipt, and keep the payment
            confirmation flow in one place.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href={ROUTES.OFFERS} className={styles.secondaryLink}>
            Offers
          </Link>
          <Link href={ROUTES.MESSAGES} className={styles.primaryLink}>
            Messages
          </Link>
        </div>
      </section>

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Purchases</span>
          <strong className={styles.statValue}>{data?.stats.purchaseCount ?? 0}</strong>
          <p className={styles.statHint}>Completed items you bought</p>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Pending Payment</span>
          <strong className={styles.statValue}>
            {data?.stats.purchasePendingPaymentCount ?? 0}
          </strong>
          <p className={styles.statHint}>Receipts waiting for your payment confirmation</p>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Delivery Pending</span>
          <strong className={styles.statValue}>
            {data?.stats.purchasePendingDeliveryCount ?? 0}
          </strong>
          <p className={styles.statHint}>Paid purchases waiting for your received status</p>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Sales</span>
          <strong className={styles.statValue}>{data?.stats.salesCount ?? 0}</strong>
          <p className={styles.statHint}>Items you sold to another user</p>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statLabel}>Awaiting Seller Action</span>
          <strong className={styles.statValue}>
            {data?.stats.salesAwaitingConfirmationCount ?? 0}
          </strong>
          <p className={styles.statHint}>Sales where the buyer marked payment as sent</p>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.sectionTitle}>History</h2>
            <p className={styles.sectionText}>
              Switch between what you bought and what you sold.
            </p>
          </div>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${
                activeTab === 'purchases' ? styles.tabActive : ''
              }`}
              onClick={() => setActiveTab('purchases')}
            >
              Purchases ({data?.purchases.length ?? 0})
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'sales' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('sales')}
            >
              Sales ({data?.sales.length ?? 0})
            </button>
          </div>
        </div>

        {errorMsg ? (
          <div className={styles.errorBox}>{errorMsg}</div>
        ) : receipts.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>{activeTab === 'purchases' ? 'No purchases yet' : 'No sales receipts yet'}</h3>
            <p>
              {activeTab === 'purchases'
                ? 'Accepted offers and manual sold items will show up here with a receipt as soon as the sale is recorded.'
                : 'Once one of your items is sold, the receipt and payment tracking will appear here.'}
            </p>
          </div>
        ) : (
          <div className={styles.receiptList}>
            {receipts.map((receipt) => {
              const counterparty =
                activeTab === 'purchases' ? receipt.seller : receipt.buyer;
              const receiptHref = `${ROUTES.PURCHASES}/${receipt.id}`;
              const messageHref = buildMessageHref(
                receipt.listing.id,
                counterparty.id,
                counterparty.displayName
              );
              const reportHref = buildPurchaseReportHref(
                receipt,
                activeTab === 'purchases' ? 'purchase' : 'sale'
              );

              return (
                <article key={receipt.id} className={styles.receiptCard}>
                  <Link href={receiptHref} className={styles.imageWrap}>
                    {receipt.listing.coverImagePath ? (
                      <img
                        src={receipt.listing.coverImagePath}
                        alt={receipt.listing.title}
                        className={styles.image}
                      />
                    ) : (
                      <div className={styles.imageFallback}>
                        {receipt.listing.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Link>

                  <div className={styles.cardBody}>
                    <div className={styles.cardTop}>
                      <div>
                        <div className={styles.metaRow}>
                          <span className={styles.metaPill}>{receipt.receiptNumber}</span>
                          <span className={styles.metaPillMuted}>{receipt.sourceLabel}</span>
                          <span className={styles.metaDate}>
                            {formatDate(receipt.listing.soldAt || receipt.createdAt)}
                          </span>
                        </div>
                        <Link href={receiptHref} className={styles.cardTitle}>
                          {receipt.listing.title}
                        </Link>
                        <p className={styles.cardSubtitle}>
                          {activeTab === 'purchases' ? 'Seller' : 'Buyer'}:{' '}
                          <strong>{counterparty.displayName}</strong>
                        </p>
                      </div>
                      <span
                        className={`${styles.statusBadge} ${getPaymentStatusClass(
                          receipt.paymentStatus
                        )}`}
                      >
                        {receipt.paymentStatusLabel}
                      </span>
                      <span
                        className={`${styles.statusBadge} ${getDeliveryStatusClass(
                          receipt.deliveryStatus
                        )}`}
                      >
                        {receipt.deliveryStatusLabel}
                      </span>
                    </div>

                    <div className={styles.amountRow}>
                      <div>
                        <span className={styles.amountLabel}>Total</span>
                        <strong className={styles.amountValue}>
                          {formatCurrency(receipt.totalAmount, receipt.currency)}
                        </strong>
                      </div>
                      <div>
                        <span className={styles.amountLabel}>Tax</span>
                        <strong className={styles.amountValueMuted}>
                          {formatCurrency(receipt.taxAmount, receipt.currency)}
                        </strong>
                      </div>
                    </div>

                    <p className={styles.cardHint}>{getReceiptHint(receipt, activeTab)}</p>

                    <div className={styles.cardActions}>
                      <Link href={receiptHref} className={styles.primaryButton}>
                        View Receipt
                      </Link>
                      <Link href={messageHref} className={styles.secondaryButton}>
                        Message {activeTab === 'purchases' ? 'Seller' : 'Buyer'}
                      </Link>
                      <Link href={reportHref} className={styles.reportButton}>
                        File Report
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
