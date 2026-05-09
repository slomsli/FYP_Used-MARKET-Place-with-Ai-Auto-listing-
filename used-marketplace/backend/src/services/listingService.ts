import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { type Relation, unwrapRelation } from '../utils/relation';
import { sanitizeStorageFileName } from '../utils/storageFile';
import { sendReply } from './messageService';
import { ensurePurchaseReceiptForManualSale } from './purchaseService';
import {
  getPublicStorageUrl,
  getPublicStorageUrls,
  normalizeStoragePathForDatabase,
  normalizeStoragePathsForDatabase,
  removeStorageObjects,
} from '../utils/storage';
import { AVATAR_BUCKET, LISTING_IMAGE_BUCKET } from '../utils/storageBuckets';
import { toNumber, trimOptional } from '../utils/value';
import { MODERATION_LISTING_BRAND } from '../utils/moderationThread';
import {
  buildListingModerationMessage,
  parseListingModerationMessage,
} from '../utils/listingModeration';

import {
  type CreateListingBody,
  type CreateableListingStatus,
  type DeleteListingResult,
  type ListingViewResult,
  type ListingAreaOption,
  type ListingCategorySummary,
  type ListingCondition,
  type ListingFilterStatus,
  type ListingLocationSummary,
  type ListingLookupOption,
  type ListingMetadata,
  type ListingSaleBuyerCandidate,
  type ListingSortOption,
  type ListingSummary,
  type MyListingsResponse,
  PUBLIC_LISTING_SORT_OPTIONS,
  type PublicListingDetailResponse,
  type PublicListingsQuery,
  type PublicListingsResponse,
  type PublicListingSortOption,
  type PublicListingSummary,
  type PublicSellerSummary,
  type UploadedListingImage,
  type UploadListingImageBody,
} from '../types/listing';

interface RawCategory {
  id: number;
  name: string;
  slug: string;
}

interface RawState {
  id: number;
  name: string;
  slug: string;
}

interface RawArea {
  id: number;
  name: string;
  slug: string;
  state_id: number;
}

interface RawListing {
  id: string;
  seller_id?: string;
  title: string;
  description: string | null;
  brand: string | null;
  condition: ListingCondition;
  price: unknown;
  currency: string;
  negotiable: boolean;
  status: string;
  cover_image_path: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  views_count: unknown;
  sold_to_user_id: string | null;
  latitude: unknown;
  longitude: unknown;
  categories: Relation<RawCategory>;
  states: Relation<RawState>;
  areas: Relation<RawArea>;
  sold_to_profile: Relation<RawProfile>;
}

interface RawProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
  created_at: string;
  state_id: number | null;
  area_id: number | null;
}

interface RawSellerStatsListing {
  status: string;
}

interface RawDailyView {
  id: number;
  views_count: number;
}

interface RawListingEngagementCountRow {
  listing_id: string;
  favorite_count: unknown;
  total_offer_count: unknown;
  pending_offer_count: unknown;
}

interface RawPublicLookupListing {
  category_id: number;
  state_id: number | null;
  condition: ListingCondition;
  price: unknown;
  categories: Relation<RawCategory>;
  states: Relation<RawState>;
}

interface RawPublicLookupsRpcPayload {
  categories?: Array<{
    id: number;
    name: string;
    slug: string;
    count: unknown;
  }>;
  states?: Array<{
    id: number;
    name: string;
    slug: string;
    count: unknown;
  }>;
  conditions?: Partial<Record<ListingCondition, unknown>>;
  priceRange?: {
    min?: unknown;
    max?: unknown;
  };
}

interface RawListingImage {
  listing_id: string;
  storage_path: string;
  is_cover: boolean;
  sort_order: number;
}

interface RawStatusListing {
  id: string;
  status: string;
  price: unknown;
}

interface RawRating {
  rating: unknown;
}

interface RawOwnedListing {
  id: string;
  status: string;
  published_at: string | null;
  cover_image_path: string | null;
}

interface RawSaleBuyerOffer {
  buyer_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  buyer_profile: Relation<RawProfile>;
}

interface RawSaleBuyerConversation {
  buyer_id: string;
  created_at: string;
  last_message_at: string;
  buyer_profile: Relation<RawProfile>;
}

interface RawModerationConversation {
  id: string;
  seller_id: string;
  listings: Relation<{
    brand: string | null;
  }>;
}

interface RawModerationMessage {
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface ListingModerationSnapshot {
  reason: string | null;
  createdAt: string | null;
  conversationId: string | null;
  adminUserId: string | null;
}

export class ListingServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ListingServiceError';
    this.status = status;
  }
}

const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const STATUS_LABELS: Record<CreateableListingStatus, string> = {
  draft: 'Draft',
  active: 'Active',
};

const MAX_LISTING_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const LISTING_IMAGE_MIME_TYPES = ['image/*'];
const PUBLIC_BROWSE_LISTING_STATUS = 'active';
const PUBLIC_DETAIL_VISIBLE_STATUSES = ['active', 'reserved', 'sold'] as const;

let listingImageBucketPromise: Promise<void> | null = null;

function toInteger(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ListingServiceError('Expected a positive integer value', 422);
  }

  return parsed;
}

function normalizeCurrency(currency: string | undefined): string {
  return currency?.trim() || 'MYR';
}

function normalizeRequiredTitle(value: string | null | undefined): string {
  const title = trimOptional(value);
  if (!title) {
    throw new ListingServiceError('Title is required', 422);
  }

  return title;
}

function normalizeOptionalCoordinate(
  value: number | string | null | undefined,
  label: 'latitude' | 'longitude',
  min: number,
  max: number
): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ListingServiceError(`${label} must be a valid number between ${min} and ${max}`, 422);
  }

  return Number(parsed.toFixed(6));
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingRpcFunction(error: { code?: string | null; message?: string | null } | null | undefined) {
  const errorCode = typeof error?.code === 'string' ? error.code : '';
  const errorMessage = typeof error?.message === 'string' ? error.message.toLowerCase() : '';

  return errorCode === 'PGRST202' || errorMessage.includes('could not find the function');
}

function humanizeStatus(status: string): string {
  if (status === 'archived') {
    return 'Paused';
  }

  if (status === 'rejected') {
    return 'Pending Review';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function ensureListingImageBucket(): Promise<void> {
  if (!listingImageBucketPromise) {
    listingImageBucketPromise = (async () => {
      const bucketResult = await supabaseAdmin.storage.getBucket(LISTING_IMAGE_BUCKET);

      if (bucketResult.data) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          LISTING_IMAGE_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_LISTING_IMAGE_SIZE_BYTES,
            allowedMimeTypes: LISTING_IMAGE_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Listings] Failed to update listing image bucket:', updateError);
          throw new ListingServiceError('Unable to prepare listing image storage', 500);
        }

        return;
      }

      const bucketErrorMessage = bucketResult.error?.message ?? '';
      const isMissingBucketError = /not found|does not exist|404/i.test(bucketErrorMessage);
      if (bucketResult.error && !isMissingBucketError) {
        console.error('[Listings] Failed to inspect listing image bucket:', bucketResult.error);
        throw new ListingServiceError('Unable to prepare listing image storage', 500);
      }

      const { error: createError } = await supabaseAdmin.storage.createBucket(
        LISTING_IMAGE_BUCKET,
        {
          public: true,
          fileSizeLimit: MAX_LISTING_IMAGE_SIZE_BYTES,
          allowedMimeTypes: LISTING_IMAGE_MIME_TYPES,
        }
      );

      if (createError && !/already exists/i.test(createError.message)) {
        console.error('[Listings] Failed to create listing image bucket:', createError);
        throw new ListingServiceError('Unable to prepare listing image storage', 500);
      }

      if (createError) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(
          LISTING_IMAGE_BUCKET,
          {
            public: true,
            fileSizeLimit: MAX_LISTING_IMAGE_SIZE_BYTES,
            allowedMimeTypes: LISTING_IMAGE_MIME_TYPES,
          }
        );

        if (updateError) {
          console.error('[Listings] Failed to sync listing image bucket settings:', updateError);
          throw new ListingServiceError('Unable to prepare listing image storage', 500);
        }
      }
    })().catch((error) => {
      listingImageBucketPromise = null;
      throw error;
    });
  }

  return listingImageBucketPromise;
}

