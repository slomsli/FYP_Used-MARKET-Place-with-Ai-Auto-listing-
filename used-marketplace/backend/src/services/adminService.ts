import { supabaseAdmin } from '../config/supabase';
import { ensureProfileForUserId } from './auth/profileSync';
import {
  MODERATION_LISTING_BRAND,
  buildModerationListingTargetKey,
  buildModerationListingTitle,
} from '../utils/moderationThread';
import {
  buildUpdatedAppMetadata,
  isAccountSuspended,
} from '../utils/accountStatus';

type AdminRole = 'user' | 'admin';
type AdminUserStatus = 'active' | 'pending_verification' | 'suspended';
type AdminUserRoleFilter = 'all' | AdminRole;
type AdminUserStatusFilter = 'all' | AdminUserStatus;

type Relation<T> = T | T[] | null;

interface RawProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
  role: AdminRole;
  created_at: string;
  updated_at: string;
  state_id: number | null;
  area_id: number | null;
  states: Relation<{ id: number; name: string }>;
  areas: Relation<{ id: number; name: string }>;
}

interface RawListingOwner {
  seller_id: string | null;
  brand?: string | null;
}

interface RawAdminUserListing {
  id: string;
  title: string;
  price: unknown;
  currency: string;
  status: string;
  cover_image_path: string | null;
  created_at: string;
  views_count: unknown;
  states: Relation<{ id: number; name: string }>;
  areas: Relation<{ id: number; name: string }>;
  categories: Relation<{ id: number; name: string }>;
}

interface RawCategory {
  id: number | string;
  name: string;
  slug: string;
  parent_id: number | string | null;
  created_at: string;
}

interface RawArea {
  id: number | string;
  state_id: number | string;
  name: string;
  slug: string;
  created_at: string;
}

interface RawState {
  id: number | string;
  name: string;
  slug: string;
}

interface RawCategoryListing {
  category_id: number | string | null;
  state_id: number | string | null;
  area_id: number | string | null;
}

interface AuthAdminUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: {
    account_status?: unknown;
    [key: string]: unknown;
  } | null;
}

export interface AdminUsersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface CreateAdminUserInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
  stateId?: number | null;
  areaId?: number | null;
}

export interface AdminStructureQuery {
  search?: string;
}

export interface CreateCategoryInput {
  name: string;
  parentId?: number | null;
}

export interface CreateLocationInput {
  stateName: string;
  areaNames?: string[];
}

export interface AdminUserListItem {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  avatarPath: string | null;
  role: AdminRole;
  joinDate: string;
  status: AdminUserStatus;
  locationLabel: string;
  listingCount: number;
}

export interface AdminUsersResponse {
  stats: {
    totalUsers: number;
    newThisMonth: number;
    verificationRate: number;
    activeUsers: number;
    pendingFlags: number;
  };
  filters: {
    search: string;
    role: AdminUserRoleFilter;
    status: AdminUserStatusFilter;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  users: AdminUserListItem[];
}

export interface AdminUserDetailListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  status: string;
  statusLabel: string;
  coverImagePath: string | null;
  createdAt: string;
  viewsCount: number;
  locationLabel: string;
  categoryName: string | null;
}

export interface AdminUserDetailResponse {
  user: AdminUserListItem & {
    updatedAt: string;
    stateName: string | null;
    areaName: string | null;
    emailVerified: boolean;
    lastSignInAt: string | null;
    bannedUntil: string | null;
  };
  stats: {
    totalListings: number;
    activeListings: number;
    soldListings: number;
    draftListings: number;
    totalViews: number;
  };
  listings: AdminUserDetailListing[];
}

export interface UpdateAdminUserStatusInput {
  adminUserId: string;
  targetUserId: string;
  action: 'suspend' | 'activate';
}

export interface AdminModerationThreadResponse {
  listingId: string;
  listingTitle: string;
  recipientId: string;
  recipientName: string;
  topicType: 'moderation';
}

export interface AdminStructureCategoryNode {
  id: number;
  name: string;
  slug: string;
  totalItems: number;
  createdAt: string;
  children: Array<{
    id: number;
    name: string;
    slug: string;
    itemCount: number;
  }>;
}

export interface AdminStructureLocationItem {
  id: number;
  name: string;
  slug: string;
  areaCount: number;
  listingCount: number;
  status: 'operational' | 'maintenance';
  previewAreas: string[];
}

