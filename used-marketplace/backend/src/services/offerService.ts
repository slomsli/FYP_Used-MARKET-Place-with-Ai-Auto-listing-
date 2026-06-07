import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import {
  buildDeliveryDisputeDetails,
  parseDeliveryDisputeDetails,
} from '../utils/deliveryDispute';
import { buildDisplayName } from '../utils/profile';
import { type Relation, unwrapRelation } from '../utils/relation';
import { sanitizeStorageFileName } from '../utils/storageFile';
import { REPORT_STATUS_LABELS, type ReportStatus } from '../types/report';
import type {
  PurchaseDeliveryStatus,
  PurchasePaymentStatus,
} from '../types/purchase';
import { getPublicStorageUrl, removeStorageObjects } from '../utils/storage';
import {
  AVATAR_BUCKET,
  DELIVERY_PROOF_BUCKET,
  LISTING_IMAGE_BUCKET,
} from '../utils/storageBuckets';
import { toNumber, trimOptional } from '../utils/value';
import { createNotification, createNotifications } from './notificationService';
import {
  ensurePurchaseReceiptForAcceptedOffer,
  isPurchaseReceiptsTableMissingError,
} from './purchaseService';
import { generateAutoNegotiationReplyForKnownOffer } from './autoNegotiationService';

/* ── Types ─────────────────────────────────────────────── */

interface RawProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
  identity_verification_status?: string | null;
  identity_verification_badge?: boolean | null;
}

interface RawCategory {
  id: number;
  name: string;
  slug: string;
}

interface RawListing {
  id: string;
  seller_id: string;
  title: string;
  price: unknown;
  currency: string;
  negotiable: boolean;
  auto_negotiate_enabled?: boolean | null;
  auto_negotiate_floor_price?: unknown;
  status: string;
  deleted_at: string | null;
  sold_to_user_id: string | null;
  cover_image_path: string | null;
  categories: Relation<RawCategory>;
}

interface RawAutoNegotiationListing {
  id: string;
  seller_id: string;
  title: string;
  status: string;
  price: unknown;
  currency: string | null;
  negotiable: boolean | null;
  auto_negotiate_enabled: boolean | null;
  auto_negotiate_floor_price: unknown;
}

interface RawOffer {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price: unknown;
  message: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  parent_offer_id: string | null;
  initiated_by: string | null;
  offer_kind: string;
  listings: Relation<RawListing>;
  buyer_profile: Relation<RawProfile>;
  seller_profile: Relation<RawProfile>;
}

interface RawReview {
  id: string;
  listing_id: string;
  reviewer_id: string;
  seller_id: string | null;
  rating: unknown;
  comment: string | null;
  created_at: string;
  updated_at: string;
  seller_response: string | null;
  seller_response_created_at: string | null;
  seller_response_updated_at: string | null;
}

interface RawReport {
  id: string;
  listing_id: string;
  reporter_id: string;
  status: ReportStatus;
  details: string | null;
  created_at: string;
  updated_at: string;
}

interface RawCompletedSaleListing {
  id: string;
  title: string;
  currency: string;
  status: string;
  deleted_at: string | null;
  sold_to_user_id: string | null;
}

interface RawCompletedSaleOffer {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price: unknown;
  status: string;
  listings: Relation<RawCompletedSaleListing>;
}

interface RawPurchaseReceipt {
  id: string;
  offer_id: string | null;
  receipt_number: string;
  payment_status: PurchasePaymentStatus;
  delivery_status: PurchaseDeliveryStatus | null;
  delivery_marked_at: string | null;
  total_amount: unknown;
  currency: string;
  buyer_marked_paid_at: string | null;
  seller_confirmed_paid_at: string | null;
}

export type OfferKind = 'purchase_request' | 'offer' | 'counter_offer';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'withdrawn';

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
  status: ReportStatus;
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

export interface CreateOfferInput {
  listingId: string;
  offerPrice: number;
  message?: string;
  offerKind: OfferKind;
}

export interface CounterOfferInput {
  offerId: string;
  counterPrice: number;
  message?: string;
}

export interface DeliveryIssueProofInput {
  fileName: string;
  contentType: string;
  base64Data: string;
}

export interface CreateBuyerReviewInput {
  offerId: string;
  rating: number;
  comment?: string;
}

export interface CreateSellerReviewResponseInput {
  offerId: string;
  response: string;
}

export interface ReportDeliveryIssueInput {
  offerId: string;
  buyerStatement: string;
  paymentReference?: string;
  proofs?: DeliveryIssueProofInput[];
}

interface OfferActionRecord {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  initiated_by: string | null;
  offer_kind: string;
}

export class OfferServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OfferServiceError';
    this.status = status;
  }
}

const MAX_DELIVERY_PROOF_SIZE_BYTES = 4 * 1024 * 1024;
const DELIVERY_PROOF_MIME_TYPES = ['image/*'];
let deliveryProofBucketPromise: Promise<void> | null = null;

interface UploadedDeliveryProof {
  publicUrl: string;
  storagePath: string;
}

/* ── Helpers ───────────────────────────────────────────── */

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

function hasIdentityVerificationBadge(profile: RawProfile | null | undefined): boolean {
  return profile?.identity_verification_status === 'verified' && profile.identity_verification_badge === true;
}

function getOfferKindLabel(offerKind: OfferKind): string {
  if (offerKind === 'purchase_request') {
    return 'purchase request';
  }

  if (offerKind === 'counter_offer') {
    return 'counter-offer';
  }

  return 'offer';
}

async function notifyOfferCreated(offer: OfferSummary): Promise<void> {
  const recipientId =
    offer.offerKind === 'counter_offer'
      ? offer.initiatedBy === offer.sellerId
        ? offer.buyerId
        : offer.sellerId
      : offer.sellerId;

  await createNotification({
    userId: recipientId,
    type: 'offer',
    title: offer.offerKind === 'counter_offer' ? 'Counter-offer received' : 'New offer received',
    body: `"${offer.listing.title}" has a ${getOfferKindLabel(offer.offerKind)} for ${formatCurrency(
      offer.offerPrice,
      offer.listing.currency
    )}.`,
    linkPath: '/dashboard/offers',
  });
}