function buildLocationSummary(
  rawState: Relation<RawState>,
  rawArea: Relation<RawArea>,
  coordinates?: Pick<RawListing, 'latitude' | 'longitude'>
): ListingLocationSummary {
  const state = unwrapRelation(rawState);
  const area = unwrapRelation(rawArea);

  return {
    stateId: state?.id ?? null,
    stateName: state?.name ?? null,
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    latitude: toNullableNumber(coordinates?.latitude),
    longitude: toNullableNumber(coordinates?.longitude),
  };
}

function buildCategorySummary(rawCategory: Relation<RawCategory>): ListingCategorySummary | null {
  const category = unwrapRelation(rawCategory);

  if (!category) {
    return null;
  }

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
  };
}

function buildListingSummary(
  listing: RawListing,
  imageMap: Map<string, string[]>,
  favoriteCountMap: Map<string, number>,
  totalOfferCountMap: Map<string, number>,
  pendingOfferCountMap: Map<string, number>,
  moderationSnapshotMap: Map<string, ListingModerationSnapshot> = new Map()
): ListingSummary {
  const imageStoragePaths = imageMap.get(listing.id) ?? [];
  const coverImageStoragePath = listing.cover_image_path || imageStoragePaths[0] || null;
  const imagePaths = getPublicStorageUrls(LISTING_IMAGE_BUCKET, imageStoragePaths);
  const coverImagePath =
    getPublicStorageUrl(LISTING_IMAGE_BUCKET, coverImageStoragePath) || imagePaths[0] || null;
  const soldToProfile = unwrapRelation(listing.sold_to_profile);
  const moderationSnapshot = moderationSnapshotMap.get(listing.id);

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    brand: listing.brand,
    price: toNumber(listing.price),
    currency: listing.currency,
    negotiable: listing.negotiable,
    status: listing.status,
    statusLabel: humanizeStatus(listing.status),
    condition: listing.condition,
    conditionLabel: CONDITION_LABELS[listing.condition],
    coverImageStoragePath,
    imageStoragePaths,
    coverImagePath,
    imagePaths,
    createdAt: listing.created_at,
    updatedAt: listing.updated_at,
    publishedAt: listing.published_at,
    viewsCount: toNumber(listing.views_count),
    favoritesCount: favoriteCountMap.get(listing.id) ?? 0,
    totalOffersCount: totalOfferCountMap.get(listing.id) ?? 0,
    pendingOffersCount: pendingOfferCountMap.get(listing.id) ?? 0,
    category: buildCategorySummary(listing.categories),
    location: buildLocationSummary(listing.states, listing.areas, listing),
    soldTo: listing.sold_to_user_id
      ? {
          id: listing.sold_to_user_id,
          displayName: buildBuyerDisplayName(soldToProfile),
          avatarPath: getPublicStorageUrl(AVATAR_BUCKET, soldToProfile?.avatar_path ?? null),
        }
      : null,
    moderationReason: moderationSnapshot?.reason ?? null,
    moderationReasonUpdatedAt: moderationSnapshot?.createdAt ?? null,
  };
}

function buildLocationLabel(location: ListingLocationSummary): string {
  if (location.areaName && location.stateName) {
    return `${location.areaName}, ${location.stateName}`;
  }

  if (location.stateName) {
    return location.stateName;
  }

  return 'Location not set';
}

function buildSellerDisplayName(profile: Pick<RawProfile, 'full_name' | 'username'>): string {
  const fullName = profile.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const username = profile.username?.trim();
  if (username) {
    return username;
  }

  return 'Seller';
}

function buildBuyerDisplayName(profile: Pick<RawProfile, 'full_name' | 'username'> | null): string {
  if (!profile) {
    return 'Buyer';
  }

  return buildSellerDisplayName(profile);
}

function getOfferCandidatePriority(status: string | null): number {
  switch (status) {
    case 'accepted':
      return 0;
    case 'pending':
      return 1;
    case 'withdrawn':
      return 2;
    case 'rejected':
      return 3;
    case 'cancelled':
      return 4;
    default:
      return 5;
  }
}

function getLatestIsoTimestamp(currentValue: string | null, nextValue: string | null): string | null {
  if (!nextValue) {
    return currentValue;
  }

  if (!currentValue) {
    return nextValue;
  }

  return new Date(nextValue).getTime() >= new Date(currentValue).getTime() ? nextValue : currentValue;
}

function buildSaleBuyerContextLabel(offerStatus: string | null, hasConversation: boolean): string {
  if (offerStatus === 'accepted') {
    return hasConversation ? 'Accepted offer and chat' : 'Accepted offer';
  }

  if (offerStatus === 'pending') {
    return hasConversation ? 'Pending offer and chat' : 'Pending offer';
  }

  if (offerStatus === 'withdrawn') {
    return hasConversation ? 'Auto-closed offer and chat' : 'Auto-closed offer';
  }

  if (offerStatus) {
    return hasConversation ? 'Past offer and chat' : 'Past offer';
  }

  return hasConversation ? 'Conversation' : 'Marketplace activity';
}

function buildPublicListingSummary(
  listing: RawListing,
  imageMap: Map<string, string[]>,
  favoriteCountMap: Map<string, number>,
  totalOfferCountMap: Map<string, number>,
  pendingOfferCountMap: Map<string, number>,
  sellerPreviewMap: Map<string, PublicListingSummary['seller']>
): PublicListingSummary {
  const summary = buildListingSummary(
    listing,
    imageMap,
    favoriteCountMap,
    totalOfferCountMap,
    pendingOfferCountMap
  );

  return {
    ...summary,
    locationLabel: buildLocationLabel(summary.location),
    seller:
      sellerPreviewMap.get(listing.seller_id ?? '') ?? {
        id: listing.seller_id ?? '',
        displayName: 'Seller',
        avatarPath: null,
      },
  };
}

function applyPublicListingSort(query: any, sort: PublicListingSortOption) {
  switch (sort) {
    case 'price_asc':
      return query.order('price', { ascending: true }).order('created_at', { ascending: false });
    case 'price_desc':
      return query.order('price', { ascending: false }).order('created_at', { ascending: false });
    case 'popular':
      return query.order('views_count', { ascending: false }).order('created_at', { ascending: false });
    case 'newest':
    default:
      return query.order('created_at', { ascending: false });
  }
}

function escapeForSupabaseLike(value: string): string {
  return value.replace(/[%_]/g, '').replace(/,/g, ' ').trim();
}

async function ensureCategoryExists(categoryId: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to validate category:', error);
    throw new ListingServiceError('Unable to validate category selection', 500);
  }

  if (!data) {
    throw new ListingServiceError('Selected category does not exist', 422);
  }
}

async function ensureStateExists(stateId: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('states')
    .select('id')
    .eq('id', stateId)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to validate state:', error);
    throw new ListingServiceError('Unable to validate state selection', 500);
  }

  if (!data) {
    throw new ListingServiceError('Selected state does not exist', 422);
  }
}

async function ensureAreaBelongsToState(areaId: number, stateId: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('areas')
    .select('id, state_id')
    .eq('id', areaId)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to validate area:', error);
    throw new ListingServiceError('Unable to validate area selection', 500);
  }

  if (!data) {
    throw new ListingServiceError('Selected area does not exist', 422);
  }

  if (data.state_id !== stateId) {
    throw new ListingServiceError('Selected area does not belong to the selected state', 422);
  }
}

async function getOwnedListingForSeller(
  listingId: string,
  sellerId: string
): Promise<RawOwnedListing> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('id, status, published_at, cover_image_path')
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to load seller listing:', error);
    throw new ListingServiceError('Unable to load the selected listing', 500);
  }

  if (!data) {
    throw new ListingServiceError('Listing not found', 404);
  }

  return data as RawOwnedListing;
}