export interface AdminStructureResponse {
  overview: {
    totalCategories: number;
    totalSubcategories: number;
    mostActiveCategory: {
      name: string;
      itemCount: number;
    } | null;
    structureHealth: {
      status: 'optimized' | 'attention';
      detail: string;
    };
    globalReach: {
      activeRegions: number;
      totalRegions: number;
      totalListings: number;
    };
  };
  forms: {
    parentCategories: Array<{
      id: number;
      name: string;
    }>;
  };
  categories: AdminStructureCategoryNode[];
  locations: AdminStructureLocationItem[];
  auditLog: Array<{
    id: string;
    title: string;
    detail: string;
    timestamp: string;
  }>;
}

export class AdminServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminServiceError';
    this.status = status;
  }
}

function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function normalizePage(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) {
    return 1;
  }

  return value;
}

function normalizePageSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) {
    return 8;
  }

  return Math.min(value, 50);
}

function normalizeRoleFilter(value: string | undefined): AdminUserRoleFilter {
  if (value === 'admin') {
    return 'admin';
  }

  if (value === 'user') {
    return 'user';
  }

  return 'all';
}

function normalizeStatusFilter(value: string | undefined): AdminUserStatusFilter {
  if (value === 'active' || value === 'pending_verification' || value === 'suspended') {
    return value;
  }

  return 'all';
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'item';
}

function sanitizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildLocationLabel(stateName: string | null, areaName: string | null): string {
  if (stateName && areaName) {
    return `${areaName}, ${stateName}`;
  }

  if (stateName) {
    return stateName;
  }

  if (areaName) {
    return areaName;
  }

  return 'No location set';
}

function humanizeValue(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function deriveUserStatus(user: AuthAdminUser | undefined): AdminUserStatus {
  if (isAccountSuspended(user)) {
    return 'suspended';
  }

  if (!user?.email_confirmed_at) {
    return 'pending_verification';
  }

  return 'active';
}

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
    avatarPath: profile.avatar_path,
    role: profile.role === 'admin' ? 'admin' : 'user',
    joinDate: profile.created_at,
    status: deriveUserStatus(authUser),
    locationLabel: buildLocationLabel(state?.name ?? null, area?.name ?? null),
    listingCount: listingCountMap.get(profile.id) ?? 0,
  };
}

async function listAllAuthUsers(): Promise<AuthAdminUser[]> {
  const users: AuthAdminUser[] = [];
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error('[Admin] Failed to load auth users:', error);
      throw new AdminServiceError('Unable to load auth users', 500);
    }

    const batch = (data?.users ?? []) as AuthAdminUser[];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }
  }

  return users;
}

async function getListingCountMap(): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin.from('listings').select('seller_id, brand');

  if (error) {
    console.error('[Admin] Failed to load listing counts:', error);
    throw new AdminServiceError('Unable to load listing data', 500);
  }

  const listingCountMap = new Map<string, number>();

  ((data ?? []) as RawListingOwner[]).forEach((record) => {
    if (!record.seller_id || record.brand === MODERATION_LISTING_BRAND) {
      return;
    }

    listingCountMap.set(record.seller_id, (listingCountMap.get(record.seller_id) ?? 0) + 1);
  });

  return listingCountMap;
}

