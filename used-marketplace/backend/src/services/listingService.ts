import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';

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

type Relation<T> = T | T[] | null;

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
  categories: Relation<RawCategory>;
  states: Relation<RawState>;
  areas: Relation<RawArea>;
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

interface RawPublicLookupListing {
  category_id: number;
  state_id: number | null;
  condition: ListingCondition;
  price: unknown;
  categories: Relation<RawCategory>;
  states: Relation<RawState>;
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

const LISTING_IMAGE_BUCKET =
  process.env.SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  'listing-images';

const MAX_LISTING_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const LISTING_IMAGE_MIME_TYPES = ['image/*'];
const PUBLIC_BROWSE_LISTING_STATUS = 'active';
const PUBLIC_DETAIL_VISIBLE_STATUSES = ['active', 'reserved'] as const;

let listingImageBucketPromise: Promise<void> | null = null;

function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toInteger(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ListingServiceError('Expected a positive integer value', 422);
  }

  return parsed;
}

function trimOptional(value: string | undefined | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCurrency(currency: string | undefined): string {
  return currency?.trim() || 'MYR';
}

function humanizeStatus(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sanitizeStorageFileName(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase();
  const sanitized = trimmed
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || `listing-image-${randomUUID()}.jpg`;
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

function buildLocationSummary(rawState: Relation<RawState>, rawArea: Relation<RawArea>): ListingLocationSummary {
  const state = unwrapRelation(rawState);
  const area = unwrapRelation(rawArea);

  return {
    stateId: state?.id ?? null,
    stateName: state?.name ?? null,
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
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
  pendingOfferCountMap: Map<string, number>
): ListingSummary {
  const imagePaths = imageMap.get(listing.id) ?? [];
  const coverImagePath = listing.cover_image_path || imagePaths[0] || null;

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
    location: buildLocationSummary(listing.states, listing.areas),
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

async function replaceListingImages(
  listingId: string,
  imagePaths: string[],
  coverImagePath: string | null
): Promise<void> {
  const { error: deleteError } = await supabaseAdmin
    .from('listing_images')
    .delete()
    .eq('listing_id', listingId);

  if (deleteError) {
    console.error('[Listings] Failed to clear old listing images:', deleteError);
    throw new ListingServiceError('Failed to update listing images', 500);
  }

  if (imagePaths.length === 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('listing_images')
    .insert(
      imagePaths.map((path, index) => ({
        listing_id: listingId,
        storage_path: path,
        sort_order: index + 1,
        is_cover: path === coverImagePath,
      }))
    );

  if (insertError) {
    console.error('[Listings] Failed to save replacement listing images:', insertError);
    throw new ListingServiceError('Failed to update listing images', 500);
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
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to fetch created listing:', error);
    throw new ListingServiceError('Listing was created, but the follow-up fetch failed', 500);
  }

  if (!data) {
    throw new ListingServiceError('Created listing could not be found', 500);
  }

  const imageMap = await getListingImages([listingId]);

  return buildListingSummary(
    data as RawListing,
    imageMap,
    new Map<string, number>(),
    new Map<string, number>(),
    new Map<string, number>()
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
      avatarPath: profile.avatar_path ?? null,
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
    .eq('status', PUBLIC_BROWSE_LISTING_STATUS);

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
  const [profile, reviewsResult, listingsResult, sellerStatesResult, sellerAreasResult] =
    await Promise.all([
      ensureProfileForUserId(sellerId),
      supabaseAdmin.from('reviews').select('rating').eq('seller_id', sellerId),
      supabaseAdmin.from('listings').select('status').eq('seller_id', sellerId),
      supabaseAdmin.from('states').select('id, name, slug'),
      supabaseAdmin.from('areas').select('id, name, slug, state_id'),
    ]);

  if (reviewsResult.error) {
    console.error('[Listings] Failed to fetch seller reviews:', reviewsResult.error);
    throw new ListingServiceError('Unable to load seller review data', 500);
  }

  if (listingsResult.error) {
    console.error('[Listings] Failed to fetch seller listing stats:', listingsResult.error);
    throw new ListingServiceError('Unable to load seller listing statistics', 500);
  }

  if (sellerStatesResult.error) {
    console.error('[Listings] Failed to fetch states for seller location:', sellerStatesResult.error);
    throw new ListingServiceError('Unable to load seller location', 500);
  }

  if (sellerAreasResult.error) {
    console.error('[Listings] Failed to fetch areas for seller location:', sellerAreasResult.error);
    throw new ListingServiceError('Unable to load seller location', 500);
  }

  const ratings = reviewsResult.data ?? [];
  const totalReviews = ratings.length;
  const averageRating =
    totalReviews > 0
      ? Number(
        (
          ratings.reduce((sum, row) => sum + toNumber((row as RawRating).rating), 0) /
          totalReviews
        ).toFixed(2)
      )
      : null;

  let totalSales = 0;
  let activeListings = 0;
  for (const listing of (listingsResult.data ?? []) as RawSellerStatsListing[]) {
    if (listing.status === 'sold') {
      totalSales += 1;
    }

    if (listing.status === 'active') {
      activeListings += 1;
    }
  }

  const sellerState =
    profile
      ? (sellerStatesResult.data ?? []).find((state) => state.id === profile.state_id) ?? null
      : null;
  const sellerArea =
    profile
      ? (sellerAreasResult.data ?? []).find((area) => area.id === profile.area_id) ?? null
      : null;

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
      },
    };
  }

  return {
    id: profile.id,
    displayName: buildSellerDisplayName(profile),
    username: profile.username,
    avatarPath: profile.avatar_path ?? null,
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

  const storagePath = `listings/${sellerId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeStorageFileName(fileName)}`;
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
  };
}

export async function createListing(
  sellerId: string,
  payload: CreateListingBody
): Promise<ListingSummary> {
  const categoryId = toInteger(payload.categoryId);
  const price = toNumber(payload.price, Number.NaN);
  const stateId = payload.stateId == null ? null : toInteger(payload.stateId);
  const areaId = payload.areaId == null ? null : toInteger(payload.areaId);
  const status = payload.status ?? 'draft';
  const title = payload.title.trim();
  const description = trimOptional(payload.description);
  const brand = trimOptional(payload.brand);
  const currency = normalizeCurrency(payload.currency);
  const normalizedImagePaths = Array.from(
    new Set((payload.imagePaths ?? []).map((path) => path.trim()).filter(Boolean))
  ).slice(0, 6);
  const coverImagePath = trimOptional(payload.coverImagePath) ?? normalizedImagePaths[0] ?? null;

  if (!Number.isFinite(price) || price < 0) {
    throw new ListingServiceError('Price must be a valid non-negative number', 422);
  }

  if (areaId !== null && stateId === null) {
    throw new ListingServiceError('stateId is required when areaId is provided', 422);
  }

  await ensureCategoryExists(categoryId);

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
      condition: payload.condition,
      price,
      currency,
      negotiable: payload.negotiable ?? true,
      status,
      cover_image_path: coverImagePath,
      published_at: publishedAt,
      state_id: stateId,
      area_id: areaId,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[Listings] Failed to create listing:', error);
    throw new ListingServiceError('Failed to create listing', 500);
  }

  if (normalizedImagePaths.length > 0) {
    const { error: imageError } = await supabaseAdmin
      .from('listing_images')
      .insert(
        normalizedImagePaths.map((path, index) => ({
          listing_id: data.id,
          storage_path: path,
          sort_order: index + 1,
          is_cover: path === coverImagePath,
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

  const categoryId = toInteger(payload.categoryId);
  const price = toNumber(payload.price, Number.NaN);
  const stateId = payload.stateId == null ? null : toInteger(payload.stateId);
  const areaId = payload.areaId == null ? null : toInteger(payload.areaId);
  const status = payload.status ?? (existing.status === 'draft' ? 'draft' : 'active');
  const title = payload.title.trim();
  const description = trimOptional(payload.description);
  const brand = trimOptional(payload.brand);
  const currency = normalizeCurrency(payload.currency);
  const normalizedImagePaths = Array.from(
    new Set((payload.imagePaths ?? []).map((path) => path.trim()).filter(Boolean))
  ).slice(0, 6);
  const shouldReplaceImages =
    payload.imagePaths !== undefined || payload.coverImagePath !== undefined;
  const coverImagePath = shouldReplaceImages
    ? trimOptional(payload.coverImagePath) ?? normalizedImagePaths[0] ?? null
    : existing.cover_image_path;
  const restoringSoldListing = existing.status === 'sold' && status === 'active';

  if (existing.status === 'sold' && !restoringSoldListing) {
    throw new ListingServiceError(
      'Sold listings can only be restored back to active inventory',
      409
    );
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new ListingServiceError('Price must be a valid non-negative number', 422);
  }

  if (areaId !== null && stateId === null) {
    throw new ListingServiceError('stateId is required when areaId is provided', 422);
  }

  await ensureCategoryExists(categoryId);

  if (stateId !== null) {
    await ensureStateExists(stateId);
  }

  if (stateId !== null && areaId !== null) {
    await ensureAreaBelongsToState(areaId, stateId);
  }

  const publishedAt =
    status === 'active'
      ? existing.published_at ?? new Date().toISOString()
      : null;

  const { error } = await supabaseAdmin
    .from('listings')
    .update({
      category_id: categoryId,
      title,
      description,
      brand,
      condition: payload.condition,
      price,
      currency,
      negotiable: payload.negotiable ?? true,
      status,
      cover_image_path: coverImagePath,
      published_at: publishedAt,
      state_id: stateId,
      area_id: areaId,
      sold_at: restoringSoldListing ? null : undefined,
      sold_to_user_id: restoringSoldListing ? null : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('seller_id', sellerId);

  if (error) {
    console.error('[Listings] Failed to update listing:', error);
    throw new ListingServiceError('Failed to update listing', 500);
  }

  if (shouldReplaceImages) {
    await replaceListingImages(listingId, normalizedImagePaths, coverImagePath);
  }

  return getListingByIdForSeller(listingId, sellerId);
}

export async function markListingAsSold(
  sellerId: string,
  listingId: string
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

  const { error } = await supabaseAdmin
    .from('listings')
    .update({
      status: 'sold',
      sold_at: new Date().toISOString(),
      sold_to_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('seller_id', sellerId);

  if (error) {
    console.error('[Listings] Failed to mark listing as sold:', error);
    throw new ListingServiceError('Failed to mark listing as sold', 500);
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
    .eq('seller_id', sellerId);

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

  const cleanupOperations = [
    supabaseAdmin.from('favorites').delete().eq('listing_id', listingId),
    supabaseAdmin.from('listing_images').delete().eq('listing_id', listingId),
    supabaseAdmin.from('listing_daily_views').delete().eq('listing_id', listingId),
  ];

  const cleanupResults = await Promise.all(cleanupOperations);
  for (const cleanupResult of cleanupResults) {
    if (cleanupResult.error) {
      console.error('[Listings] Failed during listing cleanup:', cleanupResult.error);
      throw new ListingServiceError('Failed to clean up listing data before deletion', 500);
    }
  }

  const { error: deleteError } = await supabaseAdmin
    .from('listings')
    .delete()
    .eq('id', listingId)
    .eq('seller_id', sellerId);

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
    .eq('seller_id', sellerId);

  if (filters.status !== 'all') {
    listingsQuery = listingsQuery.eq('status', filters.status);
  }

  listingsQuery = applyListingSort(listingsQuery, filters.sort);

  const [filteredListingsResult, allListingsResult, ratingsResult] = await Promise.all([
    listingsQuery.limit(100),
    supabaseAdmin
      .from('listings')
      .select('id, status, price')
      .eq('seller_id', sellerId),
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

  const [favoritesResult, offersResult, imagesMap] = await Promise.all([
    listingIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin.from('favorites').select('listing_id').in('listing_id', listingIds),
    listingIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin.from('offers').select('listing_id, status').in('listing_id', listingIds),
    getListingImages(listingIds),
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
        pendingOfferCountMap
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
    .eq('status', PUBLIC_BROWSE_LISTING_STATUS);

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

export async function incrementPublicListingView(
  listingId: string
): Promise<ListingViewResult> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('id, views_count, status')
    .eq('id', listingId)
    .in('status', [...PUBLIC_DETAIL_VISIBLE_STATUSES])
    .maybeSingle();

  if (error) {
    console.error('[Listings] Failed to inspect listing before incrementing views:', error);
    throw new ListingServiceError('Unable to record listing view', 500);
  }

  if (!data) {
    throw new ListingServiceError('Listing not found', 404);
  }

  const nextViewsCount = toNumber(data.views_count) + 1;
  const today = new Date().toISOString().slice(0, 10);

  const [listingUpdateResult, dailyViewResult] = await Promise.all([
    supabaseAdmin
      .from('listings')
      .update({
        views_count: nextViewsCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId),
    supabaseAdmin
      .from('listing_daily_views')
      .select('id, views_count')
      .eq('listing_id', listingId)
      .eq('view_date', today)
      .maybeSingle(),
  ]);

  if (listingUpdateResult.error) {
    console.error('[Listings] Failed to increment listing views:', listingUpdateResult.error);
    throw new ListingServiceError('Unable to record listing view', 500);
  }

  if (dailyViewResult.error) {
    console.error('[Listings] Failed to inspect daily listing views:', dailyViewResult.error);
    throw new ListingServiceError('Unable to record listing view', 500);
  }

  if (dailyViewResult.data) {
    const currentDailyView = dailyViewResult.data as RawDailyView;
    const { error: updateDailyError } = await supabaseAdmin
      .from('listing_daily_views')
      .update({
        views_count: currentDailyView.views_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentDailyView.id);

    if (updateDailyError) {
      console.error('[Listings] Failed to update daily listing views:', updateDailyError);
      throw new ListingServiceError('Unable to record listing view', 500);
    }
  } else {
    const { error: insertDailyError } = await supabaseAdmin
      .from('listing_daily_views')
      .insert({
        listing_id: listingId,
        view_date: today,
        views_count: 1,
      });

    if (insertDailyError) {
      console.error('[Listings] Failed to create daily listing view record:', insertDailyError);
      throw new ListingServiceError('Unable to record listing view', 500);
    }
  }

  return {
    id: listingId,
    viewsCount: nextViewsCount,
  };
}
