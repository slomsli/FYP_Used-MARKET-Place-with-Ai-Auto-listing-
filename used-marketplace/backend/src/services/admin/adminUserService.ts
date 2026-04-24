import { supabaseAdmin } from '../../config/supabase';
import { ensureProfileForUserId } from '../auth/profileSync';
import { buildUpdatedAppMetadata } from '../../utils/accountStatus';
import {
  MODERATION_LISTING_BRAND,
  buildModerationListingTargetKey,
  buildModerationListingTitle,
} from '../../utils/moderationThread';
import { getPublicStorageUrl } from '../../utils/storage';
import {
  type AdminModerationThreadResponse,
  type AdminUserDetailListing,
  type AdminUserDetailResponse,
  type AdminUserListItem,
  type AdminUsersQuery,
  type AdminUsersResponse,
  type AuthAdminUser,
  type CreateAdminUserInput,
  type RawAdminUserListing,
  type RawProfile,
  type Relation,
  type UpdateAdminUserStatusInput,
  AVATAR_BUCKET,
  LISTING_IMAGE_BUCKET,
  AdminServiceError,
  buildLocationLabel,
  buildProfileDisplayName,
  deriveUserStatus,
  getAuthUserById,
  getListingCountForUser,
  getListingCountMap,
  getProfileById,
  humanizeAdminListingStatus,
  listAllAuthUsers,
  normalizeId,
  normalizePage,
  normalizePageSize,
  normalizeRoleFilter,
  normalizeStatusFilter,
  sanitizeUsername,
  unwrapRelation,
} from './shared';

function buildAdminUserListItem(
  profile: RawProfile,
  authUser: AuthAdminUser | undefined,
  listingCountMap: Map<string, number>
): AdminUserListItem {
  const state = unwrapRelation(profile.states);
  const area = unwrapRelation(profile.areas);

  return {
    id: profile.id,
    fullName: profile.full_name?.trim() || profile.username || 'User',
    username: profile.username,
    email: authUser?.email ?? null,
    avatarPath: getPublicStorageUrl(AVATAR_BUCKET, profile.avatar_path),
    role: profile.role === 'admin' ? 'admin' : 'user',
    joinDate: profile.created_at,
    status: deriveUserStatus(authUser),
    locationLabel: buildLocationLabel(state?.name ?? null, area?.name ?? null),
    listingCount: listingCountMap.get(profile.id) ?? 0,
  };
}

async function validateLocationSelection(
  stateId?: number | null,
  areaId?: number | null
): Promise<{
  stateId: number | null;
  areaId: number | null;
  stateName: string | null;
  areaName: string | null;
}> {
  let resolvedStateId = stateId ?? null;
  let resolvedAreaId = areaId ?? null;
  let stateName: string | null = null;
  let areaName: string | null = null;

  if (resolvedAreaId !== null) {
    const { data: area, error: areaError } = await supabaseAdmin
      .from('areas')
      .select('id, name, state_id, states!areas_state_id_fkey ( id, name )')
      .eq('id', resolvedAreaId)
      .maybeSingle();

    if (areaError) {
      console.error('[Admin] Failed to validate area:', areaError);
      throw new AdminServiceError('Unable to validate selected area', 500);
    }

    if (!area) {
      throw new AdminServiceError('Selected area was not found', 422);
    }

    const relatedState = unwrapRelation(area.states as Relation<{ id: number; name: string }>);
    const areaStateId = normalizeId(area.state_id);

    if (resolvedStateId !== null && areaStateId !== resolvedStateId) {
      throw new AdminServiceError('Selected area does not belong to the selected state', 422);
    }

    resolvedStateId = areaStateId;
    areaName = area.name;
    stateName = relatedState?.name ?? null;
  }

  if (resolvedStateId !== null && !stateName) {
    const { data: state, error: stateError } = await supabaseAdmin
      .from('states')
      .select('id, name')
      .eq('id', resolvedStateId)
      .maybeSingle();

    if (stateError) {
      console.error('[Admin] Failed to validate state:', stateError);
      throw new AdminServiceError('Unable to validate selected state', 500);
    }

    if (!state) {
      throw new AdminServiceError('Selected state was not found', 422);
    }

    stateName = state.name;
  }

  return {
    stateId: resolvedStateId,
    areaId: resolvedAreaId,
    stateName,
    areaName,
  };
}

