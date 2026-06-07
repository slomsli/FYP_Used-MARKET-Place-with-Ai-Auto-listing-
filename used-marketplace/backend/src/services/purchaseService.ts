import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import type {
  DeliveryIssueProofInput,
  MarkPurchasePaidInput,
  PurchaseDeliveryIssueSummary,
  PurchaseDeliveryStatus,
  PurchasePaymentStatus,
  PurchaseReceiptDetail,
  PurchaseReceiptDetailResponse,
  PurchaseReceiptSource,
  PurchaseReceiptSummary,
  PurchasesDashboardResponse,
  ReportPurchaseDeliveryIssueInput,
} from '../types/purchase';
import { REPORT_STATUS_LABELS, type ReportStatus } from '../types/report';
import {
  buildDeliveryDisputeDetails,
  parseDeliveryDisputeDetails,
} from '../utils/deliveryDispute';
import { buildDisplayName } from '../utils/profile';
import { type Relation, unwrapRelation } from '../utils/relation';
import { createNotification } from './notificationService';
import { getPublicStorageUrl, removeStorageObjects } from '../utils/storage';
import { sanitizeStorageFileName } from '../utils/storageFile';
import {
  AVATAR_BUCKET,
  DELIVERY_PROOF_BUCKET,
  LISTING_IMAGE_BUCKET,
} from '../utils/storageBuckets';
import { toNumber, trimOptional } from '../utils/value';

interface RawProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
}

interface RawListingReference {
  id: string;
  title: string;
  cover_image_path: string | null;
  status: string;
  deleted_at: string | null;
  sold_at: string | null;
  created_at: string;
}

interface RawDeliveryReport {
  id: string;
  status: ReportStatus;
  details: string | null;
  created_at: string;
  updated_at: string;
}

interface RawReceiptRow {
  id: string;
  receipt_number: string;
  source: PurchaseReceiptSource;
  offer_id: string | null;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  subtotal_amount: unknown;
  tax_amount: unknown;
  total_amount: unknown;
  currency: string;
  payment_status: PurchasePaymentStatus;
  payment_method: string | null;
  payment_reference: string | null;
  buyer_note: string | null;
  buyer_marked_paid_at: string | null;
  seller_confirmed_paid_at: string | null;
  delivery_status: PurchaseDeliveryStatus;
  delivery_marked_at: string | null;
  delivery_report_id: string | null;
  created_at: string;
  updated_at: string;
  listings: Relation<RawListingReference>;
  buyer_profile: Relation<RawProfile>;
  seller_profile: Relation<RawProfile>;
}

interface RawAcceptedOfferCandidate {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price: unknown;
  created_at: string;
  updated_at: string;
  listings: Relation<{
    id: string;
    title: string;
    price: unknown;
    currency: string;
    cover_image_path: string | null;
    status: string;
    deleted_at: string | null;
    sold_at: string | null;
    created_at: string;
    sold_to_user_id: string | null;
  }>;
}

interface RawManualSaleCandidate {
  id: string;
  seller_id: string;
  sold_to_user_id: string | null;
  title: string;
  price: unknown;
  currency: string;
  cover_image_path: string | null;
  status: string;
  deleted_at: string | null;
  sold_at: string | null;
  created_at: string;
}

interface ReceiptInsertRow {
  id: string;
  receipt_number: string;
  source: PurchaseReceiptSource;
  offer_id: string | null;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  payment_status: PurchasePaymentStatus;
  payment_method: string | null;
  payment_reference: string | null;
  buyer_note: string | null;
  buyer_marked_paid_at: string | null;
  seller_confirmed_paid_at: string | null;
  delivery_status: PurchaseDeliveryStatus;
  delivery_marked_at: string | null;
  delivery_report_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

let hasWarnedMissingPurchaseReceiptsTable = false;
const PURCHASE_RECEIPT_BACKFILL_ATTEMPT_TTL_MS = 60 * 60 * 1000;
const purchaseReceiptBackfillAttemptedUsers = new Map<string, number>();
const MAX_DELIVERY_PROOF_SIZE_BYTES = 4 * 1024 * 1024;
const DELIVERY_PROOF_MIME_TYPES = ['image/*'];
let deliveryProofBucketPromise: Promise<void> | null = null;

interface UploadedDeliveryProof {
  publicUrl: string;
  storagePath: string;
}

const RECEIPT_SELECT = `
  id,
  receipt_number,
  source,
  offer_id,
  listing_id,
  buyer_id,
  seller_id,
  subtotal_amount,
  tax_amount,
  total_amount,
  currency,
  payment_status,
  payment_method,
  payment_reference,
  buyer_note,
  buyer_marked_paid_at,
  seller_confirmed_paid_at,
  delivery_status,
  delivery_marked_at,
  delivery_report_id,
  created_at,
  updated_at,
  listings!purchase_receipts_listing_id_fkey (
    id,
    title,
    cover_image_path,
    status,
    deleted_at,
    sold_at,
    created_at
  ),
  buyer_profile:profiles!purchase_receipts_buyer_id_fkey (
    id,
    username,
    full_name,
    avatar_path
  ),
  seller_profile:profiles!purchase_receipts_seller_id_fkey (
    id,
    username,
    full_name,
    avatar_path
  )
`;

export class PurchaseServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PurchaseServiceError';
    this.status = status;
  }
}

export function isPurchaseReceiptsTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const postgrestError = error as PostgrestLikeError;
  return (
    postgrestError.code === 'PGRST205' &&
    /purchase_receipts/i.test(postgrestError.message ?? '')
  );
}

function warnMissingPurchaseReceiptsTable(error: unknown): void {
  if (hasWarnedMissingPurchaseReceiptsTable) {
    return;
  }

  hasWarnedMissingPurchaseReceiptsTable = true;
  console.warn(
    '[Purchases] purchase_receipts table is missing. Run the SQL migration for purchase receipts to enable this feature.',
    error
  );
}

