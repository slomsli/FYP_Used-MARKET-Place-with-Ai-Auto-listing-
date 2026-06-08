import { ROUTES } from '@/src/config/routes';
import type { PurchaseReceiptSummary } from '@/src/types/purchase';

export type PurchaseReportScope = 'purchase' | 'sale';

function formatCurrency(amount: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function applyReceiptContext(params: URLSearchParams, receipt: PurchaseReceiptSummary) {
  params.set('listingId', receipt.listing.id);
  params.set('receiptId', receipt.id);
  params.set('orderId', receipt.receiptNumber);
  params.set('title', receipt.listing.title);
  params.set('amount', formatCurrency(receipt.totalAmount, receipt.currency));

  if (receipt.offerId) {
    params.set('offerId', receipt.offerId);
  }

  if (receipt.paymentReference) {
    params.set('paymentReference', receipt.paymentReference);
  }
}

export function buildPurchaseReportHref(
  receipt: PurchaseReceiptSummary,
  scope: PurchaseReportScope
) {
  const params = new URLSearchParams({
    scope,
    source: scope === 'purchase' ? 'purchases' : 'sales',
  });

  applyReceiptContext(params, receipt);

  if (scope === 'purchase') {
    params.set('seller', receipt.seller.displayName);
  } else {
    params.set('buyer', receipt.buyer.displayName);
  }

  return `${ROUTES.REPORT}?${params.toString()}`;
}

export function buildDeliveryIssueReportHref(receipt: PurchaseReceiptSummary) {
  const params = new URLSearchParams({
    scope: 'delivery',
    source: 'purchases',
    seller: receipt.seller.displayName,
  });

  applyReceiptContext(params, receipt);

  return `${ROUTES.REPORT}?${params.toString()}`;
}