async function loadSaleBuyerCandidatesForListing(
  listingId: string
): Promise<ListingSaleBuyerCandidate[]> {
  const [offersResult, conversationsResult] = await Promise.all([
    supabaseAdmin
      .from('offers')
      .select(`
        buyer_id,
        status,
        created_at,
        updated_at,
        buyer_profile:profiles!offers_buyer_id_fkey (
          username,
          full_name,
          avatar_path
        )
      `)
      .eq('listing_id', listingId),
    supabaseAdmin
      .from('conversations')
      .select(`
        buyer_id,
        created_at,
        last_message_at,
        buyer_profile:profiles!conversations_buyer_id_fkey (
          username,
          full_name,
          avatar_path
        )
      `)
      .eq('listing_id', listingId),
  ]);

  if (offersResult.error) {
    console.error('[Listings] Failed to load sale buyer offer candidates:', offersResult.error);
    throw new ListingServiceError('Unable to load sale buyer candidates', 500);
  }

  if (conversationsResult.error) {
    console.error(
      '[Listings] Failed to load sale buyer conversation candidates:',
      conversationsResult.error
    );
    throw new ListingServiceError('Unable to load sale buyer candidates', 500);
  }

  const candidateMap = new Map<
    string,
    {
      id: string;
      displayName: string;
      avatarPath: string | null;
      bestOfferStatus: string | null;
      hasConversation: boolean;
      lastActivityAt: string | null;
    }
  >();

  for (const offer of (offersResult.data ?? []) as RawSaleBuyerOffer[]) {
    const buyerProfile = unwrapRelation(offer.buyer_profile);
    const existingCandidate = candidateMap.get(offer.buyer_id);
    const nextOfferPriority = getOfferCandidatePriority(offer.status);
    const currentOfferPriority = getOfferCandidatePriority(existingCandidate?.bestOfferStatus ?? null);

    candidateMap.set(offer.buyer_id, {
      id: offer.buyer_id,
      displayName: existingCandidate?.displayName ?? buildBuyerDisplayName(buyerProfile),
      avatarPath:
        existingCandidate?.avatarPath ??
        getPublicStorageUrl(AVATAR_BUCKET, buyerProfile?.avatar_path ?? null),
      bestOfferStatus:
        existingCandidate && currentOfferPriority <= nextOfferPriority
          ? existingCandidate.bestOfferStatus
          : offer.status,
      hasConversation: existingCandidate?.hasConversation ?? false,
      lastActivityAt: getLatestIsoTimestamp(
        existingCandidate?.lastActivityAt ?? null,
        offer.updated_at || offer.created_at
      ),
    });
  }

  for (const conversation of (conversationsResult.data ?? []) as RawSaleBuyerConversation[]) {
    const buyerProfile = unwrapRelation(conversation.buyer_profile);
    const existingCandidate = candidateMap.get(conversation.buyer_id);

    candidateMap.set(conversation.buyer_id, {
      id: conversation.buyer_id,
      displayName: existingCandidate?.displayName ?? buildBuyerDisplayName(buyerProfile),
      avatarPath:
        existingCandidate?.avatarPath ??
        getPublicStorageUrl(AVATAR_BUCKET, buyerProfile?.avatar_path ?? null),
      bestOfferStatus: existingCandidate?.bestOfferStatus ?? null,
      hasConversation: true,
      lastActivityAt: getLatestIsoTimestamp(
        existingCandidate?.lastActivityAt ?? null,
        conversation.last_message_at || conversation.created_at
      ),
    });
  }

  return Array.from(candidateMap.values())
    .sort((left, right) => {
      const priorityDifference =
        getOfferCandidatePriority(left.bestOfferStatus) -
        getOfferCandidatePriority(right.bestOfferStatus);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const rightTimestamp = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0;
      const leftTimestamp = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0;
      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      avatarPath: candidate.avatarPath,
      contextLabel: buildSaleBuyerContextLabel(
        candidate.bestOfferStatus,
        candidate.hasConversation
      ),
      lastActivityAt: candidate.lastActivityAt,
    }));
}

async function getListingImages(listingIds: string[]): Promise<Map<string, string[]>> {
  const imageMap = new Map<string, string[]>();

  if (listingIds.length === 0) {
    return imageMap;
  }

  const { data, error } = await supabaseAdmin
    .from('listing_images')
    .select('listing_id, storage_path, is_cover, sort_order')
    .in('listing_id', listingIds)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[Listings] Failed to fetch listing images:', error);
    return imageMap;
  }

  for (const image of (data ?? []) as RawListingImage[]) {
    const existing = imageMap.get(image.listing_id) ?? [];
    existing.push(image.storage_path);
    imageMap.set(image.listing_id, existing);
  }

  return imageMap;
}