function buildMissingPurchaseReceiptsTableError(): PurchaseServiceError {
  return new PurchaseServiceError(
    'Purchase receipts are not ready yet. Run the purchase_receipts SQL migration first.',
    503
  );
}

function buildReceiptNumber(timestamp = new Date()): string {
  const dateToken = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
  return `RCT-${dateToken}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function buildSaleKey(listingId: string, buyerId: string, sellerId: string): string {
  return `${listingId}::${buyerId}::${sellerId}`;
}

function cleanupExpiredBackfillAttempts(now = Date.now()): void {
  for (const [userId, expiresAt] of purchaseReceiptBackfillAttemptedUsers.entries()) {
    if (expiresAt <= now) {
      purchaseReceiptBackfillAttemptedUsers.delete(userId);
    }
  }
}

function hasRecentBackfillAttempt(userId: string): boolean {
  const now = Date.now();
  cleanupExpiredBackfillAttempts(now);

  const expiresAt = purchaseReceiptBackfillAttemptedUsers.get(userId);
  return typeof expiresAt === 'number' && expiresAt > now;
}

function markBackfillAttempt(userId: string): void {
  cleanupExpiredBackfillAttempts();
  purchaseReceiptBackfillAttemptedUsers.set(
    userId,
    Date.now() + PURCHASE_RECEIPT_BACKFILL_ATTEMPT_TTL_MS
  );
}

function getSourceLabel(source: PurchaseReceiptSource): string {
  return source === 'manual_sale' ? 'Manual sale' : 'Accepted offer';
}

function getPaymentStatusLabel(status: PurchasePaymentStatus): string {
  switch (status) {
    case 'buyer_marked_paid':
      return 'Waiting for seller confirmation';
    case 'seller_confirmed_paid':
      return 'Paid';
    case 'pending':
    default:
      return 'Not paid yet';
  }
}

function getDeliveryStatusLabel(status: PurchaseDeliveryStatus): string {
  switch (status) {
    case 'received':
      return 'Item received';
    case 'not_received':
      return 'Item not received';
    case 'pending':
    default:
      return 'Waiting for buyer confirmation';
  }
}

function hasBuyerMarkedPaymentSent(status: PurchasePaymentStatus): boolean {
  return status === 'buyer_marked_paid' || status === 'seller_confirmed_paid';
}

function formatCurrency(value: number, currency = 'MYR'): string {
  try {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

function toSingleLineNotificationText(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function mapDeliveryIssue(report: RawDeliveryReport | null): PurchaseDeliveryIssueSummary | null {
  if (!report) {
    return null;
  }

  const parsedDetails = parseDeliveryDisputeDetails(report.details);
  if (!parsedDetails) {
    return null;
  }

  return {
    reportId: report.id,
    status: report.status,
    statusLabel: REPORT_STATUS_LABELS[report.status] ?? report.status,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    paymentReference: parsedDetails.paymentReference,
    agreedPriceLabel: parsedDetails.agreedPriceLabel,
    proofUrls: parsedDetails.proofUrls,
    buyerStatement: parsedDetails.buyerStatement,
  };
}

function buildDeliveryIssueBuyerStatement(
  buyerStatement: string,
  existingReportDetails: string | null | undefined
): string {
  const previousDetails = trimOptional(existingReportDetails);

  if (!previousDetails || parseDeliveryDisputeDetails(previousDetails)) {
    return buyerStatement;
  }

  return `${buyerStatement}\n\nPrevious report details:\n${previousDetails}`;
}

function buildReceiptInsertRow(input: {
  source: PurchaseReceiptSource;
  offerId?: string | null;
  listingId: string;
  buyerId: string;
  sellerId: string;
  subtotalAmount: number;
  taxAmount?: number;
  totalAmount?: number;
  currency: string;
  createdAt: string;
}): ReceiptInsertRow {
  const taxAmount = Math.max(toNumber(input.taxAmount), 0);
  const subtotalAmount = Math.max(toNumber(input.subtotalAmount), 0);
  const totalAmount = Math.max(
    toNumber(input.totalAmount, subtotalAmount + taxAmount),
    subtotalAmount + taxAmount
  );

  return {
    id: randomUUID(),
    receipt_number: buildReceiptNumber(new Date(input.createdAt)),
    source: input.source,
    offer_id: input.offerId ?? null,
    listing_id: input.listingId,
    buyer_id: input.buyerId,
    seller_id: input.sellerId,
    subtotal_amount: subtotalAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    currency: trimOptional(input.currency, 10) || 'MYR',
    payment_status: 'pending',
    payment_method: null,
    payment_reference: null,
    buyer_note: null,
    buyer_marked_paid_at: null,
    seller_confirmed_paid_at: null,
    delivery_status: 'pending',
    delivery_marked_at: null,
    delivery_report_id: null,
    created_at: input.createdAt,
    updated_at: input.createdAt,
  };
}

function mapReceiptSummary(
  row: RawReceiptRow,
  currentUserId: string,
  deliveryReportRow: RawDeliveryReport | null = null
): PurchaseReceiptSummary {
  const listing = unwrapRelation(row.listings);
  const buyerProfile = unwrapRelation(row.buyer_profile);
  const sellerProfile = unwrapRelation(row.seller_profile);
  const paymentStatus = row.payment_status as PurchasePaymentStatus;
  const deliveryStatus = (row.delivery_status ?? 'pending') as PurchaseDeliveryStatus;
  const deliveryReport = mapDeliveryIssue(deliveryReportRow);
  const canBuyerActOnDelivery =
    row.buyer_id === currentUserId &&
    hasBuyerMarkedPaymentSent(paymentStatus) &&
    deliveryStatus === 'pending';

  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    source: row.source,
    sourceLabel: getSourceLabel(row.source),
    offerId: row.offer_id,
    listing: {
      id: listing?.id ?? row.listing_id,
      title: listing?.title ?? 'Listing',
      coverImagePath: getPublicStorageUrl(LISTING_IMAGE_BUCKET, listing?.cover_image_path ?? null),
      status: listing?.status ?? 'sold',
      soldAt: listing?.sold_at ?? null,
      createdAt: listing?.created_at ?? row.created_at,
    },
    buyer: {
      id: row.buyer_id,
      displayName: buildDisplayName(buyerProfile, 'Marketplace User'),
      username: buyerProfile?.username ?? null,
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, buyerProfile?.avatar_path ?? null),
    },
    seller: {
      id: row.seller_id,
      displayName: buildDisplayName(sellerProfile, 'Marketplace User'),
      username: sellerProfile?.username ?? null,
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, sellerProfile?.avatar_path ?? null),
    },
    currency: row.currency || 'MYR',
    subtotalAmount: toNumber(row.subtotal_amount),
    taxAmount: toNumber(row.tax_amount),
    totalAmount: toNumber(row.total_amount),
    paymentStatus,
    paymentStatusLabel: getPaymentStatusLabel(paymentStatus),
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    buyerNote: row.buyer_note,
    buyerMarkedPaidAt: row.buyer_marked_paid_at,
    sellerConfirmedPaidAt: row.seller_confirmed_paid_at,
    deliveryStatus,
    deliveryStatusLabel: getDeliveryStatusLabel(deliveryStatus),
    deliveryMarkedAt: row.delivery_marked_at,
    deliveryReport,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canBuyerMarkPaid: row.buyer_id === currentUserId && paymentStatus === 'pending',
    canSellerConfirmPaid:
      row.seller_id === currentUserId && paymentStatus === 'buyer_marked_paid',
    canBuyerMarkReceived: canBuyerActOnDelivery,
    canBuyerReportNotReceived: canBuyerActOnDelivery,
  };
}

function mapReceiptDetail(
  row: RawReceiptRow,
  currentUserId: string,
  deliveryReportRow: RawDeliveryReport | null = null
): PurchaseReceiptDetailResponse {
  const summary = mapReceiptSummary(row, currentUserId, deliveryReportRow);

  return {
    receipt: {
      ...summary,
      breakdown: [
        {
          label: 'Item subtotal',
          amount: summary.subtotalAmount,
        },
        {
          label: 'Tax',
          amount: summary.taxAmount,
        },
        {
          label: 'Total',
          amount: summary.totalAmount,
        },
      ],
      paymentFlow: {
        senderLabel: summary.buyer.displayName,
        receiverLabel: summary.seller.displayName,
      },
    },
  };
}

async function insertReceiptRows(rows: ReceiptInsertRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from('purchase_receipts').insert(rows);

  if (error) {
    if (isPurchaseReceiptsTableMissingError(error)) {
      warnMissingPurchaseReceiptsTable(error);
      return;
    }

    console.error('[Purchases] Failed to insert purchase receipts:', error);
    throw new PurchaseServiceError('Unable to create purchase receipts', 500);
  }
}

async function ensureDeliveryProofBucket(): Promise<void> {
  if (!deliveryProofBucketPromise) {
    deliveryProofBucketPromise = (async () => {
      const bucketResult = await supabaseAdmin.storage.getBucket(DELIVERY_PROOF_BUCKET);

      if (bucketResult.data) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          DELIVERY_PROOF_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_DELIVERY_PROOF_SIZE_BYTES,
            allowedMimeTypes: DELIVERY_PROOF_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Purchases] Failed to update delivery proof bucket:', updateError);
          throw new PurchaseServiceError('Unable to prepare delivery proof storage', 500);
        }

        return;
      }

      const bucketErrorMessage = bucketResult.error?.message ?? '';
      const isMissingBucketError = /not found|does not exist|404/i.test(bucketErrorMessage);
      if (bucketResult.error && !isMissingBucketError) {
        console.error('[Purchases] Failed to inspect delivery proof bucket:', bucketResult.error);
        throw new PurchaseServiceError('Unable to prepare delivery proof storage', 500);
      }

      const { error: createError } = await supabaseAdmin.storage.createBucket(
        DELIVERY_PROOF_BUCKET,
        {
          public: true,
          fileSizeLimit: MAX_DELIVERY_PROOF_SIZE_BYTES,
          allowedMimeTypes: DELIVERY_PROOF_MIME_TYPES,
        }
      );

      if (createError && !/already exists/i.test(createError.message)) {
        console.error('[Purchases] Failed to create delivery proof bucket:', createError);
        throw new PurchaseServiceError('Unable to prepare delivery proof storage', 500);
      }

      if (createError) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          DELIVERY_PROOF_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_DELIVERY_PROOF_SIZE_BYTES,
            allowedMimeTypes: DELIVERY_PROOF_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Purchases] Failed to sync delivery proof bucket settings:', updateError);
          throw new PurchaseServiceError('Unable to prepare delivery proof storage', 500);
        }
      }
    })().catch((error) => {
      deliveryProofBucketPromise = null;
      throw error;
    });
  }

  return deliveryProofBucketPromise;
}

async function uploadDeliveryProofs(
  buyerId: string,
  proofs: DeliveryIssueProofInput[]
): Promise<UploadedDeliveryProof[]> {
  if (proofs.length === 0) {
    return [];
  }

  await ensureDeliveryProofBucket();

  const uploadedProofs: UploadedDeliveryProof[] = [];

  for (const proof of proofs) {
    const fileName = trimOptional(proof.fileName);
    const contentType = trimOptional(proof.contentType);
    const base64Data = trimOptional(proof.base64Data)?.replace(/\s/g, '');

    if (!fileName || !contentType || !base64Data) {
      throw new PurchaseServiceError(
        'Each proof must include fileName, contentType, and base64Data',
        422
      );
    }

    if (!contentType.startsWith('image/')) {
      throw new PurchaseServiceError('Only image proofs are supported right now', 422);
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(base64Data, 'base64');
    } catch {
      throw new PurchaseServiceError('One of the proof files could not be read', 422);
    }

    if (fileBuffer.length === 0) {
      throw new PurchaseServiceError('One of the proof files was empty', 422);
    }

    if (fileBuffer.length > MAX_DELIVERY_PROOF_SIZE_BYTES) {
      throw new PurchaseServiceError('Each proof image must be 4 MB or smaller', 422);
    }

    const storagePath = `delivery-proofs/${buyerId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeStorageFileName(
      fileName,
      'proof'
    )}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(DELIVERY_PROOF_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[Purchases] Failed to upload delivery proof:', uploadError);
      throw new PurchaseServiceError('Unable to upload one of the proof images', 500);
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(DELIVERY_PROOF_BUCKET).getPublicUrl(storagePath);

    if (!publicUrl) {
      throw new PurchaseServiceError('Unable to generate a proof image URL', 500);
    }

    uploadedProofs.push({
      publicUrl,
      storagePath,
    });
  }

  return uploadedProofs;
}

