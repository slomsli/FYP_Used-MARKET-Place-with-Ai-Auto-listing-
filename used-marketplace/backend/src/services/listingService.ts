import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import {
  type CreateListingBody,
  type CreateableListingStatus,
  type DeleteListingResult,
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
      categories (
        id,
        name,
        slug
      ),
      states (
        id,
        name,
        slug
      ),
      areas (
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
      categories (
        id,
        name,
        slug
      ),
      states (
        id,
        name,
        slug
      ),
      areas (
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
