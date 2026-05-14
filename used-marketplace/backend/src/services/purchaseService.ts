import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import type {
  MarkPurchasePaidInput,
  PurchasePaymentStatus,
  PurchaseReceiptDetail,
  PurchaseReceiptDetailResponse,
  PurchaseReceiptSource,
  PurchaseReceiptSummary,
  PurchasesDashboardResponse,
} from '../types/purchase';
import { buildDisplayName } from '../utils/profile';
import { type Relation, unwrapRelation } from '../utils/relation';
import { createNotification } from './notificationService';
import { getPublicStorageUrl } from '../utils/storage';
import { AVATAR_BUCKET, LISTING_IMAGE_BUCKET } from '../utils/storageBuckets';
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
    created_at: input.createdAt,
    updated_at: input.createdAt,
  };
}

function mapReceiptSummary(row: RawReceiptRow, currentUserId: string): PurchaseReceiptSummary {
  const listing = unwrapRelation(row.listings);
  const buyerProfile = unwrapRelation(row.buyer_profile);
  const sellerProfile = unwrapRelation(row.seller_profile);
  const paymentStatus = row.payment_status as PurchasePaymentStatus;

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canBuyerMarkPaid: row.buyer_id === currentUserId && paymentStatus === 'pending',
    canSellerConfirmPaid:
      row.seller_id === currentUserId && paymentStatus === 'buyer_marked_paid',
  };
}

function mapReceiptDetail(row: RawReceiptRow, currentUserId: string): PurchaseReceiptDetailResponse {
  const summary = mapReceiptSummary(row, currentUserId);

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
  const mapped = rows.map((row) => mapReceiptSummary(row, userId));
  const purchases = mapped.filter((receipt) => receipt.buyer.id === userId);
  const sales = mapped.filter((receipt) => receipt.seller.id === userId);

  return {
    stats: {
      purchaseCount: purchases.length,
      salesCount: sales.length,
      purchasePendingPaymentCount: purchases.filter(
        (receipt) => receipt.paymentStatus === 'pending'
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
  return mapReceiptDetail(row, userId);
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

  return mapReceiptDetail(data as RawReceiptRow, userId);
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

  return mapReceiptDetail(data as RawReceiptRow, userId);
}