async function loadReceiptRowForUser(
  userId: string,
  receiptId: string
): Promise<RawReceiptRow> {
  const normalizedReceiptId = trimOptional(receiptId);

  if (!normalizedReceiptId) {
    throw new PurchaseServiceError('Receipt was not found', 404);
  }

  const { data, error } = await supabaseAdmin
    .from('purchase_receipts')
    .select(RECEIPT_SELECT)
    .eq('id', normalizedReceiptId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    if (isPurchaseReceiptsTableMissingError(error)) {
      warnMissingPurchaseReceiptsTable(error);
      throw buildMissingPurchaseReceiptsTableError();
    }

    console.error('[Purchases] Failed to load receipt:', error);
    throw new PurchaseServiceError('Unable to load the selected receipt', 500);
  }

  if (!data) {
    throw new PurchaseServiceError('Receipt was not found', 404);
  }

  const receipt = data as RawReceiptRow;
  const listing = unwrapRelation(receipt.listings);

  if (!listing || listing.deleted_at !== null) {
    throw new PurchaseServiceError('Receipt was not found', 404);
  }

  return receipt;
}

async function getDeliveryReportMapForReceipts(
  receipts: RawReceiptRow[]
): Promise<Map<string, RawDeliveryReport>> {
  const reportIds = Array.from(
    new Set(
      receipts
        .map((receipt) => receipt.delivery_report_id)
        .filter((reportId): reportId is string => Boolean(reportId))
    )
  );

  if (reportIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('id, status, details, created_at, updated_at')
    .in('id', reportIds);

  if (error) {
    console.error('[Purchases] Failed to load linked delivery reports:', error);
    return new Map();
  }

  return new Map(
    ((data ?? []) as RawDeliveryReport[]).map((report) => [report.id, report])
  );
}

async function getDeliveryReportForReceipt(
  receipt: RawReceiptRow
): Promise<RawDeliveryReport | null> {
  const reportMap = await getDeliveryReportMapForReceipts([receipt]);
  return receipt.delivery_report_id
    ? reportMap.get(receipt.delivery_report_id) ?? null
    : null;
}

async function backfillAcceptedOfferReceiptsForUser(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('offers')
    .select(`
      id,
      listing_id,
      buyer_id,
      seller_id,
      offer_price,
      created_at,
      updated_at,
      listings!offers_listing_id_fkey (
        id,
        title,
        price,
        currency,
        cover_image_path,
        status,
        deleted_at,
        sold_at,
        created_at,
        sold_to_user_id
      )
    `)
    .eq('status', 'accepted')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  if (error) {
    console.error('[Purchases] Failed to inspect accepted offers for receipt backfill:', error);
    throw new PurchaseServiceError('Unable to prepare purchase history', 500);
  }

  const offers = (data ?? []) as RawAcceptedOfferCandidate[];
  const qualifyingOffers = offers.filter((offer) => {
    const listing = unwrapRelation(offer.listings);
    return (
      listing !== null &&
      listing.deleted_at === null &&
      listing.status === 'sold' &&
      listing.sold_to_user_id === offer.buyer_id
    );
  });

  if (qualifyingOffers.length === 0) {
    return new Set<string>();
  }

  const saleKeySet = new Set(
    qualifyingOffers.map((offer) => buildSaleKey(offer.listing_id, offer.buyer_id, offer.seller_id))
  );
  const offerIds = qualifyingOffers.map((offer) => offer.id);
  const { data: existingReceipts, error: existingReceiptsError } = await supabaseAdmin
    .from('purchase_receipts')
    .select('offer_id')
    .in('offer_id', offerIds);

  if (existingReceiptsError) {
    if (isPurchaseReceiptsTableMissingError(existingReceiptsError)) {
      warnMissingPurchaseReceiptsTable(existingReceiptsError);
      return saleKeySet;
    }

    console.error('[Purchases] Failed to inspect existing offer receipts:', existingReceiptsError);
    throw new PurchaseServiceError('Unable to prepare purchase history', 500);
  }

  const existingOfferIdSet = new Set(
    ((existingReceipts ?? []) as Array<{ offer_id: string | null }>)
      .map((receipt) => receipt.offer_id)
      .filter((offerId): offerId is string => Boolean(offerId))
  );

  const rows = qualifyingOffers
    .filter((offer) => !existingOfferIdSet.has(offer.id))
    .map((offer) => {
      const listing = unwrapRelation(offer.listings)!;

      return buildReceiptInsertRow({
        source: 'offer_acceptance',
        offerId: offer.id,
        listingId: offer.listing_id,
        buyerId: offer.buyer_id,
        sellerId: offer.seller_id,
        subtotalAmount: toNumber(offer.offer_price),
        currency: listing.currency || 'MYR',
        createdAt: listing.sold_at ?? offer.updated_at ?? offer.created_at,
      });
    });

  await insertReceiptRows(rows);

  return saleKeySet;
}

async function backfillManualSaleReceiptsForUser(
  userId: string,
  acceptedSaleKeySet: Set<string>
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(`
      id,
      seller_id,
      sold_to_user_id,
      title,
      price,
      currency,
      cover_image_path,
      status,
      sold_at,
      created_at
    `)
    .eq('status', 'sold')
    .not('sold_to_user_id', 'is', null)
    .is('deleted_at', null)
    .or(`seller_id.eq.${userId},sold_to_user_id.eq.${userId}`);

  if (error) {
    console.error('[Purchases] Failed to inspect manual sold listings for receipt backfill:', error);
    throw new PurchaseServiceError('Unable to prepare sale history', 500);
  }

  const soldListings = (data ?? []) as RawManualSaleCandidate[];

  if (soldListings.length === 0) {
    return;
  }

  const soldListingIds = soldListings.map((listing) => listing.id);
  const { data: existingManualReceipts, error: existingManualReceiptsError } = await supabaseAdmin
    .from('purchase_receipts')
    .select('listing_id, buyer_id, seller_id')
    .eq('source', 'manual_sale')
    .in('listing_id', soldListingIds);

  if (existingManualReceiptsError) {
    if (isPurchaseReceiptsTableMissingError(existingManualReceiptsError)) {
      warnMissingPurchaseReceiptsTable(existingManualReceiptsError);
      return;
    }

    console.error('[Purchases] Failed to inspect manual receipts:', existingManualReceiptsError);
    throw new PurchaseServiceError('Unable to prepare sale history', 500);
  }

  const existingManualReceiptKeySet = new Set(
    ((existingManualReceipts ?? []) as Array<{
      listing_id: string;
      buyer_id: string;
      seller_id: string;
    }>).map((receipt) => buildSaleKey(receipt.listing_id, receipt.buyer_id, receipt.seller_id))
  );

  const rows = soldListings
    .filter((listing) => Boolean(listing.sold_to_user_id))
    .filter((listing) => {
      const saleKey = buildSaleKey(
        listing.id,
        listing.sold_to_user_id as string,
        listing.seller_id
      );

      return !acceptedSaleKeySet.has(saleKey) && !existingManualReceiptKeySet.has(saleKey);
    })
    .map((listing) =>
      buildReceiptInsertRow({
        source: 'manual_sale',
        listingId: listing.id,
        buyerId: listing.sold_to_user_id as string,
        sellerId: listing.seller_id,
        subtotalAmount: toNumber(listing.price),
        currency: listing.currency || 'MYR',
        createdAt: listing.sold_at ?? listing.created_at,
      })
    );

  await insertReceiptRows(rows);
}

export async function backfillPurchaseReceiptsForUser(userId: string): Promise<void> {
  const acceptedSaleKeySet = await backfillAcceptedOfferReceiptsForUser(userId);
  await backfillManualSaleReceiptsForUser(userId, acceptedSaleKeySet);
}

async function maybeBackfillPurchaseReceiptsForUser(userId: string): Promise<void> {
  const normalizedUserId = trimOptional(userId);

  if (!normalizedUserId || hasRecentBackfillAttempt(normalizedUserId)) {
    return;
  }

  markBackfillAttempt(normalizedUserId);

  try {
    await backfillPurchaseReceiptsForUser(normalizedUserId);
  } catch (error) {
    purchaseReceiptBackfillAttemptedUsers.delete(normalizedUserId);
    throw error;
  }
}

export async function ensurePurchaseReceiptForAcceptedOffer(offerId: string): Promise<void> {
  const normalizedOfferId = trimOptional(offerId);

  if (!normalizedOfferId) {
    return;
  }

  const { data: existingReceipt, error: existingReceiptError } = await supabaseAdmin
    .from('purchase_receipts')
    .select('id')
    .eq('offer_id', normalizedOfferId)
    .maybeSingle();

  if (existingReceiptError) {
    if (isPurchaseReceiptsTableMissingError(existingReceiptError)) {
      warnMissingPurchaseReceiptsTable(existingReceiptError);
      return;
    }

    console.error('[Purchases] Failed to inspect existing accepted-offer receipt:', existingReceiptError);
    throw new PurchaseServiceError('Unable to prepare sale receipt', 500);
  }

  if (existingReceipt) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('offers')
    .select(`
      id,
      listing_id,
      buyer_id,
      seller_id,
      offer_price,
      created_at,
      updated_at,
      listings!offers_listing_id_fkey (
        id,
        title,
        price,
        currency,
        cover_image_path,
        status,
        deleted_at,
        sold_at,
        created_at,
        sold_to_user_id
      )
    `)
    .eq('id', normalizedOfferId)
    .maybeSingle();

  if (error) {
    console.error('[Purchases] Failed to inspect accepted offer for receipt creation:', error);
    throw new PurchaseServiceError('Unable to prepare sale receipt', 500);
  }

  if (!data) {
    return;
  }

  const offer = data as RawAcceptedOfferCandidate;
  const listing = unwrapRelation(offer.listings);

  if (
    !listing ||
    listing.deleted_at !== null ||
    listing.status !== 'sold' ||
    listing.sold_to_user_id !== offer.buyer_id
  ) {
    return;
  }

  await insertReceiptRows([
    buildReceiptInsertRow({
      source: 'offer_acceptance',
      offerId: offer.id,
      listingId: offer.listing_id,
      buyerId: offer.buyer_id,
      sellerId: offer.seller_id,
      subtotalAmount: toNumber(offer.offer_price),
      currency: listing.currency || 'MYR',
      createdAt: listing.sold_at ?? offer.updated_at ?? offer.created_at,
    }),
  ]);
}

export async function ensurePurchaseReceiptForManualSale(input: {
  listingId: string;
  sellerId: string;
  buyerId: string;
}): Promise<void> {
  const normalizedListingId = trimOptional(input.listingId);
  const normalizedSellerId = trimOptional(input.sellerId);
  const normalizedBuyerId = trimOptional(input.buyerId);

  if (!normalizedListingId || !normalizedSellerId || !normalizedBuyerId) {
    return;
  }

  const { data: acceptedOffer, error: acceptedOfferError } = await supabaseAdmin
    .from('offers')
    .select('id')
    .eq('listing_id', normalizedListingId)
    .eq('buyer_id', normalizedBuyerId)
    .eq('seller_id', normalizedSellerId)
    .eq('status', 'accepted')
    .maybeSingle();

  if (acceptedOfferError) {
    console.error('[Purchases] Failed to inspect accepted offer before manual receipt creation:', acceptedOfferError);
    throw new PurchaseServiceError('Unable to prepare sale receipt', 500);
  }

  if (acceptedOffer?.id) {
    await ensurePurchaseReceiptForAcceptedOffer(acceptedOffer.id);
    return;
  }

  const { data: existingReceipt, error: existingReceiptError } = await supabaseAdmin
    .from('purchase_receipts')
    .select('id')
    .eq('listing_id', normalizedListingId)
    .eq('seller_id', normalizedSellerId)
    .eq('buyer_id', normalizedBuyerId)
    .eq('source', 'manual_sale')
    .maybeSingle();

  if (existingReceiptError) {
    if (isPurchaseReceiptsTableMissingError(existingReceiptError)) {
      warnMissingPurchaseReceiptsTable(existingReceiptError);
      return;
    }

    console.error('[Purchases] Failed to inspect existing manual receipt:', existingReceiptError);
    throw new PurchaseServiceError('Unable to prepare sale receipt', 500);
  }

  if (existingReceipt) {
    return;
  }

  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, sold_to_user_id, price, currency, sold_at, created_at, status')
    .eq('id', normalizedListingId)
    .eq('seller_id', normalizedSellerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (listingError) {
    console.error('[Purchases] Failed to inspect manual sold listing for receipt creation:', listingError);
    throw new PurchaseServiceError('Unable to prepare sale receipt', 500);
  }

  if (
    !listing ||
    listing.status !== 'sold' ||
    listing.sold_to_user_id !== normalizedBuyerId
  ) {
    return;
  }

  await insertReceiptRows([
    buildReceiptInsertRow({
      source: 'manual_sale',
      listingId: normalizedListingId,
      buyerId: normalizedBuyerId,
      sellerId: normalizedSellerId,
      subtotalAmount: toNumber(listing.price),
      currency: listing.currency || 'MYR',
      createdAt: listing.sold_at ?? listing.created_at ?? new Date().toISOString(),
    }),
  ]);
}

export async function getPurchaseReceiptsForUser(
  userId: string
): Promise<PurchasesDashboardResponse> {
  await maybeBackfillPurchaseReceiptsForUser(userId);

  const { data, error } = await supabaseAdmin
    .from('purchase_receipts')
    .select(RECEIPT_SELECT)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    if (isPurchaseReceiptsTableMissingError(error)) {
      warnMissingPurchaseReceiptsTable(error);
      throw buildMissingPurchaseReceiptsTableError();
    }

    console.error('[Purchases] Failed to load purchase receipts:', error);
    throw new PurchaseServiceError('Unable to load purchase history', 500);
  }

  const rows = ((data ?? []) as RawReceiptRow[]).filter((row) => {
    const listing = unwrapRelation(row.listings);
    return listing !== null && listing.deleted_at === null;
  });
  const deliveryReportMap = await getDeliveryReportMapForReceipts(rows);
  const mapped = rows.map((row) =>
    mapReceiptSummary(
      row,
      userId,
      row.delivery_report_id
        ? deliveryReportMap.get(row.delivery_report_id) ?? null
        : null
    )
  );
  const purchases = mapped.filter((receipt) => receipt.buyer.id === userId);
  const sales = mapped.filter((receipt) => receipt.seller.id === userId);

  return {
    stats: {
      purchaseCount: purchases.length,
      salesCount: sales.length,
      purchasePendingPaymentCount: purchases.filter(
        (receipt) => receipt.paymentStatus === 'pending'
      ).length,
      purchasePendingDeliveryCount: purchases.filter(
        (receipt) =>
          receipt.paymentStatus !== 'pending' && receipt.deliveryStatus === 'pending'
      ).length,
      salesAwaitingConfirmationCount: sales.filter(
        (receipt) => receipt.paymentStatus === 'buyer_marked_paid'
      ).length,
    },
    purchases,
    sales,
  };
}

export async function getPurchaseReceiptDetailForUser(
  userId: string,
  receiptId: string
): Promise<PurchaseReceiptDetailResponse> {
  await maybeBackfillPurchaseReceiptsForUser(userId);
  const row = await loadReceiptRowForUser(userId, receiptId);
  const deliveryReport = await getDeliveryReportForReceipt(row);
  return mapReceiptDetail(row, userId, deliveryReport);
}

async function findExistingReportForReceipt(
  receipt: RawReceiptRow
): Promise<RawDeliveryReport | null> {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('id, status, details, created_at, updated_at')
    .eq('listing_id', receipt.listing_id)
    .eq('reporter_id', receipt.buyer_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Purchases] Failed to inspect existing delivery report:', error);
    throw new PurchaseServiceError('Unable to inspect existing reports', 500);
  }

  return (data as RawDeliveryReport | null) ?? null;
}