async function getListingCountForUser(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', userId)
    .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`);

  if (error) {
    console.error('[Admin] Failed to count user listings:', error);
    throw new AdminServiceError('Unable to load listing totals', 500);
  }

  return count ?? 0;
}

async function getProfileById(userId: string): Promise<RawProfile> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id, username, full_name, avatar_path, role, created_at, updated_at, state_id, area_id,
      states!profiles_state_id_fkey ( id, name ),
      areas!profiles_area_id_fkey ( id, name )
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Admin] Failed to load user profile:', error);
    throw new AdminServiceError('Unable to load the selected user', 500);
  }

  if (!data) {
    throw new AdminServiceError('User was not found', 404);
  }

  return data as RawProfile;
}

async function getAuthUserById(userId: string): Promise<AuthAdminUser> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error) {
    console.error('[Admin] Failed to load auth user:', error);
    throw new AdminServiceError('Unable to load the selected account', 500);
  }

  if (!data.user) {
    throw new AdminServiceError('User account was not found', 404);
  }

  return data.user as AuthAdminUser;
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

async function resolveUniqueSlug(
  table: 'categories' | 'states',
  baseValue: string
): Promise<string> {
  const baseSlug = slugify(baseValue);

  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (error) {
      console.error(`[Admin] Failed to check ${table} slug availability:`, error);
      throw new AdminServiceError(`Unable to validate ${table} slug`, 500);
    }

    if (!data) {
      return candidate;
    }
  }

  throw new AdminServiceError(`Unable to generate a unique ${table} slug`, 500);
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
    throw new AdminServiceError('Username can only contain lowercase letters, numbers, and underscores', 422);
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
      statusLabel: humanizeValue(listing.status),
      coverImagePath: listing.cover_image_path,
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
    throw new AdminServiceError('You cannot change your own status from the user management screen', 422);
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
  const targetDisplayName = targetProfile.full_name?.trim() || targetProfile.username || 'Marketplace User';
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

function filterCategoryTree(
  categories: AdminStructureCategoryNode[],
  search: string
): AdminStructureCategoryNode[] {
  if (!search) {
    return categories;
  }

  return categories
    .map((category) => {
      const parentMatches = category.name.toLowerCase().includes(search);
      const matchingChildren = category.children.filter((child) =>
        child.name.toLowerCase().includes(search)
      );

      if (!parentMatches && matchingChildren.length === 0) {
        return null;
      }

      return {
        ...category,
        children: parentMatches ? category.children : matchingChildren,
      };
    })
    .filter((category): category is AdminStructureCategoryNode => category !== null);
}

function filterLocations(
  locations: AdminStructureLocationItem[],
  search: string
): AdminStructureLocationItem[] {
  if (!search) {
    return locations;
  }

  return locations.filter((location) => {
    if (location.name.toLowerCase().includes(search)) {
      return true;
    }

    return location.previewAreas.some((area) => area.toLowerCase().includes(search));
  });
}

export async function getAdminStructure(
  query: AdminStructureQuery
): Promise<AdminStructureResponse> {
  const search = (query.search ?? '').trim().toLowerCase();
  const [
    { data: categories, error: categoryError },
    { data: states, error: stateError },
    { data: areas, error: areaError },
    { data: listings, error: listingError },
  ] = await Promise.all([
    supabaseAdmin.from('categories').select('id, name, slug, parent_id, created_at').order('name'),
    supabaseAdmin.from('states').select('id, name, slug').order('name'),
    supabaseAdmin.from('areas').select('id, state_id, name, slug, created_at').order('name'),
    supabaseAdmin.from('listings').select('category_id, state_id, area_id'),
  ]);

  if (categoryError) {
    console.error('[Admin] Failed to load categories:', categoryError);
    throw new AdminServiceError('Unable to load categories', 500);
  }

  if (stateError) {
    console.error('[Admin] Failed to load states:', stateError);
    throw new AdminServiceError('Unable to load states', 500);
  }

  if (areaError) {
    console.error('[Admin] Failed to load areas:', areaError);
    throw new AdminServiceError('Unable to load areas', 500);
  }

  if (listingError) {
    console.error('[Admin] Failed to load listings for admin structure:', listingError);
    throw new AdminServiceError('Unable to load structure statistics', 500);
  }

  const listingCategoryCounts = new Map<number, number>();
  const listingStateCounts = new Map<number, number>();
  const listingsWithoutLocation = ((listings ?? []) as RawCategoryListing[]).filter(
    (listing) => normalizeId(listing.state_id) === null || normalizeId(listing.area_id) === null
  ).length;

  ((listings ?? []) as RawCategoryListing[]).forEach((listing) => {
    const categoryId = normalizeId(listing.category_id);
    const stateId = normalizeId(listing.state_id);

    if (categoryId !== null) {
      listingCategoryCounts.set(categoryId, (listingCategoryCounts.get(categoryId) ?? 0) + 1);
    }

    if (stateId !== null) {
      listingStateCounts.set(stateId, (listingStateCounts.get(stateId) ?? 0) + 1);
    }
  });

  const categoryRecords = (categories ?? []) as RawCategory[];
  const childCategoryMap = new Map<number | null, RawCategory[]>();

  categoryRecords.forEach((category) => {
    const parentId = normalizeId(category.parent_id);
    const currentChildren = childCategoryMap.get(parentId) ?? [];
    currentChildren.push(category);
    childCategoryMap.set(parentId, currentChildren);
  });

  const categoryNodes = (childCategoryMap.get(null) ?? [])
    .map((category) => {
      const categoryId = normalizeId(category.id) ?? 0;
      const children = (childCategoryMap.get(categoryId) ?? []).map((child) => {
        const childId = normalizeId(child.id) ?? 0;

        return {
          id: childId,
          name: child.name,
          slug: child.slug,
          itemCount: listingCategoryCounts.get(childId) ?? 0,
        };
      });

      const totalItems =
        (listingCategoryCounts.get(categoryId) ?? 0) +
        children.reduce((sum, child) => sum + child.itemCount, 0);

      return {
        id: categoryId,
        name: category.name,
        slug: category.slug,
        totalItems,
        createdAt: category.created_at,
        children,
      } satisfies AdminStructureCategoryNode;
    })
    .sort((left, right) => right.totalItems - left.totalItems || left.name.localeCompare(right.name));

  const stateRecords = (states ?? []) as RawState[];
  const areaRecords = (areas ?? []) as RawArea[];
  const areasByState = new Map<number, RawArea[]>();

  areaRecords.forEach((area) => {
    const stateId = normalizeId(area.state_id);
    if (stateId === null) {
      return;
    }

    const currentAreas = areasByState.get(stateId) ?? [];
    currentAreas.push(area);
    areasByState.set(stateId, currentAreas);
  });

  const locations = stateRecords
    .map((state) => {
      const stateId = normalizeId(state.id) ?? 0;
      const relatedAreas = areasByState.get(stateId) ?? [];
      const listingCount = listingStateCounts.get(stateId) ?? 0;

      return {
        id: stateId,
        name: state.name,
        slug: state.slug,
        areaCount: relatedAreas.length,
        listingCount,
        status: listingCount > 0 ? 'operational' : 'maintenance',
        previewAreas: relatedAreas.slice(0, 3).map((area) => area.name),
      } satisfies AdminStructureLocationItem;
    })
    .sort((left, right) => right.listingCount - left.listingCount || left.name.localeCompare(right.name));

  const recentCategoryEvents = categoryRecords.map((category) => ({
    id: `category-${category.id}`,
    title: `Category "${category.name}" added`,
    detail: normalizeId(category.parent_id)
      ? 'Linked under an existing parent category.'
      : 'Added as a top-level marketplace category.',
    timestamp: category.created_at,
  }));

  const stateNameMap = new Map(
    stateRecords.map((state) => [normalizeId(state.id) ?? 0, state.name])
  );
  const recentAreaEvents = areaRecords.map((area) => ({
    id: `area-${area.id}`,
    title: `Location "${area.name}" added`,
    detail: `Mapped under ${stateNameMap.get(normalizeId(area.state_id) ?? 0) ?? 'a region'}.`,
    timestamp: area.created_at,
  }));

  const auditLog = [...recentCategoryEvents, ...recentAreaEvents]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 6);

  const mostActiveCategory = categoryNodes[0]
    ? {
        name: categoryNodes[0].name,
        itemCount: categoryNodes[0].totalItems,
      }
    : null;

  const filteredCategories = filterCategoryTree(categoryNodes, search);
  const filteredLocations = filterLocations(locations, search);

  return {
    overview: {
      totalCategories: categoryRecords.length,
      totalSubcategories: categoryRecords.filter((category) => normalizeId(category.parent_id) !== null).length,
      mostActiveCategory,
      structureHealth: {
        status: listingsWithoutLocation === 0 ? 'optimized' : 'attention',
        detail:
          listingsWithoutLocation === 0
            ? 'All category and location links are connected.'
            : `${listingsWithoutLocation} listing(s) still need a full location mapping.`,
      },
      globalReach: {
        activeRegions: locations.filter((location) => location.listingCount > 0).length,
        totalRegions: locations.length,
        totalListings: (listings ?? []).length,
      },
    },
    forms: {
      parentCategories: categoryNodes
        .map((category) => ({
          id: category.id,
          name: category.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    },
    categories: filteredCategories,
    locations: filteredLocations,
    auditLog,
  };
}

export async function createCategory(input: CreateCategoryInput): Promise<{
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
}> {
  const name = input.name.trim();
  const parentId = input.parentId ?? null;

  if (!name) {
    throw new AdminServiceError('Category name is required', 422);
  }

  if (parentId !== null) {
    const { data: parentCategory, error: parentError } = await supabaseAdmin
      .from('categories')
      .select('id')
      .eq('id', parentId)
      .maybeSingle();

    if (parentError) {
      console.error('[Admin] Failed to validate parent category:', parentError);
      throw new AdminServiceError('Unable to validate parent category', 500);
    }

    if (!parentCategory) {
      throw new AdminServiceError('Selected parent category was not found', 422);
    }
  }

  const slug = await resolveUniqueSlug('categories', name);
  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({
      name,
      slug,
      parent_id: parentId,
    })
    .select('id, name, slug, parent_id')
    .single();

  if (error || !data) {
    console.error('[Admin] Failed to create category:', error);
    throw new AdminServiceError('Unable to create category', 500);
  }

  return {
    id: normalizeId(data.id) ?? 0,
    name: data.name,
    slug: data.slug,
    parentId: normalizeId(data.parent_id),
  };
}

export async function createLocation(input: CreateLocationInput): Promise<{
  state: {
    id: number;
    name: string;
    slug: string;
  };
  areas: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
}> {
  const stateName = input.stateName.trim();
  const areaNames = Array.from(
    new Set((input.areaNames ?? []).map((area) => area.trim()).filter(Boolean))
  );

  if (!stateName) {
    throw new AdminServiceError('Region name is required', 422);
  }

  const stateSlug = slugify(stateName);
  let stateRecord:
    | {
        id: number | string;
        name: string;
        slug: string;
      }
    | null = null;

  const [
    { data: existingStateByName, error: stateByNameError },
    { data: existingStateBySlug, error: stateBySlugError },
  ] = await Promise.all([
    supabaseAdmin.from('states').select('id, name, slug').eq('name', stateName).maybeSingle(),
    supabaseAdmin.from('states').select('id, name, slug').eq('slug', stateSlug).maybeSingle(),
  ]);

  if (stateByNameError || stateBySlugError) {
    console.error('[Admin] Failed to validate region name:', stateByNameError ?? stateBySlugError);
    throw new AdminServiceError('Unable to validate region name', 500);
  }

  const existingState = existingStateByName ?? existingStateBySlug;

  if (existingState) {
    stateRecord = existingState;
  } else {
    const uniqueStateSlug = await resolveUniqueSlug('states', stateName);
    const { data: insertedState, error: insertStateError } = await supabaseAdmin
      .from('states')
      .insert({
        name: stateName,
        slug: uniqueStateSlug,
      })
      .select('id, name, slug')
      .single();

    if (insertStateError || !insertedState) {
      console.error('[Admin] Failed to create region:', insertStateError);
      throw new AdminServiceError('Unable to create region', 500);
    }

    stateRecord = insertedState;
  }

  const stateId = normalizeId(stateRecord.id) ?? 0;
  const { data: existingAreas, error: existingAreasError } = await supabaseAdmin
    .from('areas')
    .select('id, name, slug, state_id')
    .eq('state_id', stateId);

  if (existingAreasError) {
    console.error('[Admin] Failed to load existing areas:', existingAreasError);
    throw new AdminServiceError('Unable to validate areas', 500);
  }

  const existingAreaSlugSet = new Set(
    ((existingAreas ?? []) as RawArea[]).map((area) => area.slug.toLowerCase())
  );

  const insertedAreas: Array<{ id: number; name: string; slug: string }> = [];

  for (const areaName of areaNames) {
    const areaSlug = slugify(areaName);

    if (existingAreaSlugSet.has(areaSlug)) {
      continue;
    }

    const { data: insertedArea, error: insertAreaError } = await supabaseAdmin
      .from('areas')
      .insert({
        state_id: stateId,
        name: areaName,
        slug: areaSlug,
      })
      .select('id, name, slug')
      .single();

    if (insertAreaError || !insertedArea) {
      console.error('[Admin] Failed to create area:', insertAreaError);
      throw new AdminServiceError('Unable to create area', 500);
    }

    existingAreaSlugSet.add(areaSlug);
    insertedAreas.push({
      id: normalizeId(insertedArea.id) ?? 0,
      name: insertedArea.name,
      slug: insertedArea.slug,
    });
  }

  return {
    state: {
      id: stateId,
      name: stateRecord.name,
      slug: stateRecord.slug,
    },
    areas: insertedAreas,
  };
}