async function getLatestAdminModerationSnapshots(
  sellerId: string,
  listingIds: string[]
): Promise<Map<string, ListingModerationSnapshot>> {
  const snapshotMap = new Map<string, ListingModerationSnapshot>();

  if (listingIds.length === 0) {
    return snapshotMap;
  }

  const { data: conversations, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      seller_id,
      listings!conversations_listing_id_fkey (
        brand
      )
    `)
    .eq('buyer_id', sellerId);

  if (conversationError) {
    console.error('[Listings] Failed to inspect moderation conversations:', conversationError);
    return snapshotMap;
  }

  const moderationConversations = ((conversations ?? []) as RawModerationConversation[]).filter(
    (conversation) => unwrapRelation(conversation.listings)?.brand === MODERATION_LISTING_BRAND
  );

  if (moderationConversations.length === 0) {
    return snapshotMap;
  }

  const conversationIds = moderationConversations.map((conversation) => conversation.id);
  const adminUserIdByConversationId = new Map(
    moderationConversations.map((conversation) => [conversation.id, conversation.seller_id])
  );
  const requestedListingIdSet = new Set(listingIds);

  const { data: messages, error: messageError } = await supabaseAdmin
    .from('messages')
    .select('conversation_id, sender_id, body, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  if (messageError) {
    console.error('[Listings] Failed to inspect moderation messages:', messageError);
    return snapshotMap;
  }

  for (const message of (messages ?? []) as RawModerationMessage[]) {
    const parsedMessage = parseListingModerationMessage(message.body);
    const adminUserId = adminUserIdByConversationId.get(message.conversation_id);

    if (
      !parsedMessage ||
      !requestedListingIdSet.has(parsedMessage.listingId) ||
      !adminUserId ||
      message.sender_id !== adminUserId ||
      !parsedMessage.reason ||
      snapshotMap.has(parsedMessage.listingId)
    ) {
      continue;
    }

    snapshotMap.set(parsedMessage.listingId, {
      reason: parsedMessage.reason,
      createdAt: message.created_at,
      conversationId: message.conversation_id,
      adminUserId,
    });
  }

  return snapshotMap;
}

async function getStoredListingImagePaths(listingId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('listing_images')
    .select('storage_path')
    .eq('listing_id', listingId);

  if (error) {
    console.error('[Listings] Failed to load stored listing image paths:', error);
    throw new ListingServiceError('Failed to inspect existing listing images', 500);
  }

  const { data: listingData, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('cover_image_path')
    .eq('id', listingId)
    .is('deleted_at', null)
    .maybeSingle();

  if (listingError) {
    console.error('[Listings] Failed to inspect current listing cover image:', listingError);
    throw new ListingServiceError('Failed to inspect existing listing images', 500);
  }

  return normalizeStoragePathsForDatabase(LISTING_IMAGE_BUCKET, [
    ...((data ?? []) as Array<{ storage_path: string }>).map((image) => image.storage_path),
    listingData?.cover_image_path ?? null,
  ]);
}

async function replaceListingImages(
  listingId: string,
  imageStoragePaths: string[],
  coverImageStoragePath: string | null
): Promise<void> {
  const existingImageStoragePaths = await getStoredListingImagePaths(listingId);

  const { error: deleteError } = await supabaseAdmin
    .from('listing_images')
    .delete()
    .eq('listing_id', listingId);

  if (deleteError) {
    console.error('[Listings] Failed to clear old listing images:', deleteError);
    throw new ListingServiceError('Failed to update listing images', 500);
  }

  if (imageStoragePaths.length === 0) {
    const removedImageStoragePaths = existingImageStoragePaths.filter(
      (path) => path !== coverImageStoragePath
    );

    try {
      await removeStorageObjects(LISTING_IMAGE_BUCKET, removedImageStoragePaths);
    } catch (storageError) {
      console.error('[Listings] Failed to remove cleared listing image files:', storageError);
    }

    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('listing_images')
    .insert(
      imageStoragePaths.map((path, index) => ({
        listing_id: listingId,
        storage_path: path,
        sort_order: index + 1,
        is_cover: path === coverImageStoragePath,
      }))
    );

  if (insertError) {
    console.error('[Listings] Failed to save replacement listing images:', insertError);
    throw new ListingServiceError('Failed to update listing images', 500);
  }

  const nextImageStoragePathSet = new Set(imageStoragePaths);
  const removedImageStoragePaths = existingImageStoragePaths.filter(
    (path) => !nextImageStoragePathSet.has(path)
  );

  try {
    await removeStorageObjects(LISTING_IMAGE_BUCKET, removedImageStoragePaths);
  } catch (storageError) {
    console.error('[Listings] Failed to remove replaced listing image files:', storageError);
  }
}

async function getListingByIdForSeller(listingId: string, sellerId: string): Promise<ListingSummary> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(`
      id,
      title,
      description,
      brand,
      condition,
      price,
      currency,
      negotiable,
      status,
      cover_image_path,
      created_at,
      updated_at,
      published_at,
      views_count,
      sold_to_user_id,
      latitude,
      longitude,
      categories!listings_category_id_fkey (
        id,
        name,
        slug
      ),
      states!listings_state_id_fkey (
        id,
        name,
        slug
      ),
      areas!listings_area_id_fkey (
        id,
        name,
        slug,
        state_id
      ),
      sold_to_profile:profiles!listings_sold_to_user_id_fkey (
        id,
        username,
        full_name,
        avatar_path
      )
    `)
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to fetch created listing:', error);
    throw new ListingServiceError('Listing was created, but the follow-up fetch failed', 500);
  }

  if (!data) {
    throw new ListingServiceError('Created listing could not be found', 500);
  }

  const [imageMap, moderationSnapshots] = await Promise.all([
    getListingImages([listingId]),
    getLatestAdminModerationSnapshots(sellerId, [listingId]),
  ]);

  return buildListingSummary(
    data as RawListing,
    imageMap,
    new Map<string, number>(),
    new Map<string, number>(),
    new Map<string, number>(),
    moderationSnapshots
  );
}

export async function getSellerListingById(
  sellerId: string,
  listingId: string
): Promise<ListingSummary> {
  return getListingByIdForSeller(listingId, sellerId);
}

function incrementMapCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function applyListingSort(query: any, sort: ListingSortOption) {
  switch (sort) {
    case 'oldest':
      return query.order('created_at', { ascending: true });
    case 'price_asc':
      return query.order('price', { ascending: true });
    case 'price_desc':
      return query.order('price', { ascending: false });
    case 'views_desc':
      return query.order('views_count', { ascending: false });
    case 'recent':
    default:
      return query.order('created_at', { ascending: false });
  }
}

async function getSellerPreviewMap(
  sellerIds: string[]
): Promise<Map<string, PublicListingSummary['seller']>> {
  const previewMap = new Map<string, PublicListingSummary['seller']>();

  if (sellerIds.length === 0) {
    return previewMap;
  }

  const uniqueSellerIds = Array.from(new Set(sellerIds));
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, avatar_path')
    .in('id', uniqueSellerIds);

  if (error) {
    console.error('[Listings] Failed to fetch seller previews:', error);
    throw new ListingServiceError('Unable to load seller details for listings', 500);
  }

  for (const profile of (data ?? []) as Pick<
    RawProfile,
    'id' | 'username' | 'full_name' | 'avatar_path'
  >[]) {
    previewMap.set(profile.id, {
      id: profile.id,
      displayName: buildSellerDisplayName(profile),
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, profile.avatar_path ?? null),
    });
  }

  return previewMap;
}

async function getListingEngagementMaps(listingIds: string[]) {
  const favoriteCountMap = new Map<string, number>();
  const totalOfferCountMap = new Map<string, number>();
  const pendingOfferCountMap = new Map<string, number>();

  if (listingIds.length === 0) {
    return {
      favoriteCountMap,
      totalOfferCountMap,
      pendingOfferCountMap,
    };
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
    'get_listing_engagement_counts',
    {
      p_listing_ids: listingIds,
    }
  );

  if (!rpcError && Array.isArray(rpcData)) {
    for (const row of rpcData as RawListingEngagementCountRow[]) {
      favoriteCountMap.set(row.listing_id, toNumber(row.favorite_count));
      totalOfferCountMap.set(row.listing_id, toNumber(row.total_offer_count));
      pendingOfferCountMap.set(row.listing_id, toNumber(row.pending_offer_count));
    }

    return {
      favoriteCountMap,
      totalOfferCountMap,
      pendingOfferCountMap,
    };
  }

  if (rpcError && !isMissingRpcFunction(rpcError)) {
    console.error('[Listings] Failed to load engagement counts via RPC, falling back to row scans:', rpcError);
  }

  const [favoritesResult, offersResult] = await Promise.all([
    supabaseAdmin.from('favorites').select('listing_id').in('listing_id', listingIds),
    supabaseAdmin.from('offers').select('listing_id, status').in('listing_id', listingIds),
  ]);

  if (favoritesResult.error) {
    console.error('[Listings] Failed to fetch public favorite counts:', favoritesResult.error);
    throw new ListingServiceError('Unable to load listing favorite counts', 500);
  }

  if (offersResult.error) {
    console.error('[Listings] Failed to fetch public offer counts:', offersResult.error);
    throw new ListingServiceError('Unable to load listing offer counts', 500);
  }

  for (const row of favoritesResult.data ?? []) {
    incrementMapCount(favoriteCountMap, row.listing_id);
  }

  for (const row of offersResult.data ?? []) {
    incrementMapCount(totalOfferCountMap, row.listing_id);
    if (row.status === 'pending') {
      incrementMapCount(pendingOfferCountMap, row.listing_id);
    }
  }

  return {
    favoriteCountMap,
    totalOfferCountMap,
    pendingOfferCountMap,
  };
}

async function getPublicListingLookups(): Promise<{
  lookups: PublicListingsResponse['lookups'];
  priceRange: PublicListingsResponse['summary']['priceRange'];
}> {
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('get_public_listing_lookups');

  if (!rpcError && rpcData) {
    const payload = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as RawPublicLookupsRpcPayload;
    const conditionCounts = payload.conditions ?? {};

    return {
      lookups: {
        categories: (payload.categories ?? []).map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          count: toNumber(category.count),
        })),
        states: (payload.states ?? []).map((state) => ({
          id: state.id,
          name: state.name,
          slug: state.slug,
          count: toNumber(state.count),
        })),
        conditions: Object.entries(CONDITION_LABELS).map(([value, label]) => ({
          value: value as ListingCondition,
          label,
          count: toNumber(conditionCounts[value as ListingCondition]),
        })),
      },
      priceRange: {
        min: toNumber(payload.priceRange?.min),
        max: toNumber(payload.priceRange?.max),
      },
    };
  }

  if (rpcError && !isMissingRpcFunction(rpcError)) {
    console.error('[Listings] Failed to load browse lookups via RPC, falling back to row scans:', rpcError);
  }

  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(`
      category_id,
      state_id,
      condition,
      price,
      categories!listings_category_id_fkey (
        id,
        name,
        slug
      ),
      states!listings_state_id_fkey (
        id,
        name,
        slug
      )
    `)
    .eq('status', PUBLIC_BROWSE_LISTING_STATUS)
    .is('deleted_at', null);

  if (error) {
    console.error('[Listings] Failed to fetch public listing lookups:', error);
    throw new ListingServiceError('Unable to load browse filters', 500);
  }

  const categoryCountMap = new Map<number, { id: number; name: string; slug: string; count: number }>();
  const stateCountMap = new Map<number, { id: number; name: string; slug: string; count: number }>();
  const conditionCountMap = new Map<ListingCondition, number>();
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;

  for (const listing of (data ?? []) as RawPublicLookupListing[]) {
    const price = toNumber(listing.price, 0);
    minPrice = Math.min(minPrice, price);
    maxPrice = Math.max(maxPrice, price);

    const category = unwrapRelation(listing.categories);
    if (category) {
      const current = categoryCountMap.get(category.id);
      categoryCountMap.set(category.id, {
        id: category.id,
        name: category.name,
        slug: category.slug,
        count: (current?.count ?? 0) + 1,
      });
    }

    const state = unwrapRelation(listing.states);
    if (state) {
      const current = stateCountMap.get(state.id);
      stateCountMap.set(state.id, {
        id: state.id,
        name: state.name,
        slug: state.slug,
        count: (current?.count ?? 0) + 1,
      });
    }

    conditionCountMap.set(
      listing.condition,
      (conditionCountMap.get(listing.condition) ?? 0) + 1
    );
  }

  const categories = Array.from(categoryCountMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const states = Array.from(stateCountMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const conditions = Object.entries(CONDITION_LABELS).map(([value, label]) => ({
    value: value as ListingCondition,
    label,
    count: conditionCountMap.get(value as ListingCondition) ?? 0,
  }));

  return {
    lookups: {
      categories,
      states,
      conditions,
    },
    priceRange: {
      min: Number.isFinite(minPrice) ? minPrice : 0,
      max: maxPrice,
    },
  };
}

async function getPublicSellerSummary(
  sellerId: string
): Promise<PublicSellerSummary> {
  const [profileResult, reviewsResult, listingsResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, avatar_path, created_at, state_id, area_id')
      .eq('id', sellerId)
      .maybeSingle(),
    supabaseAdmin.from('reviews').select('rating').eq('seller_id', sellerId),
    supabaseAdmin
      .from('listings')
      .select('status')
      .eq('seller_id', sellerId)
      .is('deleted_at', null),
  ]);

  if (profileResult.error) {
    console.error('[Listings] Failed to fetch seller profile:', profileResult.error);
    throw new ListingServiceError('Unable to load seller details', 500);
  }

  if (reviewsResult.error) {
    console.error('[Listings] Failed to fetch seller reviews:', reviewsResult.error);
    throw new ListingServiceError('Unable to load seller review data', 500);
  }

  if (listingsResult.error) {
    console.error('[Listings] Failed to fetch seller listing stats:', listingsResult.error);
    throw new ListingServiceError('Unable to load seller listing statistics', 500);
  }

  const ratings = (reviewsResult.data ?? []) as RawRating[];
  const totalReviews = ratings.length;
  const averageRating =
    totalReviews > 0
      ? Number(
        (
          ratings.reduce((sum: number, row: RawRating) => sum + toNumber(row.rating), 0) /
          totalReviews
        ).toFixed(2)
      )
      : null;

  let totalSales = 0;
  let activeListings = 0;
  const profile = profileResult.data as RawProfile | null;

  const [sellerStateResult, sellerAreaResult] = await Promise.all([
    profile?.state_id
      ? supabaseAdmin
          .from('states')
          .select('id, name, slug')
          .eq('id', profile.state_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    profile?.area_id
      ? supabaseAdmin
          .from('areas')
          .select('id, name, slug, state_id')
          .eq('id', profile.area_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (sellerStateResult.error) {
    console.error('[Listings] Failed to fetch seller state:', sellerStateResult.error);
    throw new ListingServiceError('Unable to load seller location', 500);
  }

  if (sellerAreaResult.error) {
    console.error('[Listings] Failed to fetch seller area:', sellerAreaResult.error);
    throw new ListingServiceError('Unable to load seller location', 500);
  }

  for (const listing of (listingsResult.data ?? []) as RawSellerStatsListing[]) {
    if (listing.status === 'sold') {
      totalSales += 1;
    }

    if (listing.status === 'active') {
      activeListings += 1;
    }
  }

  const sellerState = (sellerStateResult.data as RawState | null) ?? null;
  const sellerArea = (sellerAreaResult.data as RawArea | null) ?? null;

  if (!profile) {
    const shortSellerId = sellerId.replace(/-/g, '').slice(0, 6) || 'member';

    return {
      id: sellerId,
      displayName: 'Seller',
      username: `seller_${shortSellerId}`.slice(0, 20),
      avatarPath: null,
      memberSince: new Date().getFullYear().toString(),
      averageRating,
      totalReviews,
      totalSales,
      activeListings,
      location: {
        stateId: null,
        stateName: null,
        areaId: null,
        areaName: null,
        latitude: null,
        longitude: null,
      },
    };
  }

  return {
    id: profile.id,
    displayName: buildSellerDisplayName(profile),
    username: profile.username,
    avatarPath: getPublicStorageUrl(AVATAR_BUCKET, profile.avatar_path ?? null),
    memberSince: new Date(profile.created_at).getFullYear().toString(),
    averageRating,
    totalReviews,
    totalSales,
    activeListings,
    location: {
      stateId: sellerState?.id ?? null,
      stateName: sellerState?.name ?? null,
      areaId: sellerArea?.id ?? null,
      areaName: sellerArea?.name ?? null,
      latitude: null,
      longitude: null,
    },
  };
}

export async function getListingMetadata(stateId?: number): Promise<ListingMetadata> {
  if (stateId !== undefined) {
    await ensureStateExists(stateId);
  }

  const [categoriesResult, statesResult, areasResult] = await Promise.all([
    supabaseAdmin
      .from('categories')
      .select('id, name, slug, parent_id')
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('states')
      .select('id, name, slug')
      .order('name', { ascending: true }),
    stateId === undefined
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
        .from('areas')
        .select('id, name, slug, state_id')
        .eq('state_id', stateId)
        .order('name', { ascending: true }),
  ]);

  if (categoriesResult.error) {
    console.error('[Listings] Failed to fetch categories:', categoriesResult.error);
    throw new ListingServiceError('Unable to load listing categories', 500);
  }

  if (statesResult.error) {
    console.error('[Listings] Failed to fetch states:', statesResult.error);
    throw new ListingServiceError('Unable to load listing states', 500);
  }

  if (areasResult.error) {
    console.error('[Listings] Failed to fetch areas:', areasResult.error);
    throw new ListingServiceError('Unable to load listing areas', 500);
  }

  return {
    categories: (categoriesResult.data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parent_id,
    })),
    states: (statesResult.data ?? []) as ListingLookupOption[],
    areas: (areasResult.data ?? []).map((area) => ({
      id: area.id,
      name: area.name,
      slug: area.slug,
      stateId: area.state_id,
    })) as ListingAreaOption[],
    conditions: Object.entries(CONDITION_LABELS).map(([value, label]) => ({
      value: value as ListingCondition,
      label,
    })),
    statuses: Object.entries(STATUS_LABELS).map(([value, label]) => ({
      value: value as CreateableListingStatus,
      label,
    })),
    currencies: ['MYR'],
  };
}

function resolveSellerListingStatus(
  existingStatus: string,
  requestedStatus: CreateListingBody['status']
): string {
  const status = requestedStatus ?? existingStatus;

  if (!['draft', 'active', 'rejected', 'archived', 'reserved', 'sold'].includes(status)) {
    throw new ListingServiceError('Unsupported listing status change request', 422);
  }

  if (existingStatus === 'sold' && status !== 'active') {
    throw new ListingServiceError(
      'Sold listings can only be restored back to active inventory',
      409
    );
  }

  if (existingStatus === 'archived' && status === 'active') {
    throw new ListingServiceError(
      'Paused listings must be resubmitted for admin review before they can go live again',
      409
    );
  }

  if (existingStatus === 'rejected' && status === 'active') {
    throw new ListingServiceError(
      'Listings that are waiting for admin review cannot be published directly',
      409
    );
  }

  if (status === 'rejected' && !['archived', 'rejected'].includes(existingStatus)) {
    throw new ListingServiceError(
      'Only paused listings can be resubmitted for admin review',
      409
    );
  }

  return status;
}

async function notifyLatestAdminOfResubmission(
  sellerId: string,
  listingId: string,
  listingTitle: string
): Promise<void> {
  const moderationSnapshots = await getLatestAdminModerationSnapshots(sellerId, [listingId]);
  const moderationSnapshot = moderationSnapshots.get(listingId);

  if (!moderationSnapshot?.conversationId) {
    return;
  }

  try {
    await sendReply(
      { id: sellerId },
      moderationSnapshot.conversationId,
      buildListingModerationMessage({
        listingId,
        listingTitle,
        eventType: 'resubmitted',
      })
    );
  } catch (error) {
    console.error('[Listings] Failed to notify admin about listing resubmission:', error);
  }
}

export async function uploadListingImage(
  sellerId: string,
  payload: UploadListingImageBody
): Promise<UploadedListingImage> {
  const fileName = trimOptional(payload.fileName);
  const contentType = trimOptional(payload.contentType)?.toLowerCase();
  const base64Data = trimOptional(payload.base64Data)?.replace(/\s/g, '');

  if (!fileName || !contentType || !base64Data) {
    throw new ListingServiceError('fileName, contentType, and base64Data are required', 422);
  }

  if (!contentType.startsWith('image/')) {
    throw new ListingServiceError('Only image uploads are supported for listings', 422);
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(base64Data, 'base64');
  } catch {
    throw new ListingServiceError('Image data is not valid base64', 422);
  }

  if (fileBuffer.byteLength === 0) {
    throw new ListingServiceError('Image data is empty', 422);
  }

  if (fileBuffer.byteLength > MAX_LISTING_IMAGE_SIZE_BYTES) {
    throw new ListingServiceError('Each image must be 8 MB or smaller', 422);
  }

  await ensureListingImageBucket();

  const storagePath = `listings/${sellerId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeStorageFileName(
    fileName,
    'listing-image'
  )}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(LISTING_IMAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error('[Listings] Failed to upload listing image:', uploadError);
    throw new ListingServiceError('Unable to upload listing image', 500);
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(storagePath);

  return {
    url: publicUrl,
    path: storagePath,
    storagePath,
  };
}

export async function createListing(
  sellerId: string,
  payload: CreateListingBody
): Promise<ListingSummary> {
  const status = payload.status ?? 'draft';

  if (status !== 'draft' && status !== 'active') {
    throw new ListingServiceError('New listings can only be saved as draft or active', 422);
  }

  const isDraft = status === 'draft';
  
  const categoryId = isDraft && !payload.categoryId ? null : toInteger(payload.categoryId!);
  const price = isDraft && payload.price === undefined ? null : toNumber(payload.price, Number.NaN);
  const stateId = payload.stateId == null ? null : toInteger(payload.stateId);
  const areaId = payload.areaId == null ? null : toInteger(payload.areaId);
  const latitude = normalizeOptionalCoordinate(payload.latitude, 'latitude', -90, 90);
  const longitude = normalizeOptionalCoordinate(payload.longitude, 'longitude', -180, 180);
  const title = normalizeRequiredTitle(payload.title);
  const description = trimOptional(payload.description);
  const brand = trimOptional(payload.brand);
  const currency = normalizeCurrency(payload.currency);
  const normalizedImageStoragePaths = normalizeStoragePathsForDatabase(LISTING_IMAGE_BUCKET, [
    ...(payload.imageStoragePaths ?? []),
    ...(payload.imagePaths ?? []),
  ]).slice(0, 6);
  const coverImageStoragePath =
    normalizeStoragePathForDatabase(
      LISTING_IMAGE_BUCKET,
      payload.coverImageStoragePath ?? payload.coverImagePath
    ) ??
    normalizedImageStoragePaths[0] ??
    null;

  if (!isDraft && (price === null || !Number.isFinite(price) || price < 0)) {
    throw new ListingServiceError('Price must be a valid non-negative number', 422);
  }

  if (areaId !== null && stateId === null) {
    throw new ListingServiceError('stateId is required when areaId is provided', 422);
  }

  if ((latitude === null) !== (longitude === null)) {
    throw new ListingServiceError('Latitude and longitude must be provided together', 422);
  }

  if (categoryId !== null) {
    await ensureCategoryExists(categoryId);
  }

  if (stateId !== null) {
    await ensureStateExists(stateId);
  }

  if (stateId !== null && areaId !== null) {
    await ensureAreaBelongsToState(areaId, stateId);
  }

  const publishedAt = status === 'active' ? new Date().toISOString() : null;

  const { data, error } = await supabaseAdmin
    .from('listings')
    .insert({
      seller_id: sellerId,
      category_id: categoryId,
      title,
      description,
      brand,
      condition: isDraft ? (payload.condition || null) : payload.condition,
      price,
      currency,
      negotiable: payload.negotiable ?? true,
      status,
      cover_image_path: coverImageStoragePath,
      published_at: publishedAt,
      state_id: stateId,
      area_id: areaId,
      latitude,
      longitude,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[Listings] Failed to create listing:', error);
    throw new ListingServiceError('Failed to create listing', 500);
  }

  if (normalizedImageStoragePaths.length > 0) {
    const { error: imageError } = await supabaseAdmin
      .from('listing_images')
      .insert(
        normalizedImageStoragePaths.map((path, index) => ({
          listing_id: data.id,
          storage_path: path,
          sort_order: index + 1,
          is_cover: path === coverImageStoragePath,
        }))
      );

    if (imageError) {
      console.error('[Listings] Listing created but image records failed to save:', imageError);
    }
  }

  return getListingByIdForSeller(data.id, sellerId);
}

export async function updateListing(
  sellerId: string,
  listingId: string,
  payload: CreateListingBody
): Promise<ListingSummary> {
  const existing = await getOwnedListingForSeller(listingId, sellerId);

  const status = resolveSellerListingStatus(existing.status, payload.status);
  const isDraft = status === 'draft';
  
  const categoryId = isDraft && !payload.categoryId ? null : toInteger(payload.categoryId!);
  const price = isDraft && payload.price === undefined ? null : toNumber(payload.price, Number.NaN);
  const stateId = payload.stateId == null ? null : toInteger(payload.stateId);
  const areaId = payload.areaId == null ? null : toInteger(payload.areaId);
  const latitude = normalizeOptionalCoordinate(payload.latitude, 'latitude', -90, 90);
  const longitude = normalizeOptionalCoordinate(payload.longitude, 'longitude', -180, 180);
  
  const title = normalizeRequiredTitle(payload.title);
  const description = trimOptional(payload.description);
  const brand = trimOptional(payload.brand);
  const currency = normalizeCurrency(payload.currency);
  const normalizedImageStoragePaths = normalizeStoragePathsForDatabase(LISTING_IMAGE_BUCKET, [
    ...(payload.imageStoragePaths ?? []),
    ...(payload.imagePaths ?? []),
  ]).slice(0, 6);
  const shouldReplaceImages =
    payload.imageStoragePaths !== undefined ||
    payload.coverImageStoragePath !== undefined ||
    payload.imagePaths !== undefined ||
    payload.coverImagePath !== undefined;
  const coverImageStoragePath = shouldReplaceImages
    ? normalizeStoragePathForDatabase(
        LISTING_IMAGE_BUCKET,
        payload.coverImageStoragePath ?? payload.coverImagePath
      ) ??
      normalizedImageStoragePaths[0] ??
      null
    : existing.cover_image_path;
  const restoringSoldListing = existing.status === 'sold' && status === 'active';
  const resubmittingPausedListing =
    (existing.status === 'archived' || existing.status === 'rejected') &&
    status === 'rejected';

  if (!isDraft && (price === null || !Number.isFinite(price) || price < 0)) {
    throw new ListingServiceError('Price must be a valid non-negative number', 422);
  }

  if (areaId !== null && stateId === null) {
    throw new ListingServiceError('stateId is required when areaId is provided', 422);
  }

  if ((latitude === null) !== (longitude === null)) {
    throw new ListingServiceError('Latitude and longitude must be provided together', 422);
  }

  if (categoryId !== null) {
    await ensureCategoryExists(categoryId);
  }

  if (stateId !== null) {
    await ensureStateExists(stateId);
  }

  if (stateId !== null && areaId !== null) {
    await ensureAreaBelongsToState(areaId, stateId);
  }

  const publishedAt =
    status === 'active'
      ? existing.published_at ?? new Date().toISOString()
      : status === 'rejected'
        ? null
        : existing.published_at;

  const updatedAt = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('listings')
    .update({
      category_id: categoryId,
      title,
      description,
      brand,
      condition: isDraft ? (payload.condition || null) : payload.condition,
      price,
      currency,
      negotiable: payload.negotiable ?? true,
      status,
      cover_image_path: coverImageStoragePath,
      published_at: publishedAt,
      state_id: stateId,
      area_id: areaId,
      latitude,
      longitude,
      sold_at: restoringSoldListing ? null : undefined,
      sold_to_user_id: restoringSoldListing ? null : undefined,
      updated_at: updatedAt,
    })
    .eq('id', listingId)
    .eq('seller_id', sellerId);

  if (error) {
    console.error('[Listings] Failed to update listing:', error);
    throw new ListingServiceError('Failed to update listing', 500);
  }

  if (shouldReplaceImages) {
    await replaceListingImages(listingId, normalizedImageStoragePaths, coverImageStoragePath);
  }

  if (resubmittingPausedListing) {
    await notifyLatestAdminOfResubmission(sellerId, listingId, title);
  }

  return getListingByIdForSeller(listingId, sellerId);
}

export async function getListingSaleBuyerCandidates(
  sellerId: string,
  listingId: string
): Promise<ListingSaleBuyerCandidate[]> {
  await getOwnedListingForSeller(listingId, sellerId);
  return loadSaleBuyerCandidatesForListing(listingId);
}

export async function markListingAsSold(
  sellerId: string,
  listingId: string,
  buyerUserId?: string | null
): Promise<ListingSummary> {
  const existing = await getOwnedListingForSeller(listingId, sellerId);

  if (existing.status === 'sold') {
    throw new ListingServiceError('This listing is already marked as sold', 409);
  }

  if (!['active', 'reserved'].includes(existing.status)) {
    throw new ListingServiceError(
      'Only active or reserved listings can be marked as sold',
      409
    );
  }

  const normalizedBuyerUserId = trimOptional(buyerUserId);
  let soldToUserId: string | null = normalizedBuyerUserId;
  const saleBuyerCandidates = await loadSaleBuyerCandidatesForListing(listingId);

  if (normalizedBuyerUserId) {
    if (!saleBuyerCandidates.some((candidate) => candidate.id === normalizedBuyerUserId)) {
      throw new ListingServiceError(
        'Selected buyer must come from an offer or conversation on this listing',
        422
      );
    }
  } else if (saleBuyerCandidates.length === 1) {
    soldToUserId = saleBuyerCandidates[0].id;
  }

  const { error } = await supabaseAdmin
    .from('listings')
    .update({
      status: 'sold',
      sold_at: new Date().toISOString(),
      sold_to_user_id: soldToUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .is('deleted_at', null);

  if (error) {
    console.error('[Listings] Failed to mark listing as sold:', error);
    throw new ListingServiceError('Failed to mark listing as sold', 500);
  }

  if (soldToUserId) {
    try {
      await ensurePurchaseReceiptForManualSale({
        listingId,
        sellerId,
        buyerId: soldToUserId,
      });
    } catch (receiptError) {
      console.error('[Listings] Failed to create manual sale receipt:', receiptError);
    }
  }

  return getListingByIdForSeller(listingId, sellerId);
}

export async function markListingAsActive(
  sellerId: string,
  listingId: string
): Promise<ListingSummary> {
  const existing = await getOwnedListingForSeller(listingId, sellerId);

  if (existing.status === 'active') {
    throw new ListingServiceError('This listing is already active', 409);
  }

  if (existing.status !== 'sold') {
    throw new ListingServiceError('Only sold listings can be marked active again', 409);
  }

  const { error } = await supabaseAdmin
    .from('listings')
    .update({
      status: 'active',
      sold_at: null,
      sold_to_user_id: null,
      published_at: existing.published_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .is('deleted_at', null);

  if (error) {
    console.error('[Listings] Failed to mark listing as active again:', error);
    throw new ListingServiceError('Failed to mark listing as active again', 500);
  }

  return getListingByIdForSeller(listingId, sellerId);
}

export async function deleteListing(
  sellerId: string,
  listingId: string
): Promise<DeleteListingResult> {
  await getOwnedListingForSeller(listingId, sellerId);

  const [offersResult, conversationsResult, reviewsResult, reportsResult] = await Promise.all([
    supabaseAdmin
      .from('offers')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId),
    supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId),
    supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId),
    supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId),
  ]);

  const guardedResults = [
    ['offers', offersResult.error],
    ['conversations', conversationsResult.error],
    ['reviews', reviewsResult.error],
    ['reports', reportsResult.error],
  ];

  for (const [scope, error] of guardedResults) {
    if (error) {
      console.error(`[Listings] Failed to check ${scope} before delete:`, error);
      throw new ListingServiceError('Unable to verify whether the listing can be deleted', 500);
    }
  }

  const hasTransactionalHistory = [
    offersResult.count ?? 0,
    conversationsResult.count ?? 0,
    reviewsResult.count ?? 0,
    reportsResult.count ?? 0,
  ].some((count) => count > 0);

  if (hasTransactionalHistory) {
    throw new ListingServiceError(
      'This listing already has marketplace activity and cannot be deleted safely',
      409
    );
  }

  const deletedAt = new Date().toISOString();

  const { error: deleteError } = await supabaseAdmin
    .from('listings')
    .update({
      deleted_at: deletedAt,
      updated_at: deletedAt,
    })
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .is('deleted_at', null);

  if (deleteError) {
    console.error('[Listings] Failed to delete listing:', deleteError);
    throw new ListingServiceError('Failed to delete listing', 500);
  }

  return {
    id: listingId,
    deleted: true,
  };
}

export async function getMyListings(
  sellerId: string,
  filters: {
    status: ListingFilterStatus;
    sort: ListingSortOption;
  }
): Promise<MyListingsResponse> {
  let listingsQuery = supabaseAdmin
    .from('listings')
    .select(`
      id,
      title,
      description,
      brand,
      condition,
      price,
      currency,
      negotiable,
      status,
      cover_image_path,
      created_at,
      updated_at,
      published_at,
      views_count,
      sold_to_user_id,
      latitude,
      longitude,
      categories!listings_category_id_fkey (
        id,
        name,
        slug
      ),
      states!listings_state_id_fkey (
        id,
        name,
        slug
      ),
      areas!listings_area_id_fkey (
        id,
        name,
        slug,
        state_id
      ),
      sold_to_profile:profiles!listings_sold_to_user_id_fkey (
        id,
        username,
        full_name,
        avatar_path
      )
    `)
    .eq('seller_id', sellerId)
    .is('deleted_at', null);

  if (filters.status !== 'all') {
    listingsQuery =
      filters.status === 'paused'
        ? listingsQuery.in('status', ['archived', 'rejected'])
        : listingsQuery.eq('status', filters.status);
  }

  listingsQuery = applyListingSort(listingsQuery, filters.sort);

  const [filteredListingsResult, allListingsResult, ratingsResult] = await Promise.all([
    listingsQuery.limit(100),
    supabaseAdmin
      .from('listings')
      .select('id, status, price')
      .eq('seller_id', sellerId)
      .is('deleted_at', null),
    supabaseAdmin
      .from('reviews')
      .select('rating')
      .eq('seller_id', sellerId),
  ]);

  if (filteredListingsResult.error) {
    console.error('[Listings] Failed to fetch seller listings:', filteredListingsResult.error);
    throw new ListingServiceError('Unable to load your listings', 500);
  }

  if (allListingsResult.error) {
    console.error('[Listings] Failed to fetch seller listing stats:', allListingsResult.error);
    throw new ListingServiceError('Unable to load listing statistics', 500);
  }

  if (ratingsResult.error) {
    console.error('[Listings] Failed to fetch seller ratings:', ratingsResult.error);
    throw new ListingServiceError('Unable to load seller rating statistics', 500);
  }

  const filteredListings = (filteredListingsResult.data ?? []) as RawListing[];
  const listingIds = filteredListings.map((listing) => listing.id);

  const [favoritesResult, offersResult, imagesMap, moderationSnapshots] = await Promise.all([
    listingIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin.from('favorites').select('listing_id').in('listing_id', listingIds),
    listingIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin.from('offers').select('listing_id, status').in('listing_id', listingIds),
    getListingImages(listingIds),
    getLatestAdminModerationSnapshots(sellerId, listingIds),
  ]);

  if (favoritesResult.error) {
    console.error('[Listings] Failed to fetch listing favorites:', favoritesResult.error);
    throw new ListingServiceError('Unable to load favorite counts for listings', 500);
  }

  if (offersResult.error) {
    console.error('[Listings] Failed to fetch listing offers:', offersResult.error);
    throw new ListingServiceError('Unable to load offer counts for listings', 500);
  }

  const favoriteCountMap = new Map<string, number>();
  for (const row of favoritesResult.data ?? []) {
    incrementMapCount(favoriteCountMap, row.listing_id);
  }

  const totalOfferCountMap = new Map<string, number>();
  const pendingOfferCountMap = new Map<string, number>();
  for (const row of offersResult.data ?? []) {
    incrementMapCount(totalOfferCountMap, row.listing_id);
    if (row.status === 'pending') {
      incrementMapCount(pendingOfferCountMap, row.listing_id);
    }
  }

  const statusCounts: MyListingsResponse['statusCounts'] = {
    all: 0,
    paused: 0,
    draft: 0,
    active: 0,
    reserved: 0,
    sold: 0,
    rejected: 0,
    archived: 0,
  };

  let totalSalesAmount = 0;
  let soldItems = 0;

  for (const listing of (allListingsResult.data ?? []) as RawStatusListing[]) {
    statusCounts.all += 1;

    if (listing.status === 'archived' || listing.status === 'rejected') {
      statusCounts.paused += 1;
    }

    if (listing.status in statusCounts) {
      const typedStatus = listing.status as keyof typeof statusCounts;
      statusCounts[typedStatus] += 1;
    }

    if (listing.status === 'sold') {
      soldItems += 1;
      totalSalesAmount += toNumber(listing.price);
    }
  }

  const ratings = (ratingsResult.data ?? []) as RawRating[];
  const totalReviews = ratings.length;
  const averageRating =
    totalReviews === 0
      ? null
      : Number(
        (
          ratings.reduce((sum, row) => sum + toNumber(row.rating), 0) / totalReviews
        ).toFixed(2)
      );

  return {
    filters,
    statusCounts,
    sellerStats: {
      totalSalesAmount,
      soldItems,
      activeItems: statusCounts.active,
      averageRating,
      totalReviews,
    },
    listings: filteredListings.map((listing) =>
      buildListingSummary(
        listing,
        imagesMap,
        favoriteCountMap,
        totalOfferCountMap,
        pendingOfferCountMap,
        moderationSnapshots
      )
    ),
  };
}

export async function getPublicListings(
  filters: PublicListingsQuery
): Promise<PublicListingsResponse> {
  let listingsQuery = supabaseAdmin
    .from('listings')
    .select(
      `
      id,
      seller_id,
      title,
      description,
      brand,
      condition,
      price,
      currency,
      negotiable,
      status,
      cover_image_path,
      created_at,
      updated_at,
      published_at,
      views_count,
      latitude,
      longitude,
      categories!listings_category_id_fkey (
        id,
        name,
        slug
      ),
      states!listings_state_id_fkey (
        id,
        name,
        slug
      ),
      areas!listings_area_id_fkey (
        id,
        name,
        slug,
        state_id
      )
    `,
      { count: 'exact' }
    )
    .eq('status', PUBLIC_BROWSE_LISTING_STATUS)
    .is('deleted_at', null);

  if (filters.categoryIds && filters.categoryIds.length > 0) {
    listingsQuery = listingsQuery.in('category_id', filters.categoryIds);
  }

  if (filters.conditions && filters.conditions.length > 0) {
    listingsQuery = listingsQuery.in('condition', filters.conditions);
  }

  if (filters.stateId) {
    listingsQuery = listingsQuery.eq('state_id', filters.stateId);
  }

  if (filters.minPrice !== undefined) {
    listingsQuery = listingsQuery.gte('price', filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    listingsQuery = listingsQuery.lte('price', filters.maxPrice);
  }

  const normalizedQuery = filters.q ? escapeForSupabaseLike(filters.q) : '';
  if (normalizedQuery) {
    listingsQuery = listingsQuery.or(
      `title.ilike.%${normalizedQuery}%,description.ilike.%${normalizedQuery}%,brand.ilike.%${normalizedQuery}%`
    );
  }

  listingsQuery = applyPublicListingSort(listingsQuery, filters.sort).range(
    filters.offset,
    filters.offset + filters.limit - 1
  );

  const [publicListingsResult, lookupResult] = await Promise.all([
    listingsQuery,
    getPublicListingLookups(),
  ]);

  if (publicListingsResult.error) {
    console.error('[Listings] Failed to fetch public listings:', publicListingsResult.error);
    throw new ListingServiceError('Unable to load marketplace listings', 500);
  }

  const listings = (publicListingsResult.data ?? []) as RawListing[];
  const listingIds = listings.map((listing) => listing.id);
  const sellerIds = listings.map((listing) => listing.seller_id ?? '').filter(Boolean);

  const [
    imagesMap,
    engagementMaps,
    sellerPreviewMap,
  ] = await Promise.all([
    getListingImages(listingIds),
    getListingEngagementMaps(listingIds),
    getSellerPreviewMap(sellerIds),
  ]);

  const total = publicListingsResult.count ?? 0;

  return {
    filters: {
      q: filters.q ?? '',
      categoryIds: filters.categoryIds ?? [],
      conditions: filters.conditions ?? [],
      stateId: filters.stateId ?? null,
      minPrice: filters.minPrice ?? null,
      maxPrice: filters.maxPrice ?? null,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    },
    pagination: {
      total,
      limit: filters.limit,
      offset: filters.offset,
      hasMore: filters.offset + listings.length < total,
    },
    summary: {
      resultCount: total,
      priceRange: lookupResult.priceRange,
    },
    lookups: lookupResult.lookups,
    listings: listings.map((listing) =>
      buildPublicListingSummary(
        listing,
        imagesMap,
        engagementMaps.favoriteCountMap,
        engagementMaps.totalOfferCountMap,
        engagementMaps.pendingOfferCountMap,
        sellerPreviewMap
      )
    ),
  };
}

export async function getPublicListingById(
  listingId: string
): Promise<PublicListingDetailResponse> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(`
      id,
      seller_id,
      title,
      description,
      brand,
      condition,
      price,
      currency,
      negotiable,
      status,
      cover_image_path,
      created_at,
      updated_at,
      published_at,
      views_count,
      latitude,
      longitude,
      categories!listings_category_id_fkey (
        id,
        name,
        slug
      ),
      states!listings_state_id_fkey (
        id,
        name,
        slug
      ),
      areas!listings_area_id_fkey (
        id,
        name,
        slug,
        state_id
      )
    `)
    .eq('id', listingId)
    .in('status', [...PUBLIC_DETAIL_VISIBLE_STATUSES])
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to fetch public listing detail:', error);
    throw new ListingServiceError('Unable to load listing details', 500);
  }

  if (!data) {
    throw new ListingServiceError('Listing not found', 404);
  }

  const listing = data as RawListing;
  const relatedQuery = supabaseAdmin
    .from('listings')
    .select(`
      id,
      seller_id,
      title,
      description,
      brand,
      condition,
      price,
      currency,
      negotiable,
      status,
      cover_image_path,
      created_at,
      updated_at,
      published_at,
      views_count,
      latitude,
      longitude,
      categories!listings_category_id_fkey (
        id,
        name,
        slug
      ),
      states!listings_state_id_fkey (
        id,
        name,
        slug
      ),
      areas!listings_area_id_fkey (
        id,
        name,
        slug,
        state_id
      )
    `)
    .eq('status', PUBLIC_BROWSE_LISTING_STATUS)
    .is('deleted_at', null)
    .neq('id', listingId)
    .limit(4);

  const listingCategory = buildCategorySummary(listing.categories);
  const listingState = buildLocationSummary(listing.states, listing.areas).stateId;

  if (listingCategory?.id) {
    relatedQuery.eq('category_id', listingCategory.id);
  } else if (listingState) {
    relatedQuery.eq('state_id', listingState);
  }

  const [relatedResult, imagesMap, engagementMaps, sellerPreviewMap, sellerSummary] =
    await Promise.all([
      relatedQuery,
      getListingImages([listing.id]),
      getListingEngagementMaps([listing.id]),
      getSellerPreviewMap([listing.seller_id ?? '']),
      getPublicSellerSummary(listing.seller_id ?? ''),
    ]);

  if (relatedResult.error) {
    console.error('[Listings] Failed to fetch related public listings:', relatedResult.error);
    throw new ListingServiceError('Unable to load related listings', 500);
  }

  const relatedListings = (relatedResult.data ?? []) as RawListing[];
  const relatedListingIds = relatedListings.map((item) => item.id);
  const relatedSellerIds = relatedListings
    .map((item) => item.seller_id ?? '')
    .filter(Boolean);

  const [relatedImagesMap, relatedEngagementMaps, relatedSellerPreviewMap] = await Promise.all([
    getListingImages(relatedListingIds),
    getListingEngagementMaps(relatedListingIds),
    getSellerPreviewMap(relatedSellerIds),
  ]);

  return {
    listing: buildPublicListingSummary(
      listing,
      imagesMap,
      engagementMaps.favoriteCountMap,
      engagementMaps.totalOfferCountMap,
      engagementMaps.pendingOfferCountMap,
      sellerPreviewMap
    ),
    seller: sellerSummary,
    related: relatedListings.map((item) =>
      buildPublicListingSummary(
        item,
        relatedImagesMap,
        relatedEngagementMaps.favoriteCountMap,
        relatedEngagementMaps.totalOfferCountMap,
        relatedEngagementMaps.pendingOfferCountMap,
        relatedSellerPreviewMap
      )
    ),
  };
}

async function tryIncrementListingViewAtomically(listingId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc('increment_listing_view_counters_atomic', {
    p_listing_id: listingId,
  });

  if (error) {
    if (isMissingRpcFunction(error)) {
      return null;
    }

    console.error('[Listings] Failed to increment listing views via RPC:', error);
    throw new ListingServiceError('Unable to record listing view', 500);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== 'object') {
    throw new ListingServiceError('Unable to record listing view', 500);
  }

  return toNumber((result as { views_count?: unknown }).views_count);
}

export async function incrementPublicListingView(
  listingId: string
): Promise<ListingViewResult> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('id, views_count, status')
    .eq('id', listingId)
    .in('status', [...PUBLIC_DETAIL_VISIBLE_STATUSES])
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to inspect listing before incrementing views:', error);
    throw new ListingServiceError('Unable to record listing view', 500);
  }

  if (!data) {
    throw new ListingServiceError('Listing not found', 404);
  }

  const atomicViewsCount = await tryIncrementListingViewAtomically(listingId);
  if (atomicViewsCount === null) {
    throw new ListingServiceError(
      'Listing view tracking is not configured. Deploy the atomic listing view SQL helper before recording views.',
      503
    );
  }

  return {
    id: listingId,
    viewsCount: atomicViewsCount,
  };
}