async function findExistingDeliveryIssueForReceipt(
  receipt: RawReceiptRow
): Promise<RawDeliveryReport | null> {
  const existingReport = await findExistingReportForReceipt(receipt);

  if (!existingReport || !parseDeliveryDisputeDetails(existingReport.details)) {
    return null;
  }

  return existingReport;
}

async function updateReceiptDeliveryStatus(
  receipt: RawReceiptRow,
  userId: string,
  input: {
    deliveryStatus: PurchaseDeliveryStatus;
    deliveryMarkedAt: string;
    deliveryReportId?: string | null;
  }
): Promise<PurchaseReceiptDetailResponse> {
  const { data, error } = await supabaseAdmin
    .from('purchase_receipts')
    .update({
      delivery_status: input.deliveryStatus,
      delivery_marked_at: input.deliveryMarkedAt,
      delivery_report_id: input.deliveryReportId ?? null,
      updated_at: input.deliveryMarkedAt,
    })
    .eq('id', receipt.id)
    .eq('buyer_id', userId)
    .select(RECEIPT_SELECT)
    .single();

  if (error || !data) {
    console.error('[Purchases] Failed to update receipt delivery status:', error);
    throw new PurchaseServiceError('Unable to update the delivery status', 500);
  }

  const updatedReceipt = data as RawReceiptRow;
  const deliveryReport = await getDeliveryReportForReceipt(updatedReceipt);
  return mapReceiptDetail(updatedReceipt, userId, deliveryReport);
}

