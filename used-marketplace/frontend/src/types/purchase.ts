export type PurchaseReceiptSource = 'offer_acceptance' | 'manual_sale';

export type PurchasePaymentStatus =
  | 'pending'
  | 'buyer_marked_paid'
  | 'seller_confirmed_paid';

export interface PurchaseReceiptParty {
  id: string;
  displayName: string;
  username: string | null;
  avatarPath: string | null;
}

export interface PurchaseReceiptSummary {
  id: string;
  receiptNumber: string;
  source: PurchaseReceiptSource;
  sourceLabel: string;
  offerId: string | null;
  listing: {
    id: string;
    title: string;
    coverImagePath: string | null;
    status: string;
    soldAt: string | null;
    createdAt: string;
  };
  buyer: PurchaseReceiptParty;
  seller: PurchaseReceiptParty;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentStatus: PurchasePaymentStatus;
  paymentStatusLabel: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  buyerNote: string | null;
  buyerMarkedPaidAt: string | null;
  sellerConfirmedPaidAt: string | null;
  createdAt: string;
  updatedAt: string;
  canBuyerMarkPaid: boolean;
  canSellerConfirmPaid: boolean;
}

export interface PurchaseReceiptDetail extends PurchaseReceiptSummary {
  breakdown: Array<{
    label: string;
    amount: number;
  }>;
  paymentFlow: {
    senderLabel: string;
    receiverLabel: string;
  };
}

export interface PurchasesDashboardResponse {
  stats: {
    purchaseCount: number;
    salesCount: number;
    purchasePendingPaymentCount: number;
    salesAwaitingConfirmationCount: number;
  };
  purchases: PurchaseReceiptSummary[];
  sales: PurchaseReceiptSummary[];
}

export interface PurchaseReceiptDetailResponse {
  receipt: PurchaseReceiptDetail;
}