async function notifyOfferAccepted(offer: OfferSummary, responderId: string): Promise<void> {
  const recipientId = responderId === offer.buyerId ? offer.sellerId : offer.buyerId;

  await createNotification({
    userId: recipientId,
    type: 'offer_accepted',
    title: 'Offer accepted',
    body: `"${offer.listing.title}" is now marked as sold for ${formatCurrency(
      offer.offerPrice,
      offer.listing.currency
    )}.`,
    linkPath: '/dashboard/offers',
  });
}

async function notifyOfferRejected(offer: OfferSummary, responderId: string): Promise<void> {
  const recipientId = responderId === offer.buyerId ? offer.sellerId : offer.buyerId;

  await createNotification({
    userId: recipientId,
    type: 'offer_rejected',
    title: offer.offerKind === 'counter_offer' ? 'Counter-offer rejected' : 'Offer rejected',
    body: `The ${getOfferKindLabel(offer.offerKind)} for "${offer.listing.title}" was declined.`,
    linkPath: '/dashboard/offers',
  });
}

async function notifyCompetingOffersWithdrawn(
  listingTitle: string,
  buyerIds: string[]
): Promise<void> {
  const uniqueBuyerIds = Array.from(new Set(buyerIds.filter(Boolean)));

  if (uniqueBuyerIds.length === 0) {
    return;
  }

  await createNotifications(
    uniqueBuyerIds.map((buyerId) => ({
      userId: buyerId,
      type: 'offer_rejected' as const,
      title: 'Offer closed automatically',
      body: `Another buyer completed the sale for "${listingTitle}", so this offer was withdrawn.`,
      linkPath: '/dashboard/offers',
    }))
  );
}

async function notifyDeliveryIssueReported(
  sellerId: string,
  listingTitle: string,
  buyerStatement: string
): Promise<void> {
  await createNotification({
    userId: sellerId,
    type: 'system',
    title: 'Delivery issue reported',
    body: toSingleLineNotificationText(
      buyerStatement,
      `The buyer reported that "${listingTitle}" was not received.`
    ),
    linkPath: '/dashboard/offers',
  });
}

async function updateOfferReceiptDeliveryStatus(input: {
  offerId: string;
  buyerId: string;
  deliveryStatus: PurchaseDeliveryStatus;
  deliveryMarkedAt: string;
  deliveryReportId?: string | null;
}): Promise<void> {
  const updatePayload: Record<string, string | null> = {
    delivery_status: input.deliveryStatus,
    delivery_marked_at: input.deliveryMarkedAt,
    updated_at: input.deliveryMarkedAt,
  };

  if (input.deliveryStatus === 'not_received') {
    updatePayload.delivery_report_id = input.deliveryReportId ?? null;
  }

  const { error } = await supabaseAdmin
    .from('purchase_receipts')
    .update(updatePayload)
    .eq('offer_id', input.offerId)
    .eq('buyer_id', input.buyerId)
    .eq('delivery_status', 'pending');

  if (error && !isPurchaseReceiptsTableMissingError(error)) {
    console.error('[Offers] Failed to sync receipt delivery status:', error);
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
          console.error('[Offers] Failed to update delivery proof bucket:', updateError);
          throw new OfferServiceError('Unable to prepare delivery proof storage', 500);
        }

        return;
      }

      const bucketErrorMessage = bucketResult.error?.message ?? '';
      const isMissingBucketError = /not found|does not exist|404/i.test(bucketErrorMessage);
      if (bucketResult.error && !isMissingBucketError) {
        console.error('[Offers] Failed to inspect delivery proof bucket:', bucketResult.error);
        throw new OfferServiceError('Unable to prepare delivery proof storage', 500);
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
        console.error('[Offers] Failed to create delivery proof bucket:', createError);
        throw new OfferServiceError('Unable to prepare delivery proof storage', 500);
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
          console.error('[Offers] Failed to sync delivery proof bucket settings:', updateError);
          throw new OfferServiceError('Unable to prepare delivery proof storage', 500);
        }
      }
    })().catch((error) => {
      deliveryProofBucketPromise = null;
      throw error;
    });
  }

  return deliveryProofBucketPromise;
}

function filterVisibleOffers(rawOffers: RawOffer[]): RawOffer[] {
  return rawOffers.filter((offer) => unwrapRelation(offer.listings)?.deleted_at === null);
}

async function countVisibleOffers(
  column: 'buyer_id' | 'seller_id',
  userId: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('offers')
    .select(`
      id,
      listings!offers_listing_id_fkey (
        deleted_at
      )
    `)
    .eq(column, userId);

  if (error) {
    console.error(`[Offers] Failed to count visible offers by ${column}:`, error);
    return 0;
  }

  return ((data ?? []) as Array<{ listings: Relation<{ deleted_at: string | null }> }>).filter(
    (offer) => unwrapRelation(offer.listings)?.deleted_at === null
  ).length;
}

function getOfferInitiatorUserId(
  offer: Pick<OfferActionRecord, 'buyer_id' | 'seller_id' | 'initiated_by' | 'offer_kind'>
): string {
  if (offer.initiated_by === offer.buyer_id || offer.initiated_by === offer.seller_id) {
    return offer.initiated_by;
  }

  return offer.offer_kind === 'counter_offer' ? offer.seller_id : offer.buyer_id;
}

function getOfferResponderUserId(
  offer: Pick<OfferActionRecord, 'buyer_id' | 'seller_id' | 'initiated_by' | 'offer_kind'>
): string {
  const initiatorId = getOfferInitiatorUserId(offer);
  return initiatorId === offer.buyer_id ? offer.seller_id : offer.buyer_id;
}

function buildSaleFollowUpKey(listingId: string, buyerId: string): string {
  return `${listingId}:${buyerId}`;
}

function mapOfferReview(review: RawReview): OfferReviewSummary {
  return {
    id: review.id,
    rating: toNumber(review.rating),
    comment: review.comment,
    createdAt: review.created_at,
    sellerResponse:
      review.seller_response &&
      review.seller_response_created_at &&
      review.seller_response_updated_at
        ? {
            body: review.seller_response,
            createdAt: review.seller_response_created_at,
            updatedAt: review.seller_response_updated_at,
          }
        : null,
  };
}

