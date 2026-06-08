import { supabaseAdmin } from '../../config/supabase';
import type { ListingCondition } from '../../types/listing';
import {
  type AdminReportStatusFilter as SharedAdminReportStatusFilter,
  type ReportReason,
  type ReportStatus,
} from '../../types/report';
import { isAccountSuspended } from '../../utils/accountStatus';
import { MODERATION_LISTING_BRAND as MODERATION_LISTING_BRAND_VALUE } from '../../utils/moderationThread';

export type AdminRole = 'user' | 'admin';
export type AdminUserStatus = 'active' | 'pending_verification' | 'suspended';
export type AdminUserRoleFilter = 'all' | AdminRole;
export type AdminUserStatusFilter = 'all' | AdminUserStatus;
export type AdminListingStatusFilter =
  | 'all'
  | 'active'
  | 'draft'
  | 'reserved'
  | 'sold'
  | 'rejected'
  | 'archived'
  | 'reported';
export type AdminReportStatusFilter = SharedAdminReportStatusFilter;
export type IdentityVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'resubmission_required';

export const LISTING_IMAGE_BUCKET =
  process.env.SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  'listing-images';
export const MODERATION_LISTING_BRAND = MODERATION_LISTING_BRAND_VALUE;
export const AVATAR_BUCKET =
  process.env.SUPABASE_AVATARS_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET?.trim() ||
  'avatars';
export const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export type Relation<T> = T | T[] | null;

export interface RawProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
  role: AdminRole;
  created_at: string;
  updated_at: string;
  state_id: number | null;
  area_id: number | null;
  identity_verification_status?: IdentityVerificationStatus | null;
  identity_verification_badge?: boolean | null;
  identity_verified_at?: string | null;
  identity_verified_by?: string | null;
  states: Relation<{ id: number; name: string }>;
  areas: Relation<{ id: number; name: string }>;
}

interface RawListingOwner {
  seller_id: string | null;
  brand?: string | null;
}

