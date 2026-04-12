import { supabaseAdmin } from '../config/supabase';

/* ── Types ─────────────────────────────────────────────── */

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

interface RawFavoriteListing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  brand: string | null;
  condition: string;
  price: unknown;
  currency: string;
  negotiable: boolean;
  status: string;
  cover_image_path: string | null;
  created_at: string;
  views_count: unknown;
  categories: Relation<RawCategory>;
  states: Relation<RawState>;
  areas: Relation<RawArea>;
}

interface RawFavorite {
  user_id: string;
  listing_id: string;
  created_at: string;
  listings: Relation<RawFavoriteListing>;
}

interface RawListingImage {
  listing_id: string;
  storage_path: string;
  is_cover: boolean;
  sort_order: number;
}

interface RawSellerProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
}

export interface FavoriteItemSummary {
  favoriteCreatedAt: string;
  listingId: string;
  title: string;
  description: string | null;
  brand: string | null;
  condition: string;
  conditionLabel: string;
  price: number;
  currency: string;
  negotiable: boolean;
  status: string;
  statusLabel: string;
  coverImagePath: string | null;
  imagePaths: string[];
  viewsCount: number;
  categoryName: string | null;
  categorySlug: string | null;
  locationLabel: string;
  seller: {
    id: string;
    displayName: string;
    avatarPath: string | null;
  };
}

export interface FavoritesPageResponse {
  totalCount: number;
  sort: FavoritesSortOption;
  items: FavoriteItemSummary[];
}

export type FavoritesSortOption = 'recent' | 'oldest' | 'price_asc' | 'price_desc' | 'name_asc';

export const FAVORITES_SORT_OPTIONS: FavoritesSortOption[] = [
  'recent',
  'oldest',
  'price_asc',
  'price_desc',
  'name_asc',
];

export class FavoriteServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'FavoriteServiceError';
    this.status = status;
  }
}

/* ── Helpers ───────────────────────────────────────────── */

const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function humanizeStatus(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildLocationLabel(
  rawState: Relation<RawState>,
  rawArea: Relation<RawArea>
): string {
  const state = unwrapRelation(rawState);
  const area = unwrapRelation(rawArea);

  if (area?.name && state?.name) return `${area.name}, ${state.name}`;
  if (state?.name) return state.name;
  return 'Location not set';
}

function buildSellerDisplayName(
  profile: Pick<RawSellerProfile, 'full_name' | 'username'>
): string {
  const fullName = profile.full_name?.trim();
  if (fullName) return fullName;
  const username = profile.username?.trim();
  if (username) return username;
  return 'Seller';
}

/* ── Image helper ──────────────────────────────────────── */

async function getListingImages(
  listingIds: string[]
): Promise<Map<string, string[]>> {
  const imageMap = new Map<string, string[]>();
  if (listingIds.length === 0) return imageMap;

  const { data, error } = await supabaseAdmin
    .from('listing_images')
    .select('listing_id, storage_path, is_cover, sort_order')
    .in('listing_id', listingIds)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[Favorites] Failed to fetch listing images:', error);
    return imageMap;
  }

  for (const image of (data ?? []) as RawListingImage[]) {
    const existing = imageMap.get(image.listing_id) ?? [];
    existing.push(image.storage_path);
    imageMap.set(image.listing_id, existing);
  }

  return imageMap;
}

/* ── Seller preview helper ─────────────────────────────── */

async function getSellerPreviewMap(
  sellerIds: string[]
): Promise<Map<string, FavoriteItemSummary['seller']>> {
  const previewMap = new Map<string, FavoriteItemSummary['seller']>();
  if (sellerIds.length === 0) return previewMap;

  const uniqueSellerIds = Array.from(new Set(sellerIds));
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, avatar_path')
    .in('id', uniqueSellerIds);

  if (error) {
    console.error('[Favorites] Failed to fetch seller previews:', error);
    return previewMap;
  }

  for (const profile of (data ?? []) as RawSellerProfile[]) {
    previewMap.set(profile.id, {
      id: profile.id,
      displayName: buildSellerDisplayName(profile),
      avatarPath: profile.avatar_path ?? null,
    });
  }

  return previewMap;
}

/* ── Main service functions ────────────────────────────── */

/**
 * Get all favorites for a user with full listing details.
 */