function mapDeliveryIssue(report: RawReport): OfferDeliveryIssueSummary | null {
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

function getPurchasePaymentStatusLabel(status: PurchasePaymentStatus): string {
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

function getPurchaseDeliveryStatusLabel(status: PurchaseDeliveryStatus): string {
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

function mapOfferReceipt(receipt: RawPurchaseReceipt): OfferPurchaseReceiptSummary {
  const deliveryStatus = receipt.delivery_status ?? 'pending';

  return {
    id: receipt.id,
    receiptNumber: receipt.receipt_number,
    paymentStatus: receipt.payment_status,
    paymentStatusLabel: getPurchasePaymentStatusLabel(receipt.payment_status),
    deliveryStatus,
    deliveryStatusLabel: getPurchaseDeliveryStatusLabel(deliveryStatus),
    deliveryMarkedAt: receipt.delivery_marked_at,
    totalAmount: toNumber(receipt.total_amount),
    currency: receipt.currency || 'MYR',
    buyerMarkedPaidAt: receipt.buyer_marked_paid_at,
    sellerConfirmedPaidAt: receipt.seller_confirmed_paid_at,
  };
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
      throw new OfferServiceError('Each proof must include fileName, contentType, and base64Data', 422);
    }

    if (!contentType.startsWith('image/')) {
      throw new OfferServiceError('Only image proofs are supported right now', 422);
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(base64Data, 'base64');
    } catch {
      throw new OfferServiceError('One of the proof files could not be read', 422);
    }

    if (fileBuffer.length === 0) {
      throw new OfferServiceError('One of the proof files was empty', 422);
    }

    if (fileBuffer.length > MAX_DELIVERY_PROOF_SIZE_BYTES) {
      throw new OfferServiceError('Each proof image must be 4 MB or smaller', 422);
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
      console.error('[Offers] Failed to upload delivery proof:', uploadError);
      throw new OfferServiceError('Unable to upload one of the proof images', 500);
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(DELIVERY_PROOF_BUCKET).getPublicUrl(storagePath);

    if (!publicUrl) {
      throw new OfferServiceError('Unable to generate a proof image URL', 500);
    }

    uploadedProofs.push({
      publicUrl,
      storagePath,
    });
  }

  return uploadedProofs;
}

async function attachSaleFollowUp(
  currentUserId: string,
  rawOffers: RawOffer[]
): Promise<OfferSummary[]> {
  const visibleRawOffers = filterVisibleOffers(rawOffers);
  const offers = visibleRawOffers.map(mapOffer);
  const completedSales = visibleRawOffers.filter((offer) => {
    const listing = unwrapRelation(offer.listings);

    return (
      offer.status === 'accepted' &&
      listing?.status === 'sold' &&
      listing.sold_to_user_id === offer.buyer_id
    );
  });

  if (completedSales.length === 0) {
    return offers;
  }

  const completedSaleOfferIdSet = new Set(completedSales.map((saleOffer) => saleOffer.id));
  const completedOfferIds = completedSales.map((saleOffer) => saleOffer.id);

  const saleKeys = new Set<string>();
  const listingIds: string[] = [];
  const buyerIds: string[] = [];

  for (const saleOffer of completedSales) {
    const saleKey = buildSaleFollowUpKey(saleOffer.listing_id, saleOffer.buyer_id);
    if (saleKeys.has(saleKey)) {
      continue;
    }

    saleKeys.add(saleKey);
    listingIds.push(saleOffer.listing_id);
    buyerIds.push(saleOffer.buyer_id);
  }

  const [reviewsResult, reportsResult, receiptsResult] = await Promise.all([
    supabaseAdmin
      .from('reviews')
      .select(`
        id,
        listing_id,
        reviewer_id,
        seller_id,
        rating,
        comment,
        created_at,
        updated_at,
        seller_response,
        seller_response_created_at,
        seller_response_updated_at
      `)
      .in('listing_id', listingIds)
      .in('reviewer_id', buyerIds),
    supabaseAdmin
      .from('reports')
      .select('id, listing_id, reporter_id, status, details, created_at, updated_at')
      .in('listing_id', listingIds)
      .in('reporter_id', buyerIds)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('purchase_receipts')
      .select(`
        id,
        offer_id,
        receipt_number,
        payment_status,
        delivery_status,
        delivery_marked_at,
        total_amount,
        currency,
        buyer_marked_paid_at,
        seller_confirmed_paid_at
      `)
      .in('offer_id', completedOfferIds),
  ]);

  if (reviewsResult.error) {
    console.error('[Offers] Failed to load sale follow-up reviews:', reviewsResult.error);
    throw new OfferServiceError('Unable to load post-sale reviews', 500);
  }

  if (reportsResult.error) {
    console.error('[Offers] Failed to load sale follow-up delivery issues:', reportsResult.error);
    throw new OfferServiceError('Unable to load delivery issue reports', 500);
  }

  const shouldSkipReceipts =
    receiptsResult.error && isPurchaseReceiptsTableMissingError(receiptsResult.error);

  if (receiptsResult.error && !shouldSkipReceipts) {
    console.error('[Offers] Failed to load sale follow-up receipts:', receiptsResult.error);
    throw new OfferServiceError('Unable to load sale receipts', 500);
  }

  const reviewMap = new Map<string, OfferReviewSummary>();
  for (const review of (reviewsResult.data ?? []) as RawReview[]) {
    const key = buildSaleFollowUpKey(review.listing_id, review.reviewer_id);
    if (!reviewMap.has(key)) {
      reviewMap.set(key, mapOfferReview(review));
    }
  }

  const deliveryIssueMap = new Map<string, OfferDeliveryIssueSummary>();
  for (const report of (reportsResult.data ?? []) as RawReport[]) {
    const mappedIssue = mapDeliveryIssue(report);
    if (!mappedIssue) {
      continue;
    }

    const key = buildSaleFollowUpKey(report.listing_id, report.reporter_id);
    if (!deliveryIssueMap.has(key)) {
      deliveryIssueMap.set(key, mappedIssue);
    }
  }

  const receiptMap = new Map<string, OfferPurchaseReceiptSummary>();
  for (const receipt of (shouldSkipReceipts ? [] : receiptsResult.data ?? []) as RawPurchaseReceipt[]) {
    if (receipt.offer_id && !receiptMap.has(receipt.offer_id)) {
      receiptMap.set(receipt.offer_id, mapOfferReceipt(receipt));
    }
  }

  return offers.map((offer) => {
    const saleKey = buildSaleFollowUpKey(offer.listingId, offer.buyerId);
    const review = reviewMap.get(saleKey) ?? null;
    const deliveryIssue = deliveryIssueMap.get(saleKey) ?? null;
    const isCompletedSale = completedSaleOfferIdSet.has(offer.id);
    const receipt = receiptMap.get(offer.id) ?? null;
    const hasReceiptDeliveryDecision =
      receipt?.deliveryStatus === 'received' || receipt?.deliveryStatus === 'not_received';

    if (!isCompletedSale) {
      return offer;
    }

    return {
      ...offer,
      saleFollowUp: {
        canBuyerConfirmReceived:
          currentUserId === offer.buyerId &&
          !review &&
          !deliveryIssue &&
          !hasReceiptDeliveryDecision,
        canBuyerReportNotReceived:
          currentUserId === offer.buyerId &&
          !review &&
          !deliveryIssue &&
          !hasReceiptDeliveryDecision,
        review,
        deliveryIssue,
        receipt,
      },
    };
  });
}

async function getCompletedSaleOfferById(offerId: string): Promise<RawCompletedSaleOffer> {
  const { data, error } = await supabaseAdmin
    .from('offers')
    .select(`
      id,
      listing_id,
      buyer_id,
      seller_id,
      offer_price,
      status,
      listings!offers_listing_id_fkey (
        id,
        title,
        currency,
        status,
        deleted_at,
        sold_to_user_id
      )
    `)
    .eq('id', offerId)
    .maybeSingle();

  if (error) {
    console.error('[Offers] Failed to inspect completed sale offer:', error);
    throw new OfferServiceError('Unable to inspect the selected purchase', 500);
  }

  if (!data) {
    throw new OfferServiceError('Offer not found', 404);
  }

  return data as RawCompletedSaleOffer;
}

function assertBuyerCanManageSale(
  userId: string,
  offer: RawCompletedSaleOffer
): RawCompletedSaleListing {
  if (offer.buyer_id !== userId) {
    throw new OfferServiceError('Only the buyer can complete this post-sale action', 403);
  }

  if (offer.status !== 'accepted') {
    throw new OfferServiceError('This purchase is not ready for post-sale confirmation yet', 422);
  }

  const listing = unwrapRelation(offer.listings);
  if (!listing) {
    throw new OfferServiceError('Listing not found for this purchase', 404);
  }

  if (listing.deleted_at !== null) {
    throw new OfferServiceError('Listing not found for this purchase', 404);
  }

  if (listing.status !== 'sold' || listing.sold_to_user_id !== offer.buyer_id) {
    throw new OfferServiceError('This listing is not marked as sold to you', 422);
  }

  return listing;
}

function assertSellerCanRespondToReview(
  userId: string,
  offer: RawCompletedSaleOffer
): RawCompletedSaleListing {
  if (offer.seller_id !== userId) {
    throw new OfferServiceError('Only the seller can reply to this review', 403);
  }

  if (offer.status !== 'accepted') {
    throw new OfferServiceError('This purchase is not ready for a seller reply yet', 422);
  }

  const listing = unwrapRelation(offer.listings);
  if (!listing) {
    throw new OfferServiceError('Listing not found for this purchase', 404);
  }

  if (listing.deleted_at !== null) {
    throw new OfferServiceError('Listing not found for this purchase', 404);
  }

  if (listing.status !== 'sold' || listing.sold_to_user_id !== offer.buyer_id) {
    throw new OfferServiceError('This listing is not marked as sold to this buyer', 422);
  }

  return listing;
}

function mapOffer(raw: RawOffer): OfferSummary {
  const listing = unwrapRelation(raw.listings);
  const buyer = unwrapRelation(raw.buyer_profile);
  const seller = unwrapRelation(raw.seller_profile);
  const category = listing ? unwrapRelation(listing.categories) : null;

  return {
    id: raw.id,
    listingId: raw.listing_id,
    buyerId: raw.buyer_id,
    sellerId: raw.seller_id,
    offerPrice: toNumber(raw.offer_price),
    askingPrice: listing ? toNumber(listing.price) : 0,
    message: raw.message,
    status: raw.status as OfferStatus,
    offerKind: raw.offer_kind as OfferKind,
    parentOfferId: raw.parent_offer_id,
    initiatedBy: raw.initiated_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    listing: {
      id: listing?.id ?? raw.listing_id,
      title: listing?.title ?? 'Unknown listing',
      coverImagePath: getPublicStorageUrl(LISTING_IMAGE_BUCKET, listing?.cover_image_path ?? null),
      currency: listing?.currency ?? 'MYR',
      negotiable: listing?.negotiable ?? false,
      status: listing?.status ?? 'active',
      categoryName: category?.name ?? null,
    },
    buyer: {
      id: raw.buyer_id,
      displayName: buildDisplayName(buyer),
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, buyer?.avatar_path ?? null),
      identityVerificationBadge: hasIdentityVerificationBadge(buyer),
    },
    seller: {
      id: raw.seller_id,
      displayName: buildDisplayName(seller),
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, seller?.avatar_path ?? null),
      identityVerificationBadge: hasIdentityVerificationBadge(seller),
    },
    saleFollowUp: null,
  };
}

