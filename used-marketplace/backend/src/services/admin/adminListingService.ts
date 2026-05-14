import { supabaseAdmin } from '../../config/supabase';
import { getPublicStorageUrl, getPublicStorageUrls } from '../../utils/storage';
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type ReportReason,
  type ReportStatus,
} from '../../types/report';
import { parseDeliveryDisputeDetails } from '../../utils/deliveryDispute';
import {
  buildListingModerationMessage,
  parseListingModerationMessage,
} from '../../utils/listingModeration';
import { sendMessage } from '../messageService';
import { ensureAdminModerationThread } from './adminUserService';
import {
  type AdminDeleteListingResponse,
  type AdminListingDetailResponse,
  type AdminListingListItem,
  type AdminListingModerationSnapshot,
  type AdminListingStatusUpdateResponse,
  type AdminListingsQuery,
  type AdminListingsResponse,
  type RawAdminListing,
  type RawAdminListingDetail,
  type RawAdminReport,
  type RawListingImage,
  type RawModerationConversation,
  type RawModerationMessage,
  type RawProfile,
  type RawRating,
  type UpdateAdminListingStatusInput,
  AVATAR_BUCKET,
  CONDITION_LABELS,
  LISTING_IMAGE_BUCKET,
  MODERATION_LISTING_BRAND,
  AdminServiceError,
  buildLocationLabel,
  buildLocationSummary,
  buildProfileDisplayName,
  getProfileById,
  humanizeAdminListingStatus,
  incrementStringMapCount,
  isListingHiddenFromBrowse,
  normalizeAdminListingStatusFilter,
  normalizeId,
  normalizePage,
  normalizePageSize,
  normalizeRequiredReason,
  humanizeValue,
  toNumber,
  unwrapRelation,
} from './shared';

function buildAdminListingListItem(
  listing: RawAdminListing,
  sellerProfile: RawProfile,
  counts: {
    offerCount: number;
    conversationCount: number;
    reportCount: number;
    pendingReportCount: number;
  }
): AdminListingListItem {
  const listingState = unwrapRelation(listing.states);
  const listingArea = unwrapRelation(listing.areas);
  const listingCategory = unwrapRelation(listing.categories);
  const sellerState = unwrapRelation(sellerProfile.states);
  const sellerArea = unwrapRelation(sellerProfile.areas);

  return {
    id: listing.id,
    title: listing.title,
    price: Number(listing.price ?? 0),
    currency: listing.currency,
    status: listing.status,
    statusLabel: humanizeAdminListingStatus(listing.status),
    coverImagePath: getPublicStorageUrl(LISTING_IMAGE_BUCKET, listing.cover_image_path),
    createdAt: listing.created_at,
    updatedAt: listing.updated_at,
    viewsCount: Number(listing.views_count ?? 0),
    locationLabel: buildLocationLabel(listingState?.name ?? null, listingArea?.name ?? null),
    categoryName: listingCategory?.name ?? null,
    seller: {
      id: sellerProfile.id,
      fullName: buildProfileDisplayName(sellerProfile),
      username: sellerProfile.username,
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, sellerProfile.avatar_path),
      locationLabel: buildLocationLabel(sellerState?.name ?? null, sellerArea?.name ?? null),
    },
    offerCount: counts.offerCount,
    conversationCount: counts.conversationCount,
    reportCount: counts.reportCount,
    pendingReportCount: counts.pendingReportCount,
    isFlagged: counts.pendingReportCount > 0,
  };
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
    console.error('[Admin] Failed to load listing images:', error);
    throw new AdminServiceError('Unable to load listing images', 500);
  }

  for (const image of (data ?? []) as RawListingImage[]) {
    const currentImages = imageMap.get(image.listing_id) ?? [];
    currentImages.push(image.storage_path);
    imageMap.set(image.listing_id, currentImages);
  }

  return imageMap;
}