export async function markPurchaseReceiptPaid(
  userId: string,
  receiptId: string,
  input: MarkPurchasePaidInput
): Promise<PurchaseReceiptDetailResponse> {
  const receipt = await loadReceiptRowForUser(userId, receiptId);

  if (receipt.buyer_id !== userId) {
    throw new PurchaseServiceError('Only the buyer can confirm payment', 403);
  }

  if (receipt.payment_status !== 'pending') {
    throw new PurchaseServiceError('This receipt is already updated', 409);
  }

  const paymentMethod = trimOptional(input.paymentMethod, 60);
  const paymentReference = trimOptional(input.paymentReference, 120);
  const buyerNote = trimOptional(input.buyerNote, 500);
  const updatedAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('purchase_receipts')
    .update({
      payment_status: 'buyer_marked_paid',
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      buyer_note: buyerNote,
      buyer_marked_paid_at: updatedAt,
      updated_at: updatedAt,
    })
    .eq('id', receipt.id)
    .eq('buyer_id', userId)
    .select(RECEIPT_SELECT)
    .single();

  if (error || !data) {
    console.error('[Purchases] Failed to mark receipt as paid:', error);
    throw new PurchaseServiceError('Unable to update the payment status', 500);
  }

  try {
    await createNotification({
      userId: receipt.seller_id,
      type: 'system',
      title: 'Buyer marked a receipt as paid',
      body: `${buildDisplayName(unwrapRelation(receipt.buyer_profile), 'Marketplace User')} marked receipt ${receipt.receipt_number} as paid.`,
      linkPath: `/dashboard/purchases/${receipt.id}`,
    });
  } catch (notificationError) {
    console.error('[Purchases] Failed to create buyer-paid notification:', notificationError);
  }

  const updatedReceipt = data as RawReceiptRow;
  const deliveryReport = await getDeliveryReportForReceipt(updatedReceipt);
  return mapReceiptDetail(updatedReceipt, userId, deliveryReport);
}