async function getFallbackCategoryId(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Admin] Failed to load fallback category:', error);
    throw new AdminServiceError('Unable to prepare the moderation thread', 500);
  }

  const categoryId = normalizeId(data?.id ?? null);

  if (categoryId === null) {
    throw new AdminServiceError('Create at least one category before messaging users from admin', 422);
  }

  return categoryId;
}

export async function getAdminUsers(query: AdminUsersQuery): Promise<AdminUsersResponse> {
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const search = (query.search ?? '').trim().toLowerCase();
  const role = normalizeRoleFilter(query.role);
  const status = normalizeStatusFilter(query.status);

  const [{ data: profiles, error: profileError }, authUsers, listingCountMap, pendingReports] =
    await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select(`
          id, username, full_name, avatar_path, role, created_at, updated_at, state_id, area_id,
          states!profiles_state_id_fkey ( id, name ),
          areas!profiles_area_id_fkey ( id, name )
        `)
        .order('created_at', { ascending: false }),
      listAllAuthUsers(),
      getListingCountMap(),
      supabaseAdmin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

  if (profileError) {
    console.error('[Admin] Failed to load profiles:', profileError);
    throw new AdminServiceError('Unable to load profiles', 500);
  }

  if (pendingReports.error) {
    console.error('[Admin] Failed to count pending reports:', pendingReports.error);
    throw new AdminServiceError('Unable to load moderation statistics', 500);
  }

  const authUserMap = new Map(authUsers.map((user) => [user.id, user]));
  const allUsers = ((profiles ?? []) as RawProfile[]).map((profile) =>
    buildAdminUserListItem(profile, authUserMap.get(profile.id), listingCountMap)
  );

  const filteredUsers = allUsers.filter((user) => {
    const matchesSearch =
      !search ||
      user.fullName.toLowerCase().includes(search) ||
      user.username.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search) ||
      user.id.toLowerCase().includes(search) ||
      user.locationLabel.toLowerCase().includes(search);

    const matchesRole = role === 'all' ? true : user.role === role;
    const matchesStatus = status === 'all' ? true : user.status === status;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalItems = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + pageSize);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const verifiedUsers = allUsers.filter((user) => user.status !== 'pending_verification').length;
  const verificationRate = allUsers.length
    ? Math.round((verifiedUsers / allUsers.length) * 100)
    : 0;

  return {
    stats: {
      totalUsers: allUsers.length,
      newThisMonth: allUsers.filter((user) => new Date(user.joinDate) >= monthStart).length,
      verificationRate,
      activeUsers: allUsers.filter((user) => user.status === 'active').length,
      pendingFlags: pendingReports.count ?? 0,
    },
    filters: {
      search: query.search?.trim() ?? '',
      role,
      status,
    },
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    users: paginatedUsers,
  };
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUserListItem> {
  const fullName = input.fullName.trim();
  const username = sanitizeUsername(input.username);
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!fullName) {
    throw new AdminServiceError('Full name is required', 422);
  }

  if (!username || username.length < 3 || username.length > 20) {
    throw new AdminServiceError('Username must be between 3 and 20 characters', 422);
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    throw new AdminServiceError(
      'Username can only contain lowercase letters, numbers, and underscores',
      422
    );
  }

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new AdminServiceError('A valid email address is required', 422);
  }

  if (!password || password.length < 8) {
    throw new AdminServiceError('Password must be at least 8 characters', 422);
  }

  const { data: existingUsername, error: existingUsernameError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existingUsernameError) {
    console.error('[Admin] Failed to validate username availability:', existingUsernameError);
    throw new AdminServiceError('Unable to validate username', 500);
  }

  if (existingUsername) {
    throw new AdminServiceError('Username is already taken', 409);
  }

  const location = await validateLocationSelection(input.stateId, input.areaId);

  const { data: createdAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      username,
      role: 'user',
    },
  });

  if (createError || !createdAuthUser.user) {
    console.error('[Admin] Failed to create auth user:', createError);
    throw new AdminServiceError(createError?.message ?? 'Unable to create user', 400);
  }

  try {
    await ensureProfileForUserId(createdAuthUser.user.id, {
      fullName,
      username,
      role: 'user',
    });

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName,
        username,
        role: 'user',
        state_id: location.stateId,
        area_id: location.areaId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', createdAuthUser.user.id);

    if (updateError) {
      console.error('[Admin] Failed to update created profile:', updateError);
      throw new AdminServiceError('Unable to finish profile setup', 500);
    }

    return {
      id: createdAuthUser.user.id,
      fullName,
      username,
      email,
      avatarPath: null,
      role: 'user',
      joinDate: new Date().toISOString(),
      status: 'active',
      locationLabel: buildLocationLabel(location.stateName, location.areaName),
      listingCount: 0,
    };
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(createdAuthUser.user.id);
    throw error;
  }
}