export async function getUserFavorites(
  userId: string,
  sort: FavoritesSortOption = 'recent'
): Promise<FavoritesPageResponse> {
  // 1) Fetch all favorite rows with listing data
  const { data: rawFavorites, error } = await supabaseAdmin
    .from('favorites')
    .select(`
      user_id,
      listing_id,
      created_at,
      listings (
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
        views_count,
        categories!listings_category_id_fkey (
          id, name, slug
        ),
        states!listings_state_id_fkey (
          id, name, slug
        ),
        areas!listings_area_id_fkey (
          id, name, slug, state_id
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Favorites] Failed to fetch user favorites:', error);
    throw new FavoriteServiceError('Unable to load favorites', 500);
  }

  const favorites = (rawFavorites ?? []) as RawFavorite[];

  // Filter out favorites whose listing no longer exists
  const validFavorites = favorites.filter((fav) => {
    const listing = unwrapRelation(fav.listings);
    return listing !== null;
  });

  // 2) Collect listing IDs and seller IDs for batch lookups
  const listingIds: string[] = [];
  const sellerIds: string[] = [];
  for (const fav of validFavorites) {
    const listing = unwrapRelation(fav.listings)!;
    listingIds.push(listing.id);
    if (listing.seller_id) sellerIds.push(listing.seller_id);
  }

  // 3) Batch fetch images and seller profiles
  const [imageMap, sellerMap] = await Promise.all([
    getListingImages(listingIds),
    getSellerPreviewMap(sellerIds),
  ]);

  // 4) Build response items
  let items: FavoriteItemSummary[] = validFavorites.map((fav) => {
    const listing = unwrapRelation(fav.listings)!;
    const category = unwrapRelation(listing.categories);
    const imagePaths = imageMap.get(listing.id) ?? [];
    const coverImagePath = listing.cover_image_path || imagePaths[0] || null;

    return {
      favoriteCreatedAt: fav.created_at,
      listingId: listing.id,
      title: listing.title,
      description: listing.description,
      brand: listing.brand,
      condition: listing.condition,
      conditionLabel: CONDITION_LABELS[listing.condition] ?? listing.condition,
      price: toNumber(listing.price),
      currency: listing.currency || 'MYR',
      negotiable: listing.negotiable,
      status: listing.status,
      statusLabel: humanizeStatus(listing.status),
      coverImagePath,
      imagePaths,
      viewsCount: toNumber(listing.views_count),
      categoryName: category?.name ?? null,
      categorySlug: category?.slug ?? null,
      locationLabel: buildLocationLabel(listing.states, listing.areas),
      seller: sellerMap.get(listing.seller_id) ?? {
        id: listing.seller_id,
        displayName: 'Seller',
        avatarPath: null,
      },
    };
  });

  // 5) Sort
  switch (sort) {
    case 'oldest':
      items.sort(
        (a, b) =>
          new Date(a.favoriteCreatedAt).getTime() -
          new Date(b.favoriteCreatedAt).getTime()
      );
      break;
    case 'price_asc':
      items.sort((a, b) => a.price - b.price);
      break;
    case 'price_desc':
      items.sort((a, b) => b.price - a.price);
      break;
    case 'name_asc':
      items.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'recent':
    default:
      // Already sorted by created_at desc from the query
      break;
  }

  return {
    totalCount: items.length,
    sort,
    items,
  };
}

/**
 * Toggle a favorite: add if missing, remove if exists.
 * Returns the new state (favorited true/false).
 */
export async function toggleFavorite(
  userId: string,
  listingId: string
): Promise<{ favorited: boolean; listingId: string }> {
  if (!listingId?.trim()) {
    throw new FavoriteServiceError('listingId is required', 422);
  }

  // Check if listing exists
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError) {
    console.error('[Favorites] Failed to verify listing:', listingError);
    throw new FavoriteServiceError('Unable to verify listing', 500);
  }

  if (!listing) {
    throw new FavoriteServiceError('Listing not found', 404);
  }

  // Check if already favorited
  const { data: existing, error: checkError } = await supabaseAdmin
    .from('favorites')
    .select('user_id')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (checkError) {
    console.error('[Favorites] Failed to check existing favorite:', checkError);
    throw new FavoriteServiceError('Unable to check favorite status', 500);
  }

  if (existing) {
    // Remove favorite
    const { error: deleteError } = await supabaseAdmin
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);

    if (deleteError) {
      console.error('[Favorites] Failed to remove favorite:', deleteError);
      throw new FavoriteServiceError('Unable to remove favorite', 500);
    }

    return { favorited: false, listingId };
  }

  // Add favorite
  const { error: insertError } = await supabaseAdmin
    .from('favorites')
    .insert({ user_id: userId, listing_id: listingId });

  if (insertError) {
    console.error('[Favorites] Failed to add favorite:', insertError);
    throw new FavoriteServiceError('Unable to add favorite', 500);
  }

  return { favorited: true, listingId };
}

/**
 * Check if specific listings are favorited by the user.
 */
export async function checkFavoriteStatus(
  userId: string,
  listingIds: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};

  if (listingIds.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId)
    .in('listing_id', listingIds);

  if (error) {
    console.error('[Favorites] Failed to check favorite status:', error);
    throw new FavoriteServiceError('Unable to check favorite status', 500);
  }

  const favoritedSet = new Set((data ?? []).map((row) => row.listing_id));
  for (const id of listingIds) {
    result[id] = favoritedSet.has(id);
  }

  return result;
}
