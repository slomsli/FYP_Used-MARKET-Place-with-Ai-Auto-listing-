import { supabaseAdmin } from '../config/supabase';

export interface DashboardSummary {
  stats: {
    activeListings: number;
    unreadMessages: number;
    favorites: number;
    pendingOffers: number;
  };
  insights: {
    weeklyData: { week: string; views: number; offers: number }[];
  };
  highlightedOffer: {
    id: string;
    productName: string;
    price: string;
    emoji: string;
  } | null;
  recommended: {
    id: string;
    productName: string;
    price: string;
    badge: string;
    emoji: string;
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
    emoji: string;
  }[];
}

type ListingRelation = { title?: string } | { title?: string }[] | null;

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

function formatCurrency(value: unknown, fallback = '-'): string {
  const amount = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : fallback;
}

function getListingTitle(listings: ListingRelation): string {
  if (Array.isArray(listings)) {
    return listings[0]?.title || 'Item';
  }

  return listings?.title || 'Item';
}

function getTimeAgo(createdAt: string | null): string {
  if (!createdAt) {
    return 'Listed recently';
  }

  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return 'Listed recently';
  }

  const diffHours = Math.max(Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60)), 0);
  if (diffHours < 24) {
    return `Listed ${diffHours} hours ago`;
  }

  return `Listed ${Math.floor(diffHours / 24)} days ago`;
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const supabase = supabaseAdmin;

  const activeListingsResult = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', userId)
    .eq('status', 'active');
  logQueryError('active listings', activeListingsResult.error);

  const favoritesResult = await supabase
    .from('favorites')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  logQueryError('favorites', favoritesResult.error);

  const pendingOffersResult = await supabase
    .from('offers')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', userId)
    .eq('status', 'pending');
  logQueryError('pending offers', pendingOffersResult.error);

  const convosResult = await supabase
    .from('conversations')
    .select('id')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
  logQueryError('conversations', convosResult.error);

  let unreadMessages = 0;
  const convos = convosResult.data;
  if (convos && convos.length > 0) {
    const convoIds = convos.map((convo) => convo.id);
    const unreadMessagesResult = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convoIds)
      .neq('sender_id', userId)
      .eq('is_read', false);
    logQueryError('unread messages', unreadMessagesResult.error);
    unreadMessages = unreadMessagesResult.count || 0;
  }

  const highestOffersResult = await supabase
    .from('offers')
    .select(`
      id,
      offer_price,
      listings (
        title
      )
    `)
    .eq('seller_id', userId)
    .eq('status', 'pending')
    .order('offer_price', { ascending: false })
    .limit(1);
  logQueryError('highest pending offer', highestOffersResult.error);

  let highlightedOffer = null;
  const highestOffers = highestOffersResult.data;
  if (highestOffers && highestOffers.length > 0) {
    const offer = highestOffers[0] as {
      id: string;
      offer_price: unknown;
      listings: ListingRelation;
    };

    highlightedOffer = {
      id: offer.id,
      productName: getListingTitle(offer.listings),
      price: formatCurrency(offer.offer_price),
      emoji: '🏷️',
    };
  }

  const recommendedResult = await supabase
    .from('listings')
    .select('id, title, price')
    .neq('seller_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  logQueryError('recommended listing', recommendedResult.error);

  let recommended = null;
  const recommendedListings = recommendedResult.data;
  if (recommendedListings && recommendedListings.length > 0) {
    const listing = recommendedListings[0] as {
      id: string;
      title: string;
      price: unknown;
    };

    recommended = {
      id: listing.id,
      productName: listing.title,
      price: formatCurrency(listing.price),
      badge: 'New Arrival',
      emoji: '✨',
    };
  }

  const recentListingsResult = await supabase
    .from('listings')
    .select('id, title, condition, created_at, views_count, price')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
  logQueryError('recent listings', recentListingsResult.error);

  const recentActivity = (recentListingsResult.data || []).map((listing) => {
    const typedListing = listing as {
      id: string;
      title: string;
      condition: string | null;
      created_at: string | null;
      views_count: unknown;
      price: unknown;
    };

    let badgeColor = '#3b82f6';
    if (typedListing.condition === 'new') badgeColor = '#059669';
    if (typedListing.condition === 'poor') badgeColor = '#dc2626';

    return {
      id: typedListing.id,
      name: typedListing.title,
      badge: typedListing.condition
        ? typedListing.condition.toUpperCase().replace('_', ' ')
        : 'LISTING',
      badgeColor,
      timeAgo: getTimeAgo(typedListing.created_at),
      views: toFiniteNumber(typedListing.views_count),
      priceLabel: 'Asking Price',
      price: formatCurrency(typedListing.price),
      emoji: '📦',
    };
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const weeklyData = [
    { week: 'WEEK 1', views: 0, offers: 0 },
    { week: 'WEEK 2', views: 0, offers: 0 },
    { week: 'WEEK 3', views: 0, offers: 0 },
    { week: 'WEEK 4', views: 0, offers: 0 },
  ];

  const userListingsResult = await supabase
    .from('listings')
    .select('id')
    .eq('seller_id', userId);
  logQueryError('user listings', userListingsResult.error);

  const userListings = userListingsResult.data;
  if (userListings && userListings.length > 0) {
    const listingIds = userListings.map((listing) => listing.id);

    const dailyViewsResult = await supabase
      .from('listing_daily_views')
      .select('view_date, views_count')
      .in('listing_id', listingIds)
      .gte('view_date', thirtyDaysAgo.toISOString().split('T')[0]);
    logQueryError('daily views', dailyViewsResult.error);

    const recentOffersResult = await supabase
      .from('offers')
      .select('created_at')
      .in('listing_id', listingIds)
      .gte('created_at', thirtyDaysAgo.toISOString());
    logQueryError('recent offers', recentOffersResult.error);

    const dailyViews = dailyViewsResult.data;
    if (dailyViews) {
      dailyViews.forEach((view) => {
        const diffMs = Date.now() - new Date(view.view_date).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        const viewsCount = toFiniteNumber(view.views_count);

        if (diffDays <= 7) weeklyData[3].views += viewsCount;
        else if (diffDays <= 14) weeklyData[2].views += viewsCount;
        else if (diffDays <= 21) weeklyData[1].views += viewsCount;
        else if (diffDays <= 30) weeklyData[0].views += viewsCount;
      });
    }

    const recentOffers = recentOffersResult.data;
    if (recentOffers) {
      recentOffers.forEach((offer) => {
        const diffMs = Date.now() - new Date(offer.created_at).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays <= 7) weeklyData[3].offers += 1;
        else if (diffDays <= 14) weeklyData[2].offers += 1;
        else if (diffDays <= 21) weeklyData[1].offers += 1;
        else if (diffDays <= 30) weeklyData[0].offers += 1;
      });
    }
  }

  return {
    stats: {
      activeListings: activeListingsResult.count || 0,
      unreadMessages,
      favorites: favoritesResult.count || 0,
      pendingOffers: pendingOffersResult.count || 0,
    },
    insights: {
      weeklyData,
    },
    highlightedOffer,
    recommended,
    recentActivity,
  };
}