export async function confirmPurchaseReceiptPayment(
  userId: string,
  receiptId: string
): Promise<PurchaseReceiptDetailResponse> {
  const receipt = await loadReceiptRowForUser(userId, receiptId);

  if (receipt.seller_id !== userId) {
    throw new PurchaseServiceError('Only the seller can confirm this payment', 403);
  }

  if (receipt.payment_status !== 'buyer_marked_paid') {
    throw new PurchaseServiceError('The buyer has not marked this receipt as paid yet', 409);
  }

  const updatedAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('purchase_receipts')
    .update({
      payment_status: 'seller_confirmed_paid',
      seller_confirmed_paid_at: updatedAt,
      updated_at: updatedAt,
    })
    .eq('id', receipt.id)
    .eq('seller_id', userId)
    .select(RECEIPT_SELECT)
    .single();

  if (error || !data) {
    console.error('[Purchases] Failed to confirm receipt payment:', error);
    throw new PurchaseServiceError('Unable to confirm this payment', 500);
  }

  try {
    await createNotification({
      userId: receipt.buyer_id,
      type: 'system',
      title: 'Seller confirmed your payment',
      body: `${buildDisplayName(unwrapRelation(receipt.seller_profile), 'Marketplace User')} confirmed receipt ${receipt.receipt_number}.`,
      linkPath: `/dashboard/purchases/${receipt.id}`,
    });
  } catch (notificationError) {
    console.error('[Purchases] Failed to create seller-confirmed notification:', notificationError);
  }

  const updatedReceipt = data as RawReceiptRow;
  const deliveryReport = await getDeliveryReportForReceipt(updatedReceipt);
  return mapReceiptDetail(updatedReceipt, userId, deliveryReport);
}