export interface RawAdminUserListing {
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

export interface RawAdminListing {
  id: string;
  seller_id: string;
  title: string;
  price: unknown;
  currency: string;
  status: string;
  cover_image_path: string | null;
  created_at: string;
  updated_at: string;
  views_count: unknown;
  brand: string | null;
  states: Relation<{ id: number; name: string }>;
  areas: Relation<{ id: number; name: string }>;
  categories: Relation<{ id: number; name: string }>;
}

export interface RawAdminListingDetail {
  id: string;
  seller_id: string;
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
  categories: Relation<{ id: number; name: string; slug: string }>;
  states: Relation<{ id: number; name: string; slug?: string }>;
  areas: Relation<{ id: number; name: string; slug?: string; state_id?: number | string | null }>;
  sold_to_profile: Relation<{
    id: string;
    username: string;
    full_name: string | null;
    avatar_path: string | null;
  }>;
}

export interface RawAdminReport {
  id: string;
  listing_id: string;
  reporter_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export interface RawCategory {
  id: number | string;
  name: string;
  slug: string;
  parent_id: number | string | null;
  created_at: string;
}

export interface RawArea {
  id: number | string;
  state_id: number | string;
  name: string;
  slug: string;
  created_at: string;
}

export interface RawState {
  id: number | string;
  name: string;
  slug: string;
}

export interface RawCategoryListing {
  category_id: number | string | null;
  state_id: number | string | null;
  area_id: number | string | null;
}

export interface RawAdminOverviewProfile {
  id: string;
  username: string;
  full_name: string | null;
  created_at: string;
  identity_verification_status?: IdentityVerificationStatus | null;
  identity_verification_badge?: boolean | null;
}

export interface RawAdminOverviewListing {
  id: string;
  title: string;
  brand: string | null;
  status: string;
  created_at: string;
  sold_at: string | null;
  state_id: number | string | null;
}

export interface RawAdminOverviewReport {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  listings: Relation<{
    id: string;
    title: string;
  }>;
}

export interface RawAdminOverviewConversation {
  id: string;
  listings: Relation<{
    brand: string | null;
  }>;
}

export interface RawListingImage {
  listing_id: string;
  storage_path: string;
  is_cover: boolean;
  sort_order: number;
}

export interface RawModerationConversation {
  id: string;
  seller_id: string;
  listings: Relation<{
    brand: string | null;
  }>;
}

export interface RawModerationMessage {
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface RawRating {
  rating: unknown;
}

export interface AdminReportListingSignals {
  totalReportCount: number;
  openReportCount: number;
  latestOpenReasonLabel: string | null;
}

export interface AdminListingModerationSnapshot {
  eventType: 'paused' | 'rejected' | 'resubmitted' | 'approved' | 'deleted';
  reason: string | null;
  createdAt: string;
}

export interface AuthAdminUser {
  id: string;
  email?: string;
  created_at?: string;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: {
    full_name?: unknown;
    name?: unknown;
    username?: unknown;
    avatar_path?: unknown;
    role?: unknown;
    [key: string]: unknown;
  } | null;
  app_metadata?: {
    account_status?: unknown;
    role?: unknown;
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

export interface AdminListingsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  categoryId?: number;
  stateId?: number;
}

export interface AdminReportsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
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
  identityVerificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected' | 'resubmission_required';
  identityVerificationBadge: boolean;
  identityVerifiedAt: string | null;
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

export interface UpdateAdminListingStatusInput {
  adminUserId: string;
  listingId: string;
  action: 'pause' | 'resume' | 'approve' | 'reject';
  reason?: string;
}

export interface AdminModerationThreadResponse {
  conversationId: string | null;
  listingId: string;
  listingTitle: string;
  recipientId: string;
  recipientName: string;
  topicType: 'moderation';
}

export interface AdminListingListItem {
  id: string;
  title: string;
  price: number;
  currency: string;
  status: string;
  statusLabel: string;
  coverImagePath: string | null;
  createdAt: string;
  updatedAt: string;
  viewsCount: number;
  locationLabel: string;
  categoryName: string | null;
  seller: {
    id: string;
    fullName: string;
    username: string;
    avatarPath: string | null;
    locationLabel: string;
  };
  offerCount: number;
  conversationCount: number;
  reportCount: number;
  pendingReportCount: number;
  isFlagged: boolean;
}

export interface AdminListingsResponse {
  stats: {
    totalListings: number;
    activeListings: number;
    soldListings: number;
    flaggedListings: number;
    pendingReports: number;
  };
  filters: {
    search: string;
    status: AdminListingStatusFilter;
    categoryId: number | null;
    stateId: number | null;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  lookups: {
    categories: Array<{
      id: number;
      name: string;
    }>;
    states: Array<{
      id: number;
      name: string;
    }>;
  };
  listings: AdminListingListItem[];
}

export interface AdminDeleteListingResponse {
  id: string;
  deleted: true;
  deletedRecords: {
    messages: number;
    conversations: number;
    offers: number;
    reports: number;
    reviews: number;
    favorites: number;
    images: number;
    dailyViews: number;
  };
}

export interface AdminListingStatusUpdateResponse {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  hiddenFromBrowse: boolean;
}

export interface AdminListingDetailResponse {
  listing: {
    id: string;
    title: string;
    description: string | null;
    brand: string | null;
    price: number;
    currency: string;
    negotiable: boolean;
    status: string;
    statusLabel: string;
    condition: ListingCondition;
    conditionLabel: string;
    coverImagePath: string | null;
    imagePaths: string[];
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    viewsCount: number;
    location: {
      stateId: number | null;
      stateName: string | null;
      areaId: number | null;
      areaName: string | null;
    };
    locationLabel: string;
    category: {
      id: number;
      name: string;
      slug: string;
    } | null;
    soldTo: {
      id: string;
      displayName: string;
      avatarPath: string | null;
    } | null;
    hiddenFromBrowse: boolean;
    moderationReason: string | null;
    moderationReasonUpdatedAt: string | null;
    moderationEventType: 'paused' | 'rejected' | 'resubmitted' | 'approved' | 'deleted' | null;
  };
  seller: {
    id: string;
    fullName: string;
    username: string;
    avatarPath: string | null;
    memberSince: string;
    averageRating: number | null;
    totalReviews: number;
    totalSales: number;
    activeListings: number;
    location: {
      stateId: number | null;
      stateName: string | null;
      areaId: number | null;
      areaName: string | null;
    };
    locationLabel: string;
  };
  metrics: {
    favoritesCount: number;
    offerCount: number;
    pendingOfferCount: number;
    conversationCount: number;
    reportCount: number;
    openReportCount: number;
    pendingReportCount: number;
  };
  recentReports: Array<{
    id: string;
    reason: ReportReason;
    reasonLabel: string;
    details: string | null;
    status: ReportStatus;
    statusLabel: string;
    createdAt: string;
    updatedAt: string;
    reporter: {
      id: string;
      fullName: string;
      username: string;
      avatarPath: string | null;
      locationLabel: string;
    };
  }>;
}

export interface AdminReportListItem {
  id: string;
  reason: ReportReason;
  reasonLabel: string;
  details: string | null;
  reportType: 'listing' | 'delivery_issue';
  status: ReportStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  deliveryIssue: {
    offerId: string | null;
    agreedPriceLabel: string | null;
    paymentReference: string | null;
    proofUrls: string[];
    buyerStatement: string;
  } | null;
  listing: {
    id: string;
    title: string;
    price: number;
    currency: string;
    status: string;
    statusLabel: string;
    coverImagePath: string | null;
    locationLabel: string;
    totalReportCount: number;
    openReportCount: number;
    latestOpenReasonLabel: string | null;
    hiddenFromBrowse: boolean;
    moderationSummary: string;
  };
  reporter: {
    id: string;
    fullName: string;
    username: string;
    avatarPath: string | null;
    locationLabel: string;
    identityVerificationStatus: IdentityVerificationStatus;
    identityVerificationBadge: boolean;
    identityVerifiedAt: string | null;
  };
  seller: {
    id: string;
    fullName: string;
    username: string;
    avatarPath: string | null;
    locationLabel: string;
    identityVerificationStatus: IdentityVerificationStatus;
    identityVerificationBadge: boolean;
    identityVerifiedAt: string | null;
  };
}

export interface AdminReportsResponse {
  stats: {
    totalReports: number;
    pendingReports: number;
    inReviewReports: number;
    resolvedReports: number;
    pausedListings: number;
  };
  filters: {
    search: string;
    status: AdminReportStatusFilter;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  reports: AdminReportListItem[];
}

export interface AdminReportDetailResponse {
  report: AdminReportListItem;
}

export interface UpdateAdminReportStatusInput {
  reportId: string;
  action: 'review' | 'resolve' | 'dismiss';
}

export interface AdminReportStatusUpdateResponse {
  id: string;
  status: ReportStatus;
  statusLabel: string;
  updatedAt: string;
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

export interface AdminOverviewResponse {
  stats: {
    totalUsers: number;
    activeListings: number;
    soldItems: number;
    pendingReports: number;
    pendingOffers: number;
  };
  health: {
    verificationRate: number;
    pendingVerificationUsers: number;
    identityVerificationRate: number;
    pendingIdentityVerifications: number;
    verifiedIdentityUsers: number;
    emailVerificationRate: number;
    pendingEmailVerificationUsers: number;
    suspendedUsers: number;
    activeRegions: number;
    moderationThreads: number;
  };
  activity: {
    availableYears: number[];
    selectedYear: number | null;
    months: Array<{
      value: string;
      label: string;
      users: number;
      listings: number;
      soldItems: number;
      reports: number;
    }>;
  };
  spotlight: {
    busiestState: {
      name: string;
      listingCount: number;
    } | null;
    mostReportedListing: {
      id: string;
      title: string;
      reportCount: number;
    } | null;
  };
  recentActivity: Array<{
    id: string;
    actorLabel: string;
    actionLabel: string;
    targetLabel: string;
    statusLabel: string;
    statusTone: 'neutral' | 'success' | 'attention';
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

export function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

export function normalizePage(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) {
    return 1;
  }

  return value;
}

export function normalizePageSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) {
    return 8;
  }