const OFFER_SELECT = `
  id,
  listing_id,
  buyer_id,
  seller_id,
  offer_price,
  message,
  status,
  created_at,
  updated_at,
  parent_offer_id,
  initiated_by,
  offer_kind,
  listings!offers_listing_id_fkey (
    id, seller_id, title, price, currency, negotiable, auto_negotiate_enabled, auto_negotiate_floor_price, status, deleted_at, sold_to_user_id, cover_image_path,
    categories!listings_category_id_fkey ( id, name, slug )
  ),
  buyer_profile:profiles!offers_buyer_id_fkey (
    id, username, full_name, avatar_path, identity_verification_status, identity_verification_badge
  ),
  seller_profile:profiles!offers_seller_id_fkey (
    id, username, full_name, avatar_path, identity_verification_status, identity_verification_badge
  )
`;

async function maybeAutoRespondToCreatedOffer(
  createdOffer: OfferSummary,
  listing: RawAutoNegotiationListing
): Promise<OfferSummary | null> {
  if (
    listing.auto_negotiate_enabled !== true ||
    listing.negotiable !== true ||
    listing.status !== 'active'
  ) {
    return null;
  }

  const askingPrice = toNumber(listing.price, Number.NaN);
  const floorPrice = toNumber(listing.auto_negotiate_floor_price, Number.NaN);

  if (
    !Number.isFinite(askingPrice) ||
    askingPrice <= 0 ||
    !Number.isFinite(floorPrice) ||
    floorPrice <= 0 ||
    floorPrice > askingPrice
  ) {
    return null;
  }

  const autoDecision = await generateAutoNegotiationReplyForKnownOffer({
    buyerOffer: createdOffer.offerPrice,
    buyerMessage: createdOffer.message ?? '',
    listingTitle: listing.title,
    askingPrice,
    floorPrice,
    currency: listing.currency?.trim() || createdOffer.listing.currency || 'MYR',
  });

  if (!autoDecision) {
    return null;
  }

  if (autoDecision.action === 'accept') {
    return acceptOffer(listing.seller_id, createdOffer.id);
  }

  return createCounterOffer(listing.seller_id, {
    offerId: createdOffer.id,
    counterPrice: autoDecision.targetPrice,
    message: autoDecision.reply,
  });
}

