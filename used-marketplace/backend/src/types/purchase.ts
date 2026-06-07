export type PurchaseReceiptSource = 'offer_acceptance' | 'manual_sale';

export type PurchasePaymentStatus =
  | 'pending'
  | 'buyer_marked_paid'
  | 'seller_confirmed_paid';

export type PurchaseDeliveryStatus =
  | 'pending'
  | 'received'
  | 'not_received';

export interface PurchaseReceiptParty {
  id: string;
  displayName: string;
  username: string | null;
  avatarPath: string | null;
}

export interface PurchaseDeliveryIssueSummary {
  reportId: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  paymentReference: string | null;
  agreedPriceLabel: string | null;
  proofUrls: string[];
  buyerStatement: string;
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
  deliveryStatus: PurchaseDeliveryStatus;
  deliveryStatusLabel: string;
  deliveryMarkedAt: string | null;
  deliveryReport: PurchaseDeliveryIssueSummary | null;
  createdAt: string;
  updatedAt: string;
  canBuyerMarkPaid: boolean;
  canSellerConfirmPaid: boolean;
  canBuyerMarkReceived: boolean;
  canBuyerReportNotReceived: boolean;
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
    purchasePendingDeliveryCount: number;
    salesAwaitingConfirmationCount: number;
  };
  purchases: PurchaseReceiptSummary[];
  sales: PurchaseReceiptSummary[];
}

export interface PurchaseReceiptDetailResponse {
  receipt: PurchaseReceiptDetail;
}

export interface MarkPurchasePaidInput {
  paymentMethod?: string;
  paymentReference?: string;
  buyerNote?: string;
}

export interface DeliveryIssueProofInput {
  fileName: string;
  contentType: string;
  base64Data: string;
}

export interface ReportPurchaseDeliveryIssueInput {
  buyerStatement?: string;
  paymentReference?: string;
  proofs?: DeliveryIssueProofInput[];
}