  return Math.min(value, 50);
}

export function normalizeRoleFilter(value: string | undefined): AdminUserRoleFilter {
  if (value === 'admin') {
    return 'admin';
  }

  if (value === 'user') {
    return 'user';
  }

  return 'all';
}

export function normalizeStatusFilter(value: string | undefined): AdminUserStatusFilter {
  if (value === 'active' || value === 'pending_verification' || value === 'suspended') {
    return value;
  }

  return 'all';
}

export function normalizeAdminListingStatusFilter(
  value: string | undefined
): AdminListingStatusFilter {
  if (
    value === 'active' ||
    value === 'draft' ||
    value === 'reserved' ||
    value === 'sold' ||
    value === 'rejected' ||
    value === 'archived' ||
    value === 'reported'
  ) {
    return value;
  }

  return 'all';
}

export function normalizeAdminReportStatusFilter(
  value: string | undefined
): AdminReportStatusFilter {
  if (
    value === 'pending' ||
    value === 'reviewed' ||
    value === 'resolved' ||
    value === 'rejected'
  ) {
    return value;
  }

  return 'all';
}

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'item'
  );
}

export function sanitizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function normalizeId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNumber(value: unknown, fallback = 0): number {
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

export function buildLocationSummary(
  rawState: Relation<{ id: number | string; name: string }>,
  rawArea: Relation<{ id: number | string; name: string }>
) {
  const state = unwrapRelation(rawState);
  const area = unwrapRelation(rawArea);

  return {
    stateId: normalizeId(state?.id),
    stateName: state?.name ?? null,
    areaId: normalizeId(area?.id),
    areaName: area?.name ?? null,
  };
}

export function buildLocationLabel(stateName: string | null, areaName: string | null): string {
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

export function buildProfileDisplayName(
  profile: Pick<RawProfile, 'full_name' | 'username'>
): string {
  return profile.full_name?.trim() || profile.username || 'Marketplace User';
}

export function humanizeValue(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function humanizeAdminListingStatus(value: string): string {
  if (value === 'archived') {
    return 'Paused';
  }

  if (value === 'rejected') {
    return 'Pending Review';
  }

  return humanizeValue(value);
}

export function isListingHiddenFromBrowse(status: string): boolean {
  return status === 'archived' || status === 'draft' || status === 'rejected';
}

export function deriveUserStatus(user: AuthAdminUser | undefined): AdminUserStatus {
  if (isAccountSuspended(user)) {
    return 'suspended';
  }

  if (!user?.email_confirmed_at) {
    return 'pending_verification';
  }

  return 'active';
}

export function buildMonthKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildRecentMonthBuckets(
  monthCount = 6
): AdminOverviewResponse['activity']['months'] {
  const now = new Date();

  return Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthCount - 1 - index), 1)
    );
    const value = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`;

    return {
      value,
      label: new Intl.DateTimeFormat('en-MY', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(monthDate),
      users: 0,
      listings: 0,
      soldItems: 0,
      reports: 0,
    };
  });
}

export function buildYearMonthBuckets(year: number): AdminOverviewResponse['activity']['months'] {
  return Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(Date.UTC(year, index, 1));
    const value = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`;

    return {
      value,
      label: new Intl.DateTimeFormat('en-MY', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(monthDate),
      users: 0,
      listings: 0,
      soldItems: 0,
      reports: 0,
    };
  });
}

export function buildActorLabel(
  profile: Pick<RawAdminOverviewProfile, 'full_name' | 'username'>
): string {
  return profile.full_name?.trim() || profile.username || 'Marketplace User';
}

export function formatRecentStatusLabel(status: string): string {
  return humanizeValue(status || 'updated');
}

export function incrementStringMapCount(
  map: Map<string, number>,
  key: string | null | undefined
): void {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + 1);
}

export async function listAllAuthUsers(): Promise<AuthAdminUser[]> {
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

export async function getListingCountMap(): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('seller_id, brand')
    .is('deleted_at', null);

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

export async function getListingCountForUser(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', userId)
    .is('deleted_at', null)
    .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`);

  if (error) {
    console.error('[Admin] Failed to count user listings:', error);
    throw new AdminServiceError('Unable to load listing totals', 500);
  }

  return count ?? 0;
}

export async function getProfileById(userId: string): Promise<RawProfile> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id, username, full_name, avatar_path, role, created_at, updated_at, state_id, area_id,
      identity_verification_status, identity_verification_badge, identity_verified_at, identity_verified_by,
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

export async function getAuthUserById(userId: string): Promise<AuthAdminUser> {
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

export function normalizeRequiredReason(reason: string | undefined, actionLabel: string): string {
  const trimmedReason = reason?.trim();

  if (!trimmedReason) {
    throw new AdminServiceError(`${actionLabel} reason is required`, 422);
  }

  return trimmedReason;
}