async function getLatestAdminModerationSnapshot(
  sellerId: string,
  listingId: string
): Promise<AdminListingModerationSnapshot | null> {
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
    console.error('[Admin] Failed to inspect moderation conversations:', conversationError);
    throw new AdminServiceError('Unable to load listing moderation history', 500);
  }

  const moderationConversations = ((conversations ?? []) as RawModerationConversation[]).filter(
    (conversation) => unwrapRelation(conversation.listings)?.brand === MODERATION_LISTING_BRAND
  );

  if (moderationConversations.length === 0) {
    return null;
  }

  const conversationIds = moderationConversations.map((conversation) => conversation.id);
  const adminUserIdByConversationId = new Map(
    moderationConversations.map((conversation) => [conversation.id, conversation.seller_id])
  );

  const { data: messages, error: messageError } = await supabaseAdmin
    .from('messages')
    .select('conversation_id, sender_id, body, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  if (messageError) {
    console.error('[Admin] Failed to inspect moderation messages:', messageError);
    throw new AdminServiceError('Unable to load listing moderation history', 500);
  }

  for (const message of (messages ?? []) as RawModerationMessage[]) {
    const parsedMessage = parseListingModerationMessage(message.body);
    const adminUserId = adminUserIdByConversationId.get(message.conversation_id);

    if (
      !parsedMessage ||
      parsedMessage.listingId !== listingId ||
      !adminUserId ||
      message.sender_id !== adminUserId
    ) {
      continue;
    }

    return {
      eventType: parsedMessage.eventType,
      reason: parsedMessage.reason,
      createdAt: message.created_at,
    };
  }

  return null;
}

async function buildAdminSellerDetail(
  sellerProfile: RawProfile
): Promise<AdminListingDetailResponse['seller']> {
  const [reviewsResult, listingsResult] = await Promise.all([
    supabaseAdmin.from('reviews').select('rating').eq('seller_id', sellerProfile.id),
    supabaseAdmin
      .from('listings')
      .select('status, brand')
      .eq('seller_id', sellerProfile.id)
      .is('deleted_at', null),
  ]);

  if (reviewsResult.error) {
    console.error('[Admin] Failed to load seller reviews:', reviewsResult.error);
    throw new AdminServiceError('Unable to load seller review history', 500);
  }

  if (listingsResult.error) {
    console.error('[Admin] Failed to load seller listing statistics:', listingsResult.error);
    throw new AdminServiceError('Unable to load seller listing statistics', 500);
  }

  const ratings = (reviewsResult.data ?? []) as RawRating[];
  const totalReviews = ratings.length;
  const averageRating =
    totalReviews > 0
      ? Number(
          (
            ratings.reduce((sum, row) => sum + toNumber(row.rating), 0) / totalReviews
          ).toFixed(2)
        )
      : null;

  let totalSales = 0;
  let activeListings = 0;

  for (const listing of (listingsResult.data ?? []) as Array<{ status: string; brand: string | null }>) {
    if (listing.brand === MODERATION_LISTING_BRAND) {
      continue;
    }

    if (listing.status === 'sold') {
      totalSales += 1;
    }

    if (listing.status === 'active') {
      activeListings += 1;
    }
  }

  const location = buildLocationSummary(sellerProfile.states, sellerProfile.areas);

  return {
    id: sellerProfile.id,
    fullName: buildProfileDisplayName(sellerProfile),
    username: sellerProfile.username,
    avatarPath: getPublicStorageUrl(AVATAR_BUCKET, sellerProfile.avatar_path),
    memberSince: sellerProfile.created_at,
    averageRating,
    totalReviews,
    totalSales,
    activeListings,
    location,
    locationLabel: buildLocationLabel(location.stateName, location.areaName),
  };
}

