import { supabaseAdmin } from '../config/supabase';
import { type Relation, unwrapRelation } from '../utils/relation';
import { getPublicStorageUrl } from '../utils/storage';
import { LISTING_IMAGE_BUCKET } from '../utils/storageBuckets';

const DASHBOARD_TIME_ZONE = 'Asia/Kuala_Lumpur';

export interface DashboardSummary {
  stats: {
    activeListings: number;
    unreadMessages: number;
    favorites: number;
    pendingOffers: number;
  };
  insights: {
    selectedMonth: string;
    selectedMonthLabel: string;
    selectedListingId: string | null;
    selectedListingLabel: string;
    availableMonths: Array<{ value: string; label: string }>;
    availableListings: Array<{
      id: string;
      title: string;
      status: string;
      imagePath: string | null;
      views: number;
      offers: number;
    }>;
    weeklyData: Array<{
      week: string;
      shortLabel: string;
      rangeLabel: string;
      views: number;
      offers: number;
    }>;
  };
  highlightedOffer: {
    id: string;
    productName: string;
    price: string;
    imagePath: string | null;
  } | null;
  recommended: {
    id: string;
    productName: string;
    price: string;
    badge: string;
    imagePath: string | null;
  } | null;
  recentActivity: {
    id: string;
    name: string;
    badge: string;
    badgeColor: string;
    timeAgo: string;
    views: number;
    priceLabel: string;
    price: string;
    imagePath: string | null;
  }[];
}

interface RawRelatedListing {
  id: string;
  title: string;
  cover_image_path: string | null;
  currency: string | null;
  deleted_at?: string | null;
}

interface RawPendingOffer {
  id: string;
  offer_price: unknown;
  listings: Relation<RawRelatedListing>;
}

interface RawListingCard {
  id: string;
  title: string;
  price: unknown;
  currency: string | null;
  cover_image_path: string | null;
}

interface RawUserListing extends RawListingCard {
  condition: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  views_count: unknown;
}

interface RawDailyView {
  listing_id: string;
  view_date: string;
  views_count: unknown;
}

interface RawOfferMetric {
  listing_id: string;
  created_at: string | null;
}

interface RawListingImage {
  listing_id: string;
  storage_path: string;
  is_cover: boolean;
  sort_order: number;
}