/* ── Service Functions ─────────────────────────────────── */

/**
 * Get received offers for a seller.
 */
export async function getReceivedOffers(userId: string): Promise<OffersPageResponse> {
  const { data: received, error: recvErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });

  if (recvErr) {
    console.error('[Offers] Failed to fetch received offers:', recvErr);
    throw new OfferServiceError('Unable to load received offers', 500);
  }

  const offers = await attachSaleFollowUp(userId, (received ?? []) as RawOffer[]);
  const sentCount = await countVisibleOffers('buyer_id', userId);

  return {
    receivedCount: offers.length,
    sentCount,
    offers,
  };
}

/**
 * Get sent offers for a buyer.
 */
export async function getSentOffers(userId: string): Promise<OffersPageResponse> {
  const { data: sent, error: sentErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false });

  if (sentErr) {
    console.error('[Offers] Failed to fetch sent offers:', sentErr);
    throw new OfferServiceError('Unable to load sent offers', 500);
  }

  const offers = await attachSaleFollowUp(userId, (sent ?? []) as RawOffer[]);
  const receivedCount = await countVisibleOffers('seller_id', userId);

  return {
    receivedCount,
    sentCount: offers.length,
    offers,
  };
}

/**
 * Create a new offer (purchase request or custom offer).
 */
export async function createOffer(
  buyerId: string,
  input: CreateOfferInput
): Promise<OfferSummary> {
  const { listingId, offerPrice, message, offerKind } = input;

  if (!Number.isFinite(offerPrice) || offerPrice <= 0) {
    throw new OfferServiceError('offerPrice must be greater than 0', 422);
  }

  // Validate listing exists and is active
  const { data: listing, error: listingErr } = await supabaseAdmin
    .from('listings')
    .select(`
      id,
      seller_id,
      title,
      status,
      price,
      currency,
      negotiable,
      auto_negotiate_enabled,
      auto_negotiate_floor_price
    `)
    .eq('id', listingId)
    .is('deleted_at', null)
    .maybeSingle();

  if (listingErr) {
    console.error('[Offers] Failed to verify listing:', listingErr);
    throw new OfferServiceError('Unable to verify listing', 500);
  }

  if (!listing) {
    throw new OfferServiceError('Listing not found', 404);
  }

  if (listing.status !== 'active') {
    throw new OfferServiceError(
      `This listing is currently ${listing.status} and is not accepting new offers`,
      422
    );
  }

  if (listing.seller_id === buyerId) {
    throw new OfferServiceError('You cannot make an offer on your own listing', 422);
  }

  // Check for existing pending offer from same buyer on same listing
  const { data: existingOffer } = await supabaseAdmin
    .from('offers')
    .select('id, buyer_id, seller_id, initiated_by, offer_kind')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingOffer) {
    const pendingOffer = existingOffer as Pick<
      OfferActionRecord,
      'buyer_id' | 'seller_id' | 'initiated_by' | 'offer_kind'
    >;
    const responderId = getOfferResponderUserId(pendingOffer);

    throw new OfferServiceError(
      responderId === buyerId
        ? 'You already have a seller counter-offer waiting on this listing. Respond to it from your Offers page.'
        : 'You already have a pending offer on this listing. Cancel it first to submit a new one.',
      422
    );
  }

  // Insert offer
  const { data: newOffer, error: insertErr } = await supabaseAdmin
    .from('offers')
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      offer_price: offerPrice,
      message: message?.trim() || null,
      status: 'pending',
      offer_kind: offerKind,
      initiated_by: buyerId,
      parent_offer_id: null,
    })
    .select(OFFER_SELECT)
    .single();

  if (insertErr || !newOffer) {
    console.error('[Offers] Failed to create offer:', insertErr);
    throw new OfferServiceError('Unable to create offer', 500);
  }

  const createdOffer = mapOffer(newOffer as RawOffer);

  try {
    const autoResponse = await maybeAutoRespondToCreatedOffer(
      createdOffer,
      listing as RawAutoNegotiationListing
    );

    if (autoResponse) {
      return autoResponse;
    }
  } catch (autoNegotiationError) {
    console.error('[Offers] Auto-negotiation failed for submitted offer:', autoNegotiationError);
  }

  try {
    await notifyOfferCreated(createdOffer);
  } catch (notificationError) {
    console.error('[Offers] Failed to create new-offer notification:', notificationError);
  }

  return createdOffer;
}

/**
 * Accept the current pending proposal and complete the sale for the buyer.
 */