async function sendListingModerationEventToSeller(input: {
  adminUserId: string;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  eventType: 'paused' | 'rejected' | 'approved' | 'deleted';
  reason?: string | null;
}): Promise<void> {
  const moderationThread = await ensureAdminModerationThread(input.adminUserId, input.sellerId);

  await sendMessage(
    { id: input.adminUserId },
    {
      listing_id: moderationThread.listingId,
      recipient_id: input.sellerId,
      content: buildListingModerationMessage({
        listingId: input.listingId,
        listingTitle: input.listingTitle,
        eventType: input.eventType,
        reason: input.reason,
      }),
    }
  );
}

export async function getAdminListings(query: AdminListingsQuery): Promise<AdminListingsResponse> {
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const search = (query.search ?? '').trim().toLowerCase();
  const status = normalizeAdminListingStatusFilter(query.status);
  const categoryId = normalizeId(query.categoryId ?? null);
  const stateId = normalizeId(query.stateId ?? null);

  const [
    { data: profiles, error: profileError },
    { data: listings, error: listingError },
    { data: reports, error: reportError },
    { data: conversations, error: conversationError },
    { data: offers, error: offerError },
    { data: categories, error: categoryError },
    { data: states, error: stateError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select(`
        id, username, full_name, avatar_path, role, created_at, updated_at, state_id, area_id,
        states!profiles_state_id_fkey ( id, name ),
        areas!profiles_area_id_fkey ( id, name )
      `),
    supabaseAdmin
      .from('listings')
      .select(`
        id,
        seller_id,
        title,
        price,
        currency,
        status,
        cover_image_path,
        created_at,
        updated_at,
        views_count,
        brand,
        states!listings_state_id_fkey ( id, name ),
        areas!listings_area_id_fkey ( id, name ),
        categories!listings_category_id_fkey ( id, name )
      `)
      .is('deleted_at', null)
      .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('reports').select('listing_id, status'),
    supabaseAdmin.from('conversations').select('listing_id'),
    supabaseAdmin.from('offers').select('listing_id'),
    supabaseAdmin.from('categories').select('id, name').order('name'),
    supabaseAdmin.from('states').select('id, name').order('name'),
  ]);

  if (profileError) {
    console.error('[Admin] Failed to load seller profiles:', profileError);
    throw new AdminServiceError('Unable to load seller profiles', 500);
  }

  if (listingError) {
    console.error('[Admin] Failed to load listings for admin management:', listingError);
    throw new AdminServiceError('Unable to load marketplace listings', 500);
  }

  if (reportError) {
    console.error('[Admin] Failed to load listing reports:', reportError);
    throw new AdminServiceError('Unable to load listing reports', 500);
  }

  if (conversationError) {
    console.error('[Admin] Failed to load listing conversations:', conversationError);
    throw new AdminServiceError('Unable to load listing conversations', 500);
  }

  if (offerError) {
    console.error('[Admin] Failed to load listing offers:', offerError);
    throw new AdminServiceError('Unable to load listing offers', 500);
  }

  if (categoryError) {
    console.error('[Admin] Failed to load category filters:', categoryError);
    throw new AdminServiceError('Unable to load listing categories', 500);
  }

  if (stateError) {
    console.error('[Admin] Failed to load state filters:', stateError);
    throw new AdminServiceError('Unable to load listing locations', 500);
  }

  const sellerProfileMap = new Map(((profiles ?? []) as RawProfile[]).map((profile) => [profile.id, profile]));
  const categoryLookup = ((categories ?? []) as Array<{ id: number | string; name: string }>).map(
    (category) => ({
      id: normalizeId(category.id) ?? 0,
      name: category.name,
    })
  );
  const stateLookup = ((states ?? []) as Array<{ id: number | string; name: string }>).map((state) => ({
    id: normalizeId(state.id) ?? 0,
    name: state.name,
  }));
  const selectedCategoryName =
    categoryId === null
      ? null
      : categoryLookup.find((category) => category.id === categoryId)?.name ?? null;
  const selectedStateName =
    stateId === null ? null : stateLookup.find((state) => state.id === stateId)?.name ?? null;
  const offerCountMap = new Map<string, number>();
  const conversationCountMap = new Map<string, number>();
  const reportCountMap = new Map<string, number>();
  const pendingReportCountMap = new Map<string, number>();

  ((offers ?? []) as Array<{ listing_id: string }>).forEach((offer) => {
    incrementStringMapCount(offerCountMap, offer.listing_id);
  });

  ((conversations ?? []) as Array<{ listing_id: string }>).forEach((conversation) => {
    incrementStringMapCount(conversationCountMap, conversation.listing_id);
  });

  ((reports ?? []) as Array<{ listing_id: string; status: string }>).forEach((report) => {
    incrementStringMapCount(reportCountMap, report.listing_id);

    if (report.status === 'pending') {
      incrementStringMapCount(pendingReportCountMap, report.listing_id);
    }
  });

  const allListings = ((listings ?? []) as RawAdminListing[])
    .map((listing) => {
      const sellerProfile = sellerProfileMap.get(listing.seller_id);

      if (!sellerProfile || sellerProfile.role === 'admin' || listing.brand === MODERATION_LISTING_BRAND) {
        return null;
      }

      return buildAdminListingListItem(listing, sellerProfile, {
        offerCount: offerCountMap.get(listing.id) ?? 0,
        conversationCount: conversationCountMap.get(listing.id) ?? 0,
        reportCount: reportCountMap.get(listing.id) ?? 0,
        pendingReportCount: pendingReportCountMap.get(listing.id) ?? 0,
      });
    })
    .filter((listing): listing is AdminListingListItem => listing !== null);

  const filteredListings = allListings.filter((listing) => {
    const matchesSearch =
      !search ||
      listing.title.toLowerCase().includes(search) ||
      listing.id.toLowerCase().includes(search) ||
      listing.seller.fullName.toLowerCase().includes(search) ||
      listing.seller.username.toLowerCase().includes(search) ||
      listing.categoryName?.toLowerCase().includes(search) ||
      listing.locationLabel.toLowerCase().includes(search) ||
      listing.seller.locationLabel.toLowerCase().includes(search);

    const matchesStatus =
      status === 'all'
        ? true
        : status === 'reported'
          ? listing.pendingReportCount > 0
          : listing.status === status;

    const matchesCategory =
      categoryId === null ? true : Boolean(selectedCategoryName && listing.categoryName === selectedCategoryName);

    const matchesState =
      stateId === null
        ? true
        : Boolean(
            selectedStateName &&
              listing.locationLabel.toLowerCase().includes(selectedStateName.toLowerCase())
          );

    return matchesSearch && matchesStatus && matchesCategory && matchesState;
  });

  const totalItems = filteredListings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedListings = filteredListings.slice(startIndex, startIndex + pageSize);

  return {
    stats: {
      totalListings: allListings.length,
      activeListings: allListings.filter((listing) => listing.status === 'active').length,
      soldListings: allListings.filter((listing) => listing.status === 'sold').length,
      flaggedListings: allListings.filter((listing) => listing.isFlagged).length,
      pendingReports: (reports ?? []).filter((report) => report.status === 'pending').length,
    },
    filters: {
      search: query.search?.trim() ?? '',
      status,
      categoryId,
      stateId,
    },
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    lookups: {
      categories: categoryLookup.filter((category) => category.id > 0),
      states: stateLookup.filter((state) => state.id > 0),
    },
    listings: paginatedListings,
  };
}