export async function markPurchaseReceiptReceived(
  userId: string,
  receiptId: string
): Promise<PurchaseReceiptDetailResponse> {
  const receipt = await loadReceiptRowForUser(userId, receiptId);
  const deliveryStatus = (receipt.delivery_status ?? 'pending') as PurchaseDeliveryStatus;

  if (receipt.buyer_id !== userId) {
    throw new PurchaseServiceError('Only the buyer can confirm item receipt', 403);
  }

  if (!hasBuyerMarkedPaymentSent(receipt.payment_status)) {
    throw new PurchaseServiceError('Mark this receipt as paid before confirming delivery', 409);
  }

  if (deliveryStatus === 'received') {
    const deliveryReport = await getDeliveryReportForReceipt(receipt);
    return mapReceiptDetail(receipt, userId, deliveryReport);
  }

  if (deliveryStatus === 'not_received') {
    throw new PurchaseServiceError(
      'This receipt is already marked as not received',
      409
    );
  }

  const existingDeliveryIssue = await findExistingDeliveryIssueForReceipt(receipt);
  if (
    existingDeliveryIssue &&
    (existingDeliveryIssue.status === 'pending' ||
      existingDeliveryIssue.status === 'reviewed')
  ) {
    throw new PurchaseServiceError(
      'Resolve your item-not-received report before marking this item as received',
      409
    );
  }

  const updatedAt = new Date().toISOString();
  const updatedReceipt = await updateReceiptDeliveryStatus(receipt, userId, {
    deliveryStatus: 'received',
    deliveryMarkedAt: updatedAt,
  });
  const listing = unwrapRelation(receipt.listings);

  try {
    await createNotification({
      userId: receipt.seller_id,
      type: 'system',
      title: 'Buyer marked item as received',
      body: `${buildDisplayName(unwrapRelation(receipt.buyer_profile), 'Marketplace User')} confirmed that "${listing?.title ?? 'your item'}" was received.`,
      linkPath: `/dashboard/purchases/${receipt.id}`,
    });
  } catch (notificationError) {
    console.error('[Purchases] Failed to create delivery-received notification:', notificationError);
  }

  return updatedReceipt;
}