export async function acceptOffer(
  userId: string,
  offerId: string
): Promise<OfferSummary> {
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, listing_id, buyer_id, seller_id, status, initiated_by, offer_kind')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !offer) {
    throw new OfferServiceError('Offer not found', 404);
  }

  if (offer.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${offer.status}`, 422);
  }

  const offerRecord = offer as OfferActionRecord;
  const responderId = getOfferResponderUserId(offerRecord);

  if (responderId !== userId) {
    throw new OfferServiceError('You can only accept a proposal when it is your turn to respond', 403);
  }

  const acceptedAt = new Date().toISOString();

  const { error: updateErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'accepted', updated_at: acceptedAt })
    .eq('id', offerId);

  if (updateErr) {
    console.error('[Offers] Failed to accept offer:', updateErr);
    throw new OfferServiceError('Unable to accept offer', 500);
  }

  // Mark listing as sold to the buyer who accepted the final price.
  const { data: soldListing, error: listingErr } = await supabaseAdmin
    .from('listings')
    .update({
      status: 'sold',
      sold_at: acceptedAt,
      sold_to_user_id: offer.buyer_id,
      updated_at: acceptedAt,
    })
    .eq('id', offer.listing_id)
    .is('deleted_at', null)
    .select('id, status, sold_to_user_id')
    .maybeSingle();

  if (
    listingErr ||
    !soldListing ||
    soldListing.status !== 'sold' ||
    soldListing.sold_to_user_id !== offer.buyer_id
  ) {
    console.error('[Offers] Failed to mark listing as sold:', listingErr ?? soldListing);

    const { error: rollbackErr } = await supabaseAdmin
      .from('offers')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', offerId);

    if (rollbackErr) {
      console.error('[Offers] Failed to roll back accepted offer after sale update error:', rollbackErr);
    }

    throw new OfferServiceError('Unable to complete the sale for this buyer', 500);
  }

  const { data: competingOffers, error: competingOffersError } = await supabaseAdmin
    .from('offers')
    .select('buyer_id')
    .eq('listing_id', offer.listing_id)
    .eq('status', 'pending')
    .neq('id', offerId);

  if (competingOffersError) {
    console.error('[Offers] Failed to inspect competing offers before rejection:', competingOffersError);
  }

  // Close all other pending offers for this listing because the item has sold.
  const { error: rejectErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('listing_id', offer.listing_id)
    .eq('status', 'pending')
    .neq('id', offerId);

  if (rejectErr) {
    console.error('[Offers] Failed to reject competing offers:', rejectErr);
  }

  // Re-fetch the accepted offer with full data
  const { data: updatedOffer, error: refetchErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .single();

  if (refetchErr || !updatedOffer) {
    throw new OfferServiceError('Offer accepted but unable to fetch updated data', 500);
  }

  const acceptedOffer = mapOffer(updatedOffer as RawOffer);

  try {
    await notifyOfferAccepted(acceptedOffer, userId);
  } catch (notificationError) {
    console.error('[Offers] Failed to create accepted-offer notification:', notificationError);
  }

  try {
    await notifyCompetingOffersWithdrawn(
      acceptedOffer.listing.title,
      ((competingOffers ?? []) as Array<{ buyer_id: string }>).map((item) => item.buyer_id)
    );
  } catch (notificationError) {
    console.error('[Offers] Failed to notify competing offer buyers:', notificationError);
  }

  try {
    await ensurePurchaseReceiptForAcceptedOffer(offerId);
  } catch (receiptError) {
    console.error('[Offers] Failed to create accepted-offer receipt:', receiptError);
  }

  return acceptedOffer;
}

/**
 * Reject the current pending proposal.
 */
export async function rejectOffer(
  userId: string,
  offerId: string
): Promise<OfferSummary> {
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, buyer_id, seller_id, status, initiated_by, offer_kind')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !offer) {
    throw new OfferServiceError('Offer not found', 404);
  }

  if (offer.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${offer.status}`, 422);
  }

  const offerRecord = offer as OfferActionRecord;
  const responderId = getOfferResponderUserId(offerRecord);

  if (responderId !== userId) {
    throw new OfferServiceError('You can only reject a proposal when it is your turn to respond', 403);
  }

  const { error: updateErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', offerId);

  if (updateErr) {
    console.error('[Offers] Failed to reject offer:', updateErr);
    throw new OfferServiceError('Unable to reject offer', 500);
  }

  const { data: updatedOffer, error: refetchErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .single();

  if (refetchErr || !updatedOffer) {
    throw new OfferServiceError('Offer rejected but unable to fetch updated data', 500);
  }

  const rejectedOffer = mapOffer(updatedOffer as RawOffer);

  try {
    await notifyOfferRejected(rejectedOffer, userId);
  } catch (notificationError) {
    console.error('[Offers] Failed to create rejected-offer notification:', notificationError);
  }

  return rejectedOffer;
}

/**
 * Cancel or withdraw your own pending proposal.
 */
export async function cancelOffer(
  userId: string,
  offerId: string
): Promise<OfferSummary> {
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, buyer_id, seller_id, initiated_by, offer_kind, status')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !offer) {
    throw new OfferServiceError('Offer not found', 404);
  }

  if (offer.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${offer.status}`, 422);
  }

  const offerRecord = offer as OfferActionRecord;
  const initiatorId = getOfferInitiatorUserId(offerRecord);

  if (initiatorId !== userId) {
    throw new OfferServiceError('You can only cancel a proposal that you initiated', 403);
  }

  const { error: updateErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', offerId);

  if (updateErr) {
    console.error('[Offers] Failed to cancel offer:', updateErr);
    throw new OfferServiceError('Unable to cancel offer', 500);
  }

  const { data: updatedOffer, error: refetchErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .single();

  if (refetchErr || !updatedOffer) {
    throw new OfferServiceError('Offer cancelled but unable to fetch updated data', 500);
  }

  return mapOffer(updatedOffer as RawOffer);
}

/**
 * Counter the current pending proposal. Closes the existing row and creates a linked counter row.
 */
export async function createCounterOffer(
  userId: string,
  input: CounterOfferInput
): Promise<OfferSummary> {
  const { offerId, counterPrice, message } = input;

  if (!Number.isFinite(counterPrice) || counterPrice <= 0) {
    throw new OfferServiceError('counterPrice must be greater than 0', 422);
  }

  const { data: original, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, listing_id, buyer_id, seller_id, status, initiated_by, offer_kind')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !original) {
    throw new OfferServiceError('Original offer not found', 404);
  }

  if (original.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${original.status}`, 422);
  }

  const originalRecord = original as OfferActionRecord;
  const responderId = getOfferResponderUserId(originalRecord);

  if (responderId !== userId) {
    throw new OfferServiceError('You can only counter a proposal when it is your turn to respond', 403);
  }

  const counterUpdatedAt = new Date().toISOString();
  const counterOfferId = randomUUID();

  const { error: rejectErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'rejected', updated_at: counterUpdatedAt })
    .eq('id', offerId);

  if (rejectErr) {
    console.error('[Offers] Failed to reject original offer for counter:', rejectErr);
    throw new OfferServiceError('Unable to process counter offer', 500);
  }

  const { error: insertErr } = await supabaseAdmin
    .from('offers')
    .insert({
      id: counterOfferId,
      listing_id: originalRecord.listing_id,
      buyer_id: originalRecord.buyer_id,
      seller_id: originalRecord.seller_id,
      offer_price: counterPrice,
      message: message?.trim() || null,
      status: 'pending',
      offer_kind: 'counter_offer',
      initiated_by: userId,
      parent_offer_id: offerId,
      updated_at: counterUpdatedAt,
    });

  if (insertErr) {
    console.error('[Offers] Failed to create counter offer:', insertErr);

    const { error: rollbackErr } = await supabaseAdmin
      .from('offers')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', offerId);

    if (rollbackErr) {
      console.error('[Offers] Failed to roll back original offer after counter insert error:', rollbackErr);
    }

    throw new OfferServiceError('Unable to create counter offer', 500);
  }

  const { data: counterOffer, error: refetchErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('id', counterOfferId)
    .single();

  if (refetchErr || !counterOffer) {
    console.error('[Offers] Counter offer created but failed to fetch updated data:', refetchErr);
    throw new OfferServiceError('Counter offer created but unable to fetch updated data', 500);
  }

  const createdCounterOffer = mapOffer(counterOffer as RawOffer);

  if (userId === originalRecord.buyer_id) {
    try {
      const counterOfferListing = unwrapRelation((counterOffer as RawOffer).listings);
      if (counterOfferListing) {
        const autoResponse = await maybeAutoRespondToCreatedOffer(
          createdCounterOffer,
          counterOfferListing as RawAutoNegotiationListing
        );

        if (autoResponse) {
          return autoResponse;
        }
      }
    } catch (autoNegotiationError) {
      console.error('[Offers] Auto-negotiation failed for buyer counter-offer:', autoNegotiationError);
    }
  }

  try {
    await notifyOfferCreated(createdCounterOffer);
  } catch (notificationError) {
    console.error('[Offers] Failed to create counter-offer notification:', notificationError);
  }

  return createdCounterOffer;
}