export async function getAdminListingDetails(
  listingId: string
): Promise<AdminListingDetailResponse> {
  const trimmedListingId = listingId.trim();

  if (!trimmedListingId) {
    throw new AdminServiceError('Listing was not found', 404);
  }

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
      sold_to_user_id,
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
    .eq('id', trimmedListingId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[Admin] Failed to load listing details:', error);
    throw new AdminServiceError('Unable to load listing details', 500);
  }

  if (!data) {
    throw new AdminServiceError('Listing was not found', 404);
  }

  const listing = data as RawAdminListingDetail;

  if (listing.brand === MODERATION_LISTING_BRAND) {
    throw new AdminServiceError('Moderation thread listings cannot be reviewed here', 403);
  }

  const sellerProfile = await getProfileById(listing.seller_id);

  if (sellerProfile.role === 'admin') {
    throw new AdminServiceError('Admin-owned listings cannot be reviewed here', 403);
  }

  const [
    imageMap,
    moderationSnapshot,
    seller,
    favoriteCountResult,
    offersResult,
    conversationCountResult,
    reportsResult,
  ] = await Promise.all([
    getListingImages([listing.id]),
    getLatestAdminModerationSnapshot(listing.seller_id, listing.id),
    buildAdminSellerDetail(sellerProfile),
    supabaseAdmin
      .from('favorites')
      .select('listing_id', { count: 'exact', head: true })
      .eq('listing_id', listing.id),
    supabaseAdmin.from('offers').select('id, status').eq('listing_id', listing.id),
    supabaseAdmin.from('conversations').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id),
    supabaseAdmin
      .from('reports')
      .select('id, reporter_id, reason, details, status, created_at, updated_at')
      .eq('listing_id', listing.id)
      .order('created_at', { ascending: false }),
  ]);

  if (favoriteCountResult.error) {
    console.error('[Admin] Failed to load listing favorites:', favoriteCountResult.error);
    throw new AdminServiceError('Unable to load listing engagement details', 500);
  }

  if (offersResult.error) {
    console.error('[Admin] Failed to load listing offers:', offersResult.error);
    throw new AdminServiceError('Unable to load listing engagement details', 500);
  }

  if (conversationCountResult.error) {
    console.error('[Admin] Failed to load listing conversations:', conversationCountResult.error);
    throw new AdminServiceError('Unable to load listing engagement details', 500);
  }

  if (reportsResult.error) {
    console.error('[Admin] Failed to load listing reports:', reportsResult.error);
    throw new AdminServiceError('Unable to load listing report history', 500);
  }

  const rawReports = (reportsResult.data ?? []) as RawAdminReport[];
  const reporterIds = Array.from(new Set(rawReports.map((report) => report.reporter_id).filter(Boolean)));

  const reporterProfilesResult =
    reporterIds.length === 0
      ? { data: [] as RawProfile[], error: null }
      : await supabaseAdmin
          .from('profiles')
          .select(`
            id, username, full_name, avatar_path, role, created_at, updated_at, state_id, area_id,
            states!profiles_state_id_fkey ( id, name ),
            areas!profiles_area_id_fkey ( id, name )
          `)
          .in('id', reporterIds);

  if (reporterProfilesResult.error) {
    console.error('[Admin] Failed to load reporter profiles:', reporterProfilesResult.error);
    throw new AdminServiceError('Unable to load report history', 500);
  }

  const reporterProfileMap = new Map(
    ((reporterProfilesResult.data ?? []) as RawProfile[]).map((profile) => [profile.id, profile])
  );
  const imageStoragePaths = imageMap.get(listing.id) ?? [];
  const imagePaths = getPublicStorageUrls(LISTING_IMAGE_BUCKET, imageStoragePaths);
  const coverImagePath =
    getPublicStorageUrl(LISTING_IMAGE_BUCKET, listing.cover_image_path) || imagePaths[0] || null;
  const listingCategory = unwrapRelation(listing.categories);
  const listingLocation = buildLocationSummary(listing.states, listing.areas);
  const soldToProfile = unwrapRelation(listing.sold_to_profile);
  const offerRows = (offersResult.data ?? []) as Array<{ id: string; status: string }>;

  return {
    listing: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      brand: listing.brand,
      price: toNumber(listing.price),
      currency: listing.currency,
      negotiable: listing.negotiable,
      status: listing.status,
      statusLabel: humanizeAdminListingStatus(listing.status),
      condition: listing.condition,
      conditionLabel: CONDITION_LABELS[listing.condition],
      coverImagePath,
      imagePaths,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
      publishedAt: listing.published_at,
      viewsCount: toNumber(listing.views_count),
      location: listingLocation,
      locationLabel: buildLocationLabel(listingLocation.stateName, listingLocation.areaName),
      category: listingCategory
        ? {
            id: normalizeId(listingCategory.id) ?? 0,
            name: listingCategory.name,
            slug: listingCategory.slug,
          }
        : null,
      soldTo: listing.sold_to_user_id
        ? {
            id: listing.sold_to_user_id,
            displayName: soldToProfile ? buildProfileDisplayName(soldToProfile) : 'Buyer',
            avatarPath: getPublicStorageUrl(AVATAR_BUCKET, soldToProfile?.avatar_path ?? null),
          }
        : null,
      hiddenFromBrowse: isListingHiddenFromBrowse(listing.status),
      moderationReason: moderationSnapshot?.reason ?? null,
      moderationReasonUpdatedAt: moderationSnapshot?.createdAt ?? null,
      moderationEventType: moderationSnapshot?.eventType ?? null,
    },
    seller,
    metrics: {
      favoritesCount: favoriteCountResult.count ?? 0,
      offerCount: offerRows.length,
      pendingOfferCount: offerRows.filter((offer) => offer.status === 'pending').length,
      conversationCount: conversationCountResult.count ?? 0,
      reportCount: rawReports.length,
      openReportCount: rawReports.filter(
        (report) => report.status === 'pending' || report.status === 'reviewed'
      ).length,
      pendingReportCount: rawReports.filter((report) => report.status === 'pending').length,
    },
    recentReports: rawReports.slice(0, 6).map((report) => {
      const reporterProfile = reporterProfileMap.get(report.reporter_id);
      const reporterLocation = reporterProfile
        ? buildLocationSummary(reporterProfile.states, reporterProfile.areas)
        : {
            stateId: null,
            stateName: null,
            areaId: null,
            areaName: null,
          };

      return {
        id: report.id,
        reason: report.reason,
        reasonLabel: parseDeliveryDisputeDetails(report.details)
          ? 'Item Not Received'
          : REPORT_REASON_LABELS[report.reason] ?? humanizeValue(report.reason),
        details: report.details,
        status: report.status,
        statusLabel: REPORT_STATUS_LABELS[report.status] ?? humanizeValue(report.status),
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        reporter: {
          id: report.reporter_id,
          fullName: reporterProfile ? buildProfileDisplayName(reporterProfile) : 'Marketplace User',
          username: reporterProfile?.username ?? 'user',
          avatarPath: getPublicStorageUrl(AVATAR_BUCKET, reporterProfile?.avatar_path ?? null),
          locationLabel: buildLocationLabel(
            reporterLocation.stateName,
            reporterLocation.areaName
          ),
        },
      };
    }),
  };
}