function logQueryError(scope: string, error: unknown) {
  if (error) {
    console.error(`[Dashboard] ${scope} query failed:`, error);
  }
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function formatCurrency(
  value: unknown,
  currency = 'MYR',
  fallback = '-'
): string {
  const amount = toFiniteNumber(value, Number.NaN);
  if (!Number.isFinite(amount)) {
    return fallback;
  }

  try {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `RM ${amount.toFixed(2)}`;
  }
}

function getTimeAgo(createdAt: string | null): string {
  if (!createdAt) {
    return 'Listed recently';
  }

  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return 'Listed recently';
  }

  const diffHours = Math.max(
    Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60)),
    0
  );
  if (diffHours < 24) {
    return `Listed ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Listed ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function getTimeZoneParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0');

  return { year, month, day };
}

function getMonthValue(date: Date): string {
  const { year, month } = getTimeZoneParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function createUtcMonthDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function parseMonthSelection(selectedMonth?: string): { year: number; monthIndex: number } {
  if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    const [yearPart, monthPart] = selectedMonth.split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);

    if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
      return {
        year,
        monthIndex: month - 1,
      };
    }
  }

  const now = new Date();
  const { year, month } = getTimeZoneParts(now);
  return {
    year,
    monthIndex: month - 1,
  };
}

function buildAvailableMonths(): Array<{ value: string; label: string }> {
  const now = new Date();

  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = createUtcMonthDate(
      now.getUTCFullYear(),
      now.getUTCMonth() - index,
      1
    );

    return {
      value: getMonthValue(monthDate),
      label: new Intl.DateTimeFormat('en-MY', {
        month: 'long',
        year: 'numeric',
        timeZone: DASHBOARD_TIME_ZONE,
      }).format(monthDate),
    };
  });
}

function buildInsightBuckets(
  startDate: Date,
  endDate: Date
): Array<{
  week: string;
  shortLabel: string;
  rangeLabel: string;
  views: number;
  offers: number;
}> {
  const daysInMonth = endDate.getUTCDate();
  const regularWeekCount = Math.floor(daysInMonth / 7);
  const trailingDays = daysInMonth % 7;
  const totalWeeks =
    trailingDays > 0 && trailingDays < 4
      ? regularWeekCount
      : Math.ceil(daysInMonth / 7);
  const monthShort = new Intl.DateTimeFormat('en-MY', {
    month: 'short',
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(startDate);

  return Array.from({ length: totalWeeks }, (_, index) => {
    const startDay = index * 7 + 1;
    const endDay = index === totalWeeks - 1
      ? daysInMonth
      : Math.min(startDay + 6, daysInMonth);

    return {
      week: `WEEK ${index + 1}`,
      shortLabel: `Week ${index + 1}`,
      rangeLabel: `${monthShort} ${startDay}-${endDay}`,
      views: 0,
      offers: 0,
    };
  });
}

function getBucketIndexForDateOnly(
  dateValue: string,
  monthValue: string,
  bucketCount: number
): number {
  if (!dateValue.startsWith(`${monthValue}-`)) {
    return -1;
  }

  const day = Number(dateValue.split('-')[2] ?? '0');
  if (!Number.isInteger(day) || day <= 0) {
    return -1;
  }

  return Math.min(bucketCount - 1, Math.floor((day - 1) / 7));
}

function getBucketIndexForTimestamp(
  value: string | null,
  monthValue: string,
  bucketCount: number
): number {
  if (!value) {
    return -1;
  }

  const parsedDate = new Date(value);
  if (!Number.isFinite(parsedDate.getTime())) {
    return -1;
  }

  if (getMonthValue(parsedDate) !== monthValue) {
    return -1;
  }

  const { day } = getTimeZoneParts(parsedDate);
  return Math.min(bucketCount - 1, Math.floor((day - 1) / 7));
}

async function getListingImageMap(listingIds: string[]): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();

  if (listingIds.length === 0) {
    return imageMap;
  }

  const { data, error } = await supabaseAdmin
    .from('listing_images')
    .select('listing_id, storage_path, is_cover, sort_order')
    .in('listing_id', listingIds)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true });

  logQueryError('listing images', error);

  for (const image of (data ?? []) as RawListingImage[]) {
    if (!imageMap.has(image.listing_id)) {
      imageMap.set(image.listing_id, image.storage_path);
    }
  }

  return imageMap;
}

function resolveListingImagePath(
  listingId: string,
  coverImagePath: string | null | undefined,
  imageMap: Map<string, string>
): string | null {
  return getPublicStorageUrl(
    LISTING_IMAGE_BUCKET,
    coverImagePath || imageMap.get(listingId) || null
  );
}

export async function getDashboardSummary(
  userId: string,
  selectedMonth?: string,
  selectedListingId?: string
): Promise<DashboardSummary> {
  const { year, monthIndex } = parseMonthSelection(selectedMonth);
  const startDate = createUtcMonthDate(year, monthIndex, 1);
  const nextMonthStart = createUtcMonthDate(year, monthIndex + 1, 1);
  const endDate = createUtcMonthDate(year, monthIndex + 1, 0);
  const selectedMonthValue = getMonthValue(startDate);
  const selectedMonthLabel = new Intl.DateTimeFormat('en-MY', {
    month: 'long',
    year: 'numeric',
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(startDate);
  const weeklyData = buildInsightBuckets(startDate, endDate);
  const availableMonths = buildAvailableMonths();
  const [
    userListingsResult,
    favoritesResult,
    pendingOffersResult,
    convosResult,
    highestOffersResult,
    recommendedResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('listings')
      .select(
        'id, title, condition, status, created_at, updated_at, views_count, price, currency, cover_image_path'
      )
      .eq('seller_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('favorites')
      .select(`
        listing_id,
        listings (
          id,
          deleted_at
        )
      `)
      .eq('user_id', userId),
    supabaseAdmin
      .from('offers')
      .select(`
        id,
        listings (
          deleted_at
        )
      `)
      .eq('seller_id', userId)
      .eq('status', 'pending'),
    supabaseAdmin
      .from('conversations')
      .select(`
        id,
        listings (
          deleted_at
        )
      `)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`),
    supabaseAdmin
      .from('offers')
      .select(`
        id,
        offer_price,
        listings (
          id,
          title,
          cover_image_path,
          currency,
          deleted_at
        )
      `)
      .eq('seller_id', userId)
      .eq('status', 'pending')
      .order('offer_price', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('listings')
      .select('id, title, price, currency, cover_image_path')
      .neq('seller_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  logQueryError('user listings', userListingsResult.error);
  logQueryError('favorites', favoritesResult.error);
  logQueryError('pending offers', pendingOffersResult.error);
  logQueryError('conversations', convosResult.error);
  logQueryError('highest pending offer', highestOffersResult.error);
  logQueryError('recommended listing', recommendedResult.error);

  const userListings = (userListingsResult.data ?? []) as RawUserListing[];
  const listingIds = userListings.map((listing) => listing.id);
  const selectedListing =
    selectedListingId && listingIds.includes(selectedListingId)
      ? userListings.find((listing) => listing.id === selectedListingId) ?? null
      : null;
  const scopedListings = selectedListing ? [selectedListing] : userListings;
  const scopedListingIds = scopedListings.map((listing) => listing.id);

  const visibleConversationIds = ((convosResult.data ?? []) as Array<{
    id: string;
    listings: Relation<{ deleted_at: string | null }>;
  }>)
    .filter((conversation) => unwrapRelation(conversation.listings)?.deleted_at === null)
    .map((conversation) => conversation.id);

  let unreadMessages = 0;
  if (visibleConversationIds.length > 0) {
    const unreadMessagesResult = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', visibleConversationIds)
      .neq('sender_id', userId)
      .eq('is_read', false);

    logQueryError('unread messages', unreadMessagesResult.error);
    unreadMessages = unreadMessagesResult.count || 0;
  }

  const highlightedOfferCandidate =
    ((highestOffersResult.data ?? []) as RawPendingOffer[]).find(
      (offer) => unwrapRelation(offer.listings)?.deleted_at === null
    ) ?? null;
  const highlightedListing = highlightedOfferCandidate
    ? unwrapRelation(highlightedOfferCandidate.listings)
    : null;
  const recommendedListing = recommendedResult.data && recommendedResult.data.length > 0
    ? (recommendedResult.data[0] as RawListingCard)
    : null;
  const recentListings = userListings.slice(0, 5);

  const imageLookupIds = new Set<string>();
  if (highlightedListing?.id) {
    imageLookupIds.add(highlightedListing.id);
  }
  if (recommendedListing?.id) {
    imageLookupIds.add(recommendedListing.id);
  }
  for (const listing of userListings) {
    imageLookupIds.add(listing.id);
  }

  const imageMapPromise = getListingImageMap([...imageLookupIds]);
  const offersResultPromise =
    listingIds.length > 0
      ? supabaseAdmin
          .from('offers')
          .select('listing_id, created_at')
          .in('listing_id', listingIds)
      : Promise.resolve({ data: [], error: null });
  const dailyViewsResultPromise =
    scopedListingIds.length > 0
      ? supabaseAdmin
          .from('listing_daily_views')
          .select('listing_id, view_date, views_count')
          .in('listing_id', scopedListingIds)
          .gte('view_date', selectedMonthValue + '-01')
          .lt('view_date', nextMonthStart.toISOString().split('T')[0])
      : Promise.resolve({ data: [], error: null });

  const [imageMap, offersResult, dailyViewsResult] = await Promise.all([
    imageMapPromise,
    offersResultPromise,
    dailyViewsResultPromise,
  ]);

  let highlightedOffer = null;
  if (highlightedOfferCandidate) {
    const offer = highlightedOfferCandidate;
    const relatedListing = unwrapRelation(offer.listings);

    if (relatedListing) {
      highlightedOffer = {
        id: offer.id,
        productName: relatedListing.title,
        price: formatCurrency(offer.offer_price, relatedListing.currency || 'MYR'),
        imagePath: resolveListingImagePath(
          relatedListing.id,
          relatedListing.cover_image_path,
          imageMap
        ),
      };
    }
  }

  let recommended = null;
  if (recommendedListing) {
    recommended = {
      id: recommendedListing.id,
      productName: recommendedListing.title,
      price: formatCurrency(recommendedListing.price, recommendedListing.currency || 'MYR'),
      badge: 'New Arrival',
      imagePath: resolveListingImagePath(
        recommendedListing.id,
        recommendedListing.cover_image_path,
        imageMap
      ),
    };
  }

  const recentActivity = recentListings.map((listing) => {
    let badgeColor = '#3b82f6';
    if (listing.condition === 'new') badgeColor = '#059669';
    if (listing.condition === 'poor') badgeColor = '#dc2626';

    return {
      id: listing.id,
      name: listing.title,
      badge: listing.condition
        ? listing.condition.toUpperCase().replace('_', ' ')
        : 'LISTING',
      badgeColor,
      timeAgo: getTimeAgo(listing.created_at),
      views: toFiniteNumber(listing.views_count),
      priceLabel: 'Asking Price',
      price: formatCurrency(listing.price, listing.currency || 'MYR'),
      imagePath: resolveListingImagePath(listing.id, listing.cover_image_path, imageMap),
    };
  });

  const offersByListingId = new Map<string, number>();

  logQueryError('listing offers', offersResult.error);

  for (const offer of (offersResult.data ?? []) as RawOfferMetric[]) {
    offersByListingId.set(
      offer.listing_id,
      (offersByListingId.get(offer.listing_id) ?? 0) + 1
    );

    if (!scopedListingIds.includes(offer.listing_id)) {
      continue;
    }

    const bucketIndex = getBucketIndexForTimestamp(
      offer.created_at,
      selectedMonthValue,
      weeklyData.length
    );

    if (bucketIndex >= 0) {
      weeklyData[bucketIndex].offers += 1;
    }
  }

  const availableListings = userListings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    status: listing.status || 'unknown',
    imagePath: resolveListingImagePath(listing.id, listing.cover_image_path, imageMap),
    views: toFiniteNumber(listing.views_count),
    offers: offersByListingId.get(listing.id) ?? 0,
  }));

  logQueryError('daily views', dailyViewsResult.error);

  if (scopedListingIds.length > 0) {
    const listingsWithDailyViews = new Set<string>();
    for (const view of (dailyViewsResult.data ?? []) as RawDailyView[]) {
      const bucketIndex = getBucketIndexForDateOnly(
        view.view_date,
        selectedMonthValue,
        weeklyData.length
      );

      if (bucketIndex >= 0) {
        weeklyData[bucketIndex].views += toFiniteNumber(view.views_count);
        listingsWithDailyViews.add(view.listing_id);
      }
    }

    for (const listing of scopedListings) {
      if (listingsWithDailyViews.has(listing.id)) {
        continue;
      }

      const viewsCount = toFiniteNumber(listing.views_count);
      if (viewsCount <= 0) {
        continue;
      }

      const bucketIndex = getBucketIndexForTimestamp(
        listing.updated_at || listing.created_at,
        selectedMonthValue,
        weeklyData.length
      );

      if (bucketIndex >= 0) {
        weeklyData[bucketIndex].views += viewsCount;
      }
    }
  }

  return {
    stats: {
      activeListings: userListings.filter((listing) => listing.status === 'active').length,
      unreadMessages,
      favorites: ((favoritesResult.data ?? []) as Array<{
        listing_id: string;
        listings: Relation<{ id: string; deleted_at: string | null }>;
      }>).filter((favorite) => {
        const listing = unwrapRelation(favorite.listings);
        return listing !== null && listing.deleted_at === null;
      }).length,
      pendingOffers: ((pendingOffersResult.data ?? []) as Array<{
        id: string;
        listings: Relation<{ deleted_at: string | null }>;
      }>).filter((offer) => unwrapRelation(offer.listings)?.deleted_at === null).length,
    },
    insights: {
      selectedMonth: selectedMonthValue,
      selectedMonthLabel,
      selectedListingId: selectedListing?.id ?? null,
      selectedListingLabel: selectedListing?.title ?? 'All Listings',
      availableMonths,
      availableListings,
      weeklyData,
    },
    highlightedOffer,
    recommended,
    recentActivity,
  };
}