export async function createBuyerReview(
  userId: string,
  input: CreateBuyerReviewInput
): Promise<OfferReviewSummary> {
  const rating = Math.trunc(input.rating);
  const comment = trimOptional(input.comment);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new OfferServiceError('rating must be an integer between 1 and 5', 422);
  }

  if (comment && comment.length > 1000) {
    throw new OfferServiceError('comment must be 1000 characters or fewer', 422);
  }

  const offer = await getCompletedSaleOfferById(input.offerId);
  const listing = assertBuyerCanManageSale(userId, offer);

  const [existingReviewResult, openReportsResult] = await Promise.all([
    supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('listing_id', offer.listing_id)
      .eq('reviewer_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('reports')
      .select('id, listing_id, reporter_id, status, details, created_at, updated_at')
      .eq('listing_id', offer.listing_id)
      .eq('reporter_id', userId)
      .in('status', ['pending', 'reviewed'])
      .order('created_at', { ascending: false }),
  ]);

  if (existingReviewResult.error) {
    console.error('[Offers] Failed to inspect existing review:', existingReviewResult.error);
    throw new OfferServiceError('Unable to inspect existing seller review', 500);
  }

  if (existingReviewResult.data) {
    throw new OfferServiceError('You already reviewed this completed purchase', 409);
  }

  if (openReportsResult.error) {
    console.error('[Offers] Failed to inspect delivery issue reports before review:', openReportsResult.error);
    throw new OfferServiceError('Unable to inspect existing delivery issues', 500);
  }

  const hasOpenDeliveryIssue = ((openReportsResult.data ?? []) as RawReport[]).some((report) =>
    Boolean(mapDeliveryIssue(report))
  );

  if (hasOpenDeliveryIssue) {
    throw new OfferServiceError(
      'Resolve your item-not-received report before leaving a seller review',
      409
    );
  }

  const { data: createdReview, error: insertError } = await supabaseAdmin
    .from('reviews')
    .insert({
      listing_id: offer.listing_id,
      reviewer_id: userId,
      seller_id: offer.seller_id,
      rating,
      comment,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(`
      id,
      listing_id,
      reviewer_id,
      seller_id,
      rating,
      comment,
      created_at,
      updated_at,
      seller_response,
      seller_response_created_at,
      seller_response_updated_at
    `)
    .single();

  if (insertError || !createdReview) {
    console.error('[Offers] Failed to create buyer review:', insertError);
    throw new OfferServiceError(
      `Unable to save your review for "${listing.title}"`,
      500
    );
  }

  await updateOfferReceiptDeliveryStatus({
    offerId: input.offerId,
    buyerId: userId,
    deliveryStatus: 'received',
    deliveryMarkedAt: (createdReview as RawReview).created_at,
  });

  return mapOfferReview(createdReview as RawReview);
}

export async function createSellerReviewResponse(
  userId: string,
  input: CreateSellerReviewResponseInput
): Promise<OfferReviewSummary> {
  const response = trimOptional(input.response);

  if (!response || response.length < 3) {
    throw new OfferServiceError('response must be at least 3 characters long', 422);
  }

  if (response.length > 1000) {
    throw new OfferServiceError('response must be 1000 characters or fewer', 422);
  }

  const offer = await getCompletedSaleOfferById(input.offerId);
  assertSellerCanRespondToReview(userId, offer);

  const { data: existingReview, error: reviewError } = await supabaseAdmin
    .from('reviews')
    .select(`
      id,
      listing_id,
      reviewer_id,
      seller_id,
      rating,
      comment,
      created_at,
      updated_at,
      seller_response,
      seller_response_created_at,
      seller_response_updated_at
    `)
    .eq('listing_id', offer.listing_id)
    .eq('reviewer_id', offer.buyer_id)
    .maybeSingle();

  if (reviewError) {
    console.error('[Offers] Failed to inspect review before seller response:', reviewError);
    throw new OfferServiceError('Unable to inspect the buyer review for this purchase', 500);
  }

  if (!existingReview) {
    throw new OfferServiceError('The buyer has not left a review for this purchase yet', 404);
  }

  const timestamp = new Date().toISOString();
  const nextSellerResponseCreatedAt =
    (existingReview as RawReview).seller_response_created_at ?? timestamp;

  const { data: updatedReview, error: updateError } = await supabaseAdmin
    .from('reviews')
    .update({
      seller_response: response,
      seller_response_created_at: nextSellerResponseCreatedAt,
      seller_response_updated_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', existingReview.id)
    .select(`
      id,
      listing_id,
      reviewer_id,
      seller_id,
      rating,
      comment,
      created_at,
      updated_at,
      seller_response,
      seller_response_created_at,
      seller_response_updated_at
    `)
    .single();

  if (updateError || !updatedReview) {
    console.error('[Offers] Failed to save seller review response:', updateError);
    throw new OfferServiceError('Unable to save your reply to this buyer review', 500);
  }

  return mapOfferReview(updatedReview as RawReview);
}

export async function reportDeliveryIssue(
  userId: string,
  input: ReportDeliveryIssueInput
): Promise<OfferDeliveryIssueSummary> {
  const buyerStatement = trimOptional(input.buyerStatement);
  const paymentReference = trimOptional(input.paymentReference);
  const proofs = input.proofs ?? [];

  if (!buyerStatement || buyerStatement.length < 20) {
    throw new OfferServiceError(
      'buyerStatement must be at least 20 characters so the admin can review the delivery issue',
      422
    );
  }

  if (buyerStatement.length > 1000) {
    throw new OfferServiceError('buyerStatement must be 1000 characters or fewer', 422);
  }

  if (proofs.length > 3) {
    throw new OfferServiceError('You can upload up to 3 proof images per delivery issue', 422);
  }

  const offer = await getCompletedSaleOfferById(input.offerId);
  const listing = assertBuyerCanManageSale(userId, offer);

  const [existingReviewResult, existingReportsResult] = await Promise.all([
    supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('listing_id', offer.listing_id)
      .eq('reviewer_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('reports')
      .select('id, listing_id, reporter_id, status, details, created_at, updated_at')
      .eq('listing_id', offer.listing_id)
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (existingReviewResult.error) {
    console.error('[Offers] Failed to inspect review before delivery issue:', existingReviewResult.error);
    throw new OfferServiceError('Unable to inspect purchase review status', 500);
  }

  if (existingReviewResult.data) {
    throw new OfferServiceError(
      'This purchase is already marked as received, so a delivery issue cannot be opened',
      409
    );
  }

  if (existingReportsResult.error) {
    console.error('[Offers] Failed to inspect existing delivery issues:', existingReportsResult.error);
    throw new OfferServiceError('Unable to inspect existing delivery issues', 500);
  }

  const existingReports = (existingReportsResult.data ?? []) as RawReport[];
  const existingDeliveryIssue = existingReports
    .map(mapDeliveryIssue)
    .find((report) => report !== null);

  if (existingDeliveryIssue) {
    return existingDeliveryIssue;
  }
  const existingReport = existingReports[0] ?? null;

  const agreedPriceLabel = formatCurrency(
    toNumber(offer.offer_price),
    listing.currency
  );
  const uploadedProofs = await uploadDeliveryProofs(userId, proofs);
  const reportDetails = buildDeliveryDisputeDetails({
    offerId: input.offerId,
    agreedPriceLabel,
    paymentReference,
    proofUrls: uploadedProofs.map((proof) => proof.publicUrl),
    buyerStatement: buildDeliveryIssueBuyerStatement(
      buyerStatement,
      existingReport?.details
    ),
  });
  const timestamp = new Date().toISOString();

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
        .select('id, listing_id, reporter_id, status, details, created_at, updated_at')
        .single()
    : await supabaseAdmin
        .from('reports')
        .insert({
          listing_id: offer.listing_id,
          reporter_id: userId,
          reason: 'other',
          details: reportDetails,
          status: 'pending',
          created_at: timestamp,
          updated_at: timestamp,
        })
        .select('id, listing_id, reporter_id, status, details, created_at, updated_at')
        .single();

  const deliveryReport = reportWrite.data as RawReport | null;
  const reportWriteError = reportWrite.error;

  if (reportWriteError || !deliveryReport) {
    console.error('[Offers] Failed to save delivery issue report:', reportWriteError);

    if (uploadedProofs.length > 0) {
      try {
        await removeStorageObjects(
          DELIVERY_PROOF_BUCKET,
          uploadedProofs.map((proof) => proof.storagePath)
        );
      } catch (cleanupError) {
        console.error('[Offers] Failed to clean up uploaded proof images:', cleanupError);
      }
    }

    throw new OfferServiceError(
      `Unable to submit a delivery issue for "${listing.title}"`,
      500
    );
  }

  const mappedIssue = mapDeliveryIssue(deliveryReport);
  if (!mappedIssue) {
    throw new OfferServiceError('Delivery issue saved but could not be mapped correctly', 500);
  }

  await updateOfferReceiptDeliveryStatus({
    offerId: input.offerId,
    buyerId: userId,
    deliveryStatus: 'not_received',
    deliveryMarkedAt: timestamp,
    deliveryReportId: deliveryReport.id,
  });

  try {
    await notifyDeliveryIssueReported(offer.seller_id, listing.title, buyerStatement);
  } catch (notificationError) {
    console.error('[Offers] Failed to create delivery-issue notification:', notificationError);
  }

  return mappedIssue;
}