export async function updateAdminListingStatus(
  input: UpdateAdminListingStatusInput
): Promise<AdminListingStatusUpdateResponse> {
  const reason =
    input.action === 'pause'
      ? normalizeRequiredReason(input.reason, 'Pause')
      : input.action === 'reject'
        ? normalizeRequiredReason(input.reason, 'Reject')
        : undefined;
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, title, status, brand, published_at')
    .eq('id', input.listingId)
    .is('deleted_at', null)
    .maybeSingle();

  if (listingError) {
    console.error('[Admin] Failed to inspect listing before status update:', listingError);
    throw new AdminServiceError('Unable to inspect the selected listing', 500);
  }

  if (!listing) {
    throw new AdminServiceError('Listing was not found', 404);
  }

  if (listing.brand === MODERATION_LISTING_BRAND) {
    throw new AdminServiceError('Moderation thread listings cannot be moderated here', 403);
  }

  const sellerProfile = await getProfileById(listing.seller_id);

  if (sellerProfile.role === 'admin') {
    throw new AdminServiceError(
      'Admin-owned listings cannot be moderated from this screen',
      403
    );
  }

  if (input.action === 'pause' && !['active', 'reserved'].includes(listing.status)) {
    throw new AdminServiceError('Only active or reserved listings can be paused', 422);
  }

  if (input.action === 'resume' && listing.status !== 'archived') {
    throw new AdminServiceError('Only paused listings can be resumed', 422);
  }

  if (input.action === 'approve' && listing.status !== 'rejected') {
    throw new AdminServiceError('Only pending-review listings can be approved', 422);
  }

  if (input.action === 'reject' && listing.status !== 'rejected') {
    throw new AdminServiceError('Only pending-review listings can be rejected', 422);
  }

  const nextStatus =
    input.action === 'pause' || input.action === 'reject' ? 'archived' : 'active';
  const timestamp = new Date().toISOString();
  const { data: updatedListing, error: updateError } = await supabaseAdmin
    .from('listings')
    .update({
      status: nextStatus,
      updated_at: timestamp,
      published_at: nextStatus === 'active' ? listing.published_at ?? timestamp : listing.published_at,
    })
    .eq('id', input.listingId)
    .is('deleted_at', null)
    .select('id, title, status')
    .single();

  if (updateError || !updatedListing) {
    console.error('[Admin] Failed to update listing status from admin management:', updateError);
    throw new AdminServiceError('Unable to update the listing status', 500);
  }

  const moderationEventType =
    input.action === 'pause'
      ? 'paused'
      : input.action === 'reject'
        ? 'rejected'
        : 'approved';

  try {
    await sendListingModerationEventToSeller({
      adminUserId: input.adminUserId,
      sellerId: listing.seller_id,
      listingId: updatedListing.id,
      listingTitle: updatedListing.title,
      eventType: moderationEventType,
      reason,
    });
  } catch (error) {
    console.error('[Admin] Failed to send listing moderation notice:', error);
  }

  return {
    id: updatedListing.id,
    title: updatedListing.title,
    status: updatedListing.status,
    statusLabel: humanizeAdminListingStatus(updatedListing.status),
    hiddenFromBrowse: updatedListing.status !== 'active',
  };
}