export async function reportPurchaseReceiptNotReceived(
  userId: string,
  receiptId: string,
  input: ReportPurchaseDeliveryIssueInput
): Promise<PurchaseReceiptDetailResponse> {
  const receipt = await loadReceiptRowForUser(userId, receiptId);
  const deliveryStatus = (receipt.delivery_status ?? 'pending') as PurchaseDeliveryStatus;

  if (receipt.buyer_id !== userId) {
    throw new PurchaseServiceError('Only the buyer can report this delivery issue', 403);
  }

  if (!hasBuyerMarkedPaymentSent(receipt.payment_status)) {
    throw new PurchaseServiceError('Mark this receipt as paid before reporting delivery', 409);
  }

  if (deliveryStatus === 'received') {
    throw new PurchaseServiceError(
      'This purchase is already marked as received, so a delivery issue cannot be opened',
      409
    );
  }

  if (deliveryStatus === 'not_received') {
    const deliveryReport = await getDeliveryReportForReceipt(receipt);
    return mapReceiptDetail(receipt, userId, deliveryReport);
  }

  const buyerStatement = trimOptional(input.buyerStatement);
  const paymentReference =
    trimOptional(input.paymentReference, 120) ?? receipt.payment_reference;
  const proofs = input.proofs ?? [];

  if (!buyerStatement || buyerStatement.length < 20) {
    throw new PurchaseServiceError(
      'buyerStatement must be at least 20 characters so the admin can review the delivery issue',
      422
    );
  }

  if (buyerStatement.length > 1000) {
    throw new PurchaseServiceError('buyerStatement must be 1000 characters or fewer', 422);
  }

  if (proofs.length > 3) {
    throw new PurchaseServiceError('You can upload up to 3 proof images per delivery issue', 422);
  }

  const existingReport = await findExistingReportForReceipt(receipt);
  if (existingReport && parseDeliveryDisputeDetails(existingReport.details)) {
    return updateReceiptDeliveryStatus(receipt, userId, {
      deliveryStatus: 'not_received',
      deliveryMarkedAt: receipt.delivery_marked_at ?? existingReport.created_at,
      deliveryReportId: existingReport.id,
    });
  }

  const listing = unwrapRelation(receipt.listings);
  const uploadedProofs = await uploadDeliveryProofs(userId, proofs);
  const timestamp = new Date().toISOString();
  const reportDetails = buildDeliveryDisputeDetails({
    offerId: receipt.offer_id,
    receiptId: receipt.id,
    agreedPriceLabel: formatCurrency(toNumber(receipt.total_amount), receipt.currency),
    paymentReference,
    proofUrls: uploadedProofs.map((proof) => proof.publicUrl),
    buyerStatement: buildDeliveryIssueBuyerStatement(
      buyerStatement,
      existingReport?.details
    ),
  });

  const reportWrite = existingReport
    ? await supabaseAdmin
        .from('reports')
        .update({
          reason: 'other',
          details: reportDetails,
          status: 'pending',
          updated_at: timestamp,
        })
        .eq('id', existingReport.id)
        .select('id, status, details, created_at, updated_at')
        .single()
    : await supabaseAdmin
        .from('reports')
        .insert({
          listing_id: receipt.listing_id,
          reporter_id: userId,
          reason: 'other',
          details: reportDetails,
          status: 'pending',
          created_at: timestamp,
          updated_at: timestamp,
        })
        .select('id, status, details, created_at, updated_at')
        .single();

  const deliveryReport = reportWrite.data as RawDeliveryReport | null;
  const reportWriteError = reportWrite.error;

  if (reportWriteError || !deliveryReport) {
    console.error('[Purchases] Failed to save receipt delivery issue report:', reportWriteError);

    if (uploadedProofs.length > 0) {
      try {
        await removeStorageObjects(
          DELIVERY_PROOF_BUCKET,
          uploadedProofs.map((proof) => proof.storagePath)
        );
      } catch (cleanupError) {
        console.error('[Purchases] Failed to clean up uploaded proof images:', cleanupError);
      }
    }

    throw new PurchaseServiceError(
      `Unable to submit a delivery issue for "${listing?.title ?? 'this listing'}"`,
      500
    );
  }

  const updatedReceipt = await updateReceiptDeliveryStatus(receipt, userId, {
    deliveryStatus: 'not_received',
    deliveryMarkedAt: timestamp,
    deliveryReportId: deliveryReport.id,
  });

  try {
    await createNotification({
      userId: receipt.seller_id,
      type: 'system',
      title: 'Item not received reported',
      body: toSingleLineNotificationText(
        buyerStatement,
        `The buyer reported that "${listing?.title ?? 'your item'}" was not received.`
      ),
      linkPath: `/dashboard/purchases/${receipt.id}`,
    });
  } catch (notificationError) {
    console.error('[Purchases] Failed to create receipt delivery-issue notification:', notificationError);
  }

  return updatedReceipt;
}
