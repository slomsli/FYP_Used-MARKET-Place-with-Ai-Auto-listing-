import type {
  PurchaseDeliveryStatus,
  PurchasePaymentStatus,
} from '@/src/types/purchase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/* ── Types ─────────────────────────────────────────────── */

export type OfferKind = 'purchase_request' | 'offer' | 'counter_offer';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'withdrawn';

export type DeliveryIssueStatus = 'pending' | 'reviewed' | 'resolved' | 'rejected';

export interface OfferReviewSellerResponse {
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfferReviewSummary {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  sellerResponse: OfferReviewSellerResponse | null;
}

export interface OfferDeliveryIssueSummary {
  reportId: string;
  status: DeliveryIssueStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  paymentReference: string | null;
  agreedPriceLabel: string | null;
  proofUrls: string[];
  buyerStatement: string;
}

export interface OfferPurchaseReceiptSummary {
  id: string;
  receiptNumber: string;
  paymentStatus: PurchasePaymentStatus;
  paymentStatusLabel: string;
  deliveryStatus: PurchaseDeliveryStatus;
  deliveryStatusLabel: string;
  deliveryMarkedAt: string | null;
  totalAmount: number;
  currency: string;
  buyerMarkedPaidAt: string | null;
  sellerConfirmedPaidAt: string | null;
}

export interface OfferSaleFollowUp {
  canBuyerConfirmReceived: boolean;
  canBuyerReportNotReceived: boolean;
  review: OfferReviewSummary | null;
  deliveryIssue: OfferDeliveryIssueSummary | null;
  receipt: OfferPurchaseReceiptSummary | null;
}

export interface OfferSummary {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerPrice: number;
  askingPrice: number;
  message: string | null;
  status: OfferStatus;
  offerKind: OfferKind;
  parentOfferId: string | null;
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    title: string;
    coverImagePath: string | null;
    currency: string;
    negotiable: boolean;
    status: string;
    categoryName: string | null;
  };
  buyer: {
    id: string;
    displayName: string;
    avatarPath: string | null;
    identityVerificationBadge: boolean;
  };
  seller: {
    id: string;
    displayName: string;
    avatarPath: string | null;
    identityVerificationBadge: boolean;
  };
  saleFollowUp: OfferSaleFollowUp | null;
}

export interface OffersPageResponse {
  receivedCount: number;
  sentCount: number;
  offers: OfferSummary[];
}

interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

interface ApiResult {
  success?: boolean;
  data?: unknown;
  error?: string;
}

export interface DeliveryIssueProofPayload {
  fileName: string;
  contentType: string;
  base64Data: string;
}

/* ── Helpers ───────────────────────────────────────────── */

async function parseJsonResponse(response: Response): Promise<ApiResult | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function authorizedRequest<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<ServiceResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });

    const result = await parseJsonResponse(response);

    if (response.ok && result?.success) {
      return {
        data: (result.data ?? null) as T | null,
        error: null,
      };
    }

    return {
      data: null,
      error: result?.error || `Request failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/* ── API functions ─────────────────────────────────────── */

/**
 * Get received offers for the current user (as seller).
 */
export async function getReceivedOffers(
  token: string
): Promise<ServiceResponse<OffersPageResponse>> {
  return authorizedRequest<OffersPageResponse>(
    '/api/dashboard/offers/received',
    token,
    { method: 'GET' }
  );
}

/**
 * Get sent offers for the current user (as buyer).
 */
export async function getSentOffers(
  token: string
): Promise<ServiceResponse<OffersPageResponse>> {
  return authorizedRequest<OffersPageResponse>(
    '/api/dashboard/offers/sent',
    token,
    { method: 'GET' }
  );
}

/**
 * Create a new offer or purchase request.
 */
export async function createOffer(
  token: string,
  payload: {
    listingId: string;
    offerPrice: number;
    message?: string;
    offerKind: OfferKind;
  }
): Promise<ServiceResponse<OfferSummary>> {
  return authorizedRequest<OfferSummary>(
    '/api/dashboard/offers',
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

/**
 * Accept an offer (as seller).
 */
export async function acceptOffer(
  token: string,
  offerId: string
): Promise<ServiceResponse<OfferSummary>> {
  return authorizedRequest<OfferSummary>(
    `/api/dashboard/offers/${offerId}/accept`,
    token,
    { method: 'PATCH' }
  );
}

/**
 * Reject an offer (as seller).
 */
export async function rejectOffer(
  token: string,
  offerId: string
): Promise<ServiceResponse<OfferSummary>> {
  return authorizedRequest<OfferSummary>(
    `/api/dashboard/offers/${offerId}/reject`,
    token,
    { method: 'PATCH' }
  );
}

/**
 * Cancel own pending offer (as buyer).
 */
export async function cancelOffer(
  token: string,
  offerId: string
): Promise<ServiceResponse<OfferSummary>> {
  return authorizedRequest<OfferSummary>(
    `/api/dashboard/offers/${offerId}/cancel`,
    token,
    { method: 'PATCH' }
  );
}

/**
 * Counter an offer (as seller) — creates a new linked offer row.
 */
export async function counterOffer(
  token: string,
  offerId: string,
  payload: { counterPrice: number; message?: string }
): Promise<ServiceResponse<OfferSummary>> {
  return authorizedRequest<OfferSummary>(
    `/api/dashboard/offers/${offerId}/counter`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function submitBuyerReview(
  token: string,
  offerId: string,
  payload: { rating: number; comment?: string }
): Promise<ServiceResponse<OfferReviewSummary>> {
  return authorizedRequest<OfferReviewSummary>(
    `/api/dashboard/offers/${offerId}/review`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function submitSellerReviewResponse(
  token: string,
  offerId: string,
  payload: { response: string }
): Promise<ServiceResponse<OfferReviewSummary>> {
  return authorizedRequest<OfferReviewSummary>(
    `/api/dashboard/offers/${offerId}/review-response`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function reportItemNotReceived(
  token: string,
  offerId: string,
  payload: {
    buyerStatement: string;
    paymentReference?: string;
    proofs?: DeliveryIssueProofPayload[];
  }
): Promise<ServiceResponse<OfferDeliveryIssueSummary>> {
  return authorizedRequest<OfferDeliveryIssueSummary>(
    `/api/dashboard/offers/${offerId}/not-received`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}