export async function deleteAdminListing(input: {
  adminUserId: string;
  listingId: string;
  reason: string;
}): Promise<AdminDeleteListingResponse> {
  const reason = normalizeRequiredReason(input.reason, 'Delete');
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, title, brand, status')
    .eq('id', input.listingId)
    .is('deleted_at', null)
    .maybeSingle();

  if (listingError) {
    console.error('[Admin] Failed to inspect listing before deletion:', listingError);
    throw new AdminServiceError('Unable to inspect the selected listing', 500);
  }

  if (!listing) {
    throw new AdminServiceError('Listing was not found', 404);
  }

  if (listing.brand === MODERATION_LISTING_BRAND) {
    throw new AdminServiceError(
      'Moderation thread listings cannot be deleted from listing management',
      403
    );
  }

  const sellerProfile = await getProfileById(listing.seller_id);

  if (sellerProfile.role === 'admin') {
    throw new AdminServiceError(
      'Admin-owned listings cannot be deleted from listing management',
      403
    );
  }

  const { data: conversations, error: conversationsError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('listing_id', input.listingId);

  if (conversationsError) {
    console.error(
      '[Admin] Failed to inspect related conversations before listing deletion:',
      conversationsError
    );
    throw new AdminServiceError('Unable to inspect related conversation records', 500);
  }

  const conversationIds = ((conversations ?? []) as Array<{ id: string }>).map(
    (conversation) => conversation.id
  );
  const [
    offersResult,
    reportsResult,
    reviewsResult,
    favoritesResult,
    imagesResult,
    dailyViewsResult,
    messageCountResult,
  ] = await Promise.all([
    supabaseAdmin.from('offers').select('id', { count: 'exact', head: true }).eq('listing_id', input.listingId),
    supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }).eq('listing_id', input.listingId),
    supabaseAdmin.from('reviews').select('id', { count: 'exact', head: true }).eq('listing_id', input.listingId),
    supabaseAdmin
      .from('favorites')
      .select('listing_id', { count: 'exact', head: true })
      .eq('listing_id', input.listingId),
    supabaseAdmin
      .from('listing_images')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', input.listingId),
    supabaseAdmin
      .from('listing_daily_views')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', input.listingId),
    conversationIds.length === 0
      ? Promise.resolve({ count: 0, error: null })
      : supabaseAdmin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', conversationIds),
  ]);

  const guardedResults = [
    ['offers', offersResult.error],
    ['reports', reportsResult.error],
    ['reviews', reviewsResult.error],
    ['favorites', favoritesResult.error],
    ['listing images', imagesResult.error],
    ['daily views', dailyViewsResult.error],
    ['messages', messageCountResult.error],
  ];

  for (const [scope, error] of guardedResults) {
    if (error) {
      console.error(`[Admin] Failed to count ${scope} before listing deletion:`, error);
      throw new AdminServiceError('Unable to inspect related listing records before deletion', 500);
    }
  }

  const timestamp = new Date().toISOString();
  const { data: pendingOffers, error: pendingOffersError } = await supabaseAdmin
    .from('offers')
    .select('id')
    .eq('listing_id', input.listingId)
    .eq('status', 'pending');

  if (pendingOffersError) {
    console.error('[Admin] Failed to inspect pending offers before listing deletion:', pendingOffersError);
    throw new AdminServiceError('Unable to inspect pending offers before deleting the listing', 500);
  }

  const pendingOfferIds = ((pendingOffers ?? []) as Array<{ id: string }>).map((offer) => offer.id);

  if (pendingOfferIds.length > 0) {
    const { error: withdrawOffersError } = await supabaseAdmin
      .from('offers')
      .update({ status: 'withdrawn', updated_at: timestamp })
      .eq('listing_id', input.listingId)
      .eq('status', 'pending');

    if (withdrawOffersError) {
      console.error(
        '[Admin] Failed to withdraw pending offers during soft delete:',
        withdrawOffersError
      );
      throw new AdminServiceError('Unable to close pending offers before removing the listing', 500);
    }
  }

  const nextStatus = listing.status === 'sold' ? 'sold' : 'archived';
  const { error: softDeleteError } = await supabaseAdmin
    .from('listings')
    .update({
      status: nextStatus,
      deleted_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', input.listingId)
    .is('deleted_at', null);

  if (softDeleteError) {
    console.error('[Admin] Failed to soft-delete listing from admin management:', softDeleteError);

    if (pendingOfferIds.length > 0) {
      const { error: rollbackError } = await supabaseAdmin
        .from('offers')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .in('id', pendingOfferIds);

      if (rollbackError) {
        console.error(
          '[Admin] Failed to roll back withdrawn offers after soft-delete error:',
          rollbackError
        );
      }
    }

    throw new AdminServiceError('Unable to remove the listing from the marketplace', 500);
  }

  try {
    await sendListingModerationEventToSeller({
      adminUserId: input.adminUserId,
      sellerId: listing.seller_id,
      listingId: listing.id,
      listingTitle: listing.title,
      eventType: 'deleted',
      reason,
    });
  } catch (error) {
    console.error('[Admin] Failed to send listing deletion notice:', error);
  }

  return {
    id: input.listingId,
    deleted: true,
    deletedRecords: {
      messages: messageCountResult.count ?? 0,
      conversations: conversationIds.length,
      offers: offersResult.count ?? 0,
      reports: reportsResult.count ?? 0,
      reviews: reviewsResult.count ?? 0,
      favorites: favoritesResult.count ?? 0,
      images: imagesResult.count ?? 0,
      dailyViews: dailyViewsResult.count ?? 0,
    },
  };
}