export async function getAdminUserDetails(userId: string): Promise<AdminUserDetailResponse> {
  const [profile, authUser, listingStatsResult, recentListingsResult] = await Promise.all([
    getProfileById(userId),
    getAuthUserById(userId),
    supabaseAdmin
      .from('listings')
      .select('id, status, views_count')
      .eq('seller_id', userId)
      .is('deleted_at', null)
      .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`),
    supabaseAdmin
      .from('listings')
      .select(`
        id,
        title,
        price,
        currency,
        status,
        cover_image_path,
        created_at,
        views_count,
        states!listings_state_id_fkey ( id, name ),
        areas!listings_area_id_fkey ( id, name ),
        categories!listings_category_id_fkey ( id, name )
      `)
      .eq('seller_id', userId)
      .is('deleted_at', null)
      .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`)
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  if (listingStatsResult.error) {
    console.error('[Admin] Failed to load user listing stats:', listingStatsResult.error);
    throw new AdminServiceError('Unable to load user listing statistics', 500);
  }

  if (recentListingsResult.error) {
    console.error('[Admin] Failed to load user listing previews:', recentListingsResult.error);
    throw new AdminServiceError('Unable to load user listing previews', 500);
  }

  const listingCountMap = new Map<string, number>([[userId, (listingStatsResult.data ?? []).length]]);
  const userSummary = buildAdminUserListItem(profile, authUser, listingCountMap);
  const state = unwrapRelation(profile.states);
  const area = unwrapRelation(profile.areas);

  const listingStats = (listingStatsResult.data ?? []) as Array<{
    id: string;
    status: string;
    views_count: unknown;
  }>;

  const listings = ((recentListingsResult.data ?? []) as RawAdminUserListing[]).map((listing) => {
    const listingState = unwrapRelation(listing.states);
    const listingArea = unwrapRelation(listing.areas);
    const listingCategory = unwrapRelation(listing.categories);

    return {
      id: listing.id,
      title: listing.title,
      price: Number(listing.price ?? 0),
      currency: listing.currency,
      status: listing.status,
      statusLabel: humanizeAdminListingStatus(listing.status),
      coverImagePath: getPublicStorageUrl(LISTING_IMAGE_BUCKET, listing.cover_image_path),
      createdAt: listing.created_at,
      viewsCount: Number(listing.views_count ?? 0),
      locationLabel: buildLocationLabel(listingState?.name ?? null, listingArea?.name ?? null),
      categoryName: listingCategory?.name ?? null,
    } satisfies AdminUserDetailListing;
  });

  return {
    user: {
      ...userSummary,
      updatedAt: profile.updated_at,
      stateName: state?.name ?? null,
      areaName: area?.name ?? null,
      emailVerified: Boolean(authUser.email_confirmed_at),
      lastSignInAt: authUser.last_sign_in_at ?? null,
      bannedUntil: authUser.banned_until ?? null,
    },
    stats: {
      totalListings: userSummary.listingCount,
      activeListings: listingStats.filter((listing) => listing.status === 'active').length,
      soldListings: listingStats.filter((listing) => listing.status === 'sold').length,
      draftListings: listingStats.filter((listing) => listing.status === 'draft').length,
      totalViews: listingStats.reduce((sum, listing) => sum + Number(listing.views_count ?? 0), 0),
    },
    listings,
  };
}

export async function updateAdminUserStatus(
  input: UpdateAdminUserStatusInput
): Promise<AdminUserListItem> {
  const profile = await getProfileById(input.targetUserId);
  const authUser = await getAuthUserById(input.targetUserId);

  if (input.adminUserId === input.targetUserId) {
    throw new AdminServiceError(
      'You cannot change your own status from the user management screen',
      422
    );
  }

  if (profile.role === 'admin') {
    throw new AdminServiceError('Admin accounts are protected from suspension actions', 403);
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(input.targetUserId, {
    ban_duration: 'none',
    app_metadata: buildUpdatedAppMetadata(
      authUser.app_metadata,
      input.action === 'suspend' ? 'suspended' : 'active'
    ),
  });

  if (error || !data.user) {
    console.error('[Admin] Failed to update account status:', error);
    throw new AdminServiceError('Unable to update the account status', 500);
  }

  const listingCountMap = new Map<string, number>([
    [input.targetUserId, await getListingCountForUser(input.targetUserId)],
  ]);

  return buildAdminUserListItem(profile, data.user as AuthAdminUser, listingCountMap);
}

export async function ensureAdminModerationThread(
  adminUserId: string,
  targetUserId: string
): Promise<AdminModerationThreadResponse> {
  if (adminUserId === targetUserId) {
    throw new AdminServiceError('You cannot start a moderation thread with your own account', 422);
  }

  const targetProfile = await getProfileById(targetUserId);
  const targetDisplayName =
    targetProfile.full_name?.trim() || targetProfile.username || 'Marketplace User';
  const targetKey = buildModerationListingTargetKey(targetUserId);
  const title = buildModerationListingTitle(targetDisplayName);

  const { data: existingListing, error: existingListingError } = await supabaseAdmin
    .from('listings')
    .select('id, title')
    .eq('seller_id', adminUserId)
    .eq('status', 'draft')
    .eq('brand', MODERATION_LISTING_BRAND)
    .eq('description', targetKey)
    .maybeSingle();

  if (existingListingError) {
    console.error('[Admin] Failed to inspect moderation listings:', existingListingError);
    throw new AdminServiceError('Unable to prepare the moderation thread', 500);
  }

  if (existingListing) {
    if (existingListing.title !== title) {
      const { error: updateError } = await supabaseAdmin
        .from('listings')
        .update({
          title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingListing.id);

      if (updateError) {
        console.error('[Admin] Failed to refresh moderation listing title:', updateError);
      }
    }

    return {
      listingId: existingListing.id,
      listingTitle: title,
      recipientId: targetUserId,
      recipientName: targetDisplayName,
      topicType: 'moderation',
    };
  }

  const categoryId = await getFallbackCategoryId();
  const { data: createdListing, error: createListingError } = await supabaseAdmin
    .from('listings')
    .insert({
      seller_id: adminUserId,
      category_id: categoryId,
      title,
      description: targetKey,
      brand: MODERATION_LISTING_BRAND,
      condition: 'good',
      price: 0,
      currency: 'MYR',
      negotiable: false,
      status: 'draft',
      state_id: null,
      area_id: null,
    })
    .select('id, title')
    .single();

  if (createListingError || !createdListing) {
    console.error('[Admin] Failed to create moderation listing:', createListingError);
    throw new AdminServiceError('Unable to create the moderation thread', 500);
  }

  return {
    listingId: createdListing.id,
    listingTitle: createdListing.title,
    recipientId: targetUserId,
    recipientName: targetDisplayName,
    topicType: 'moderation',
  };
}
