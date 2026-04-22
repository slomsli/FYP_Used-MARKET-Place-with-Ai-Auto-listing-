import { supabaseAdmin } from '../config/supabase';
import { ensureProfileForUserId } from './auth/profileSync';
import { sendMessage } from './messageService';
import { type ListingCondition } from '../types/listing';
import { getPublicStorageUrl, getPublicStorageUrls } from '../utils/storage';
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type AdminReportStatusFilter as SharedAdminReportStatusFilter,
  type ReportReason,
  type ReportStatus,
} from '../types/report';
import {
  MODERATION_LISTING_BRAND,
  buildModerationListingTargetKey,
  buildModerationListingTitle,
} from '../utils/moderationThread';
import {
  buildListingModerationMessage,
  parseListingModerationMessage,
} from '../utils/listingModeration';
import {
  buildUpdatedAppMetadata,
  isAccountSuspended,
} from '../utils/accountStatus';

type AdminRole = 'user' | 'admin';
type AdminUserStatus = 'active' | 'pending_verification' | 'suspended';
type AdminUserRoleFilter = 'all' | AdminRole;
type AdminUserStatusFilter = 'all' | AdminUserStatus;
type AdminListingStatusFilter =
  | 'all'
  | 'active'
  | 'draft'
  | 'reserved'
  | 'sold'
  | 'rejected'
  | 'archived'
  | 'reported';
type AdminReportStatusFilter = SharedAdminReportStatusFilter;
const LISTING_IMAGE_BUCKET =
  process.env.SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_LISTING_IMAGES_BUCKET?.trim() ||
  'listing-images';
const AVATAR_BUCKET =
  process.env.SUPABASE_AVATARS_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET?.trim() ||
  'avatars';
const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

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

interface RawAdminListing {
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

interface RawAdminListingDetail {
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

interface RawAdminReport {
  id: string;
  listing_id: string;
  reporter_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
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

interface RawAdminOverviewProfile {
  id: string;
  username: string;
  full_name: string | null;
  created_at: string;
}

interface RawAdminOverviewListing {
  id: string;
  title: string;
  brand: string | null;
  status: string;
  created_at: string;
  sold_at: string | null;
  state_id: number | string | null;
}

interface RawAdminOverviewReport {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  listings: Relation<{
    id: string;
    title: string;
  }>;
}

interface RawAdminOverviewConversation {
  id: string;
  listings: Relation<{
    brand: string | null;
  }>;
}

interface RawListingImage {
  listing_id: string;
  storage_path: string;
  is_cover: boolean;
  sort_order: number;
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

interface RawRating {
  rating: unknown;
}

interface AdminReportListingSignals {
  totalReportCount: number;
  openReportCount: number;
  latestOpenReasonLabel: string | null;
}

interface AdminListingModerationSnapshot {
  eventType: 'paused' | 'rejected' | 'resubmitted' | 'approved' | 'deleted';
  reason: string | null;
  createdAt: string;
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
  status: ReportStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
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
  };
  seller: {
    id: string;
    fullName: string;
    username: string;
    avatarPath: string | null;
    locationLabel: string;
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
    suspendedUsers: number;
    activeRegions: number;
    moderationThreads: number;
  };
  activity: {
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

function normalizeAdminListingStatusFilter(value: string | undefined): AdminListingStatusFilter {
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

function normalizeAdminReportStatusFilter(value: string | undefined): AdminReportStatusFilter {
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

function buildLocationSummary(
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

function buildProfileDisplayName(profile: Pick<RawProfile, 'full_name' | 'username'>): string {
  return profile.full_name?.trim() || profile.username || 'Marketplace User';
}

function humanizeValue(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function humanizeAdminListingStatus(value: string): string {
  if (value === 'archived') {
    return 'Paused';
  }

  if (value === 'rejected') {
    return 'Pending Review';
  }

  return humanizeValue(value);
}

function isListingHiddenFromBrowse(status: string): boolean {
  return status === 'archived' || status === 'draft' || status === 'rejected';
}

function buildReportModerationSummary(
  listing: RawAdminListing,
  signals: AdminReportListingSignals,
  fallbackReasonLabel: string
): string {
  const activeReason = signals.latestOpenReasonLabel ?? fallbackReasonLabel;

  if (listing.status === 'archived') {
    if (signals.openReportCount > 0) {
      return `Hidden from public browse while ${signals.openReportCount} open report(s) are reviewed. Latest open reason: ${activeReason}.`;
    }

    return 'Hidden from public browse by admin action. Review the seller context before resuming this listing.';
  }

  if (listing.status === 'rejected') {
    return 'The seller updated this paused listing and it is waiting for admin approval before it can return to public browse.';
  }

  if (signals.openReportCount > 0) {
    return `${signals.openReportCount} open report(s) still need moderation review. Latest open reason: ${activeReason}.`;
  }

  if (isListingHiddenFromBrowse(listing.status)) {
    return `This listing is not visible on browse because its current status is ${humanizeAdminListingStatus(listing.status).toLowerCase()}.`;
  }

  return 'This listing is still visible to shoppers because there are no open reports linked to it right now.';
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

function buildMonthKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildRecentMonthBuckets(monthCount = 6): AdminOverviewResponse['activity']['months'] {
  const now = new Date();

  return Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthCount - 1 - index), 1)
    );
    const value = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;

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

function buildActorLabel(profile: Pick<RawAdminOverviewProfile, 'full_name' | 'username'>): string {
  return profile.full_name?.trim() || profile.username || 'Marketplace User';
}

function formatRecentStatusLabel(status: string): string {
  return humanizeValue(status || 'updated');
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
    avatarPath: getPublicStorageUrl(AVATAR_BUCKET, profile.avatar_path),
    role: profile.role === 'admin' ? 'admin' : 'user',
    joinDate: profile.created_at,
    status: deriveUserStatus(authUser),
    locationLabel: buildLocationLabel(state?.name ?? null, area?.name ?? null),
    listingCount: listingCountMap.get(profile.id) ?? 0,
  };
}

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

function buildAdminReportListItem(
  report: RawAdminReport,
  listing: RawAdminListing,
  reporterProfile: RawProfile,
  sellerProfile: RawProfile,
  signals: AdminReportListingSignals
): AdminReportListItem {
  const listingState = unwrapRelation(listing.states);
  const listingArea = unwrapRelation(listing.areas);
  const reporterState = unwrapRelation(reporterProfile.states);
  const reporterArea = unwrapRelation(reporterProfile.areas);
  const sellerState = unwrapRelation(sellerProfile.states);
  const sellerArea = unwrapRelation(sellerProfile.areas);
  const reasonLabel = REPORT_REASON_LABELS[report.reason] ?? humanizeValue(report.reason);

  return {
    id: report.id,
    reason: report.reason,
    reasonLabel,
    details: report.details,
    status: report.status,
    statusLabel: REPORT_STATUS_LABELS[report.status] ?? humanizeValue(report.status),
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    listing: {
      id: listing.id,
      title: listing.title,
      price: Number(listing.price ?? 0),
      currency: listing.currency,
      status: listing.status,
      statusLabel: humanizeAdminListingStatus(listing.status),
      coverImagePath: getPublicStorageUrl(LISTING_IMAGE_BUCKET, listing.cover_image_path),
      locationLabel: buildLocationLabel(listingState?.name ?? null, listingArea?.name ?? null),
      totalReportCount: signals.totalReportCount,
      openReportCount: signals.openReportCount,
      latestOpenReasonLabel: signals.latestOpenReasonLabel,
      hiddenFromBrowse: isListingHiddenFromBrowse(listing.status),
      moderationSummary: buildReportModerationSummary(listing, signals, reasonLabel),
    },
    reporter: {
      id: reporterProfile.id,
      fullName: buildProfileDisplayName(reporterProfile),
      username: reporterProfile.username,
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, reporterProfile.avatar_path),
      locationLabel: buildLocationLabel(reporterState?.name ?? null, reporterArea?.name ?? null),
    },
    seller: {
      id: sellerProfile.id,
      fullName: buildProfileDisplayName(sellerProfile),
      username: sellerProfile.username,
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, sellerProfile.avatar_path),
      locationLabel: buildLocationLabel(sellerState?.name ?? null, sellerArea?.name ?? null),
    },
  };
}

function incrementStringMapCount(map: Map<string, number>, key: string | null | undefined): void {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + 1);
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

function normalizeRequiredReason(reason: string | undefined, actionLabel: string): string {
  const trimmedReason = reason?.trim();

  if (!trimmedReason) {
    throw new AdminServiceError(`${actionLabel} reason is required`, 422);
  }

  return trimmedReason;
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
    supabaseAdmin.from('listings').select('status, brand').eq('seller_id', sellerProfile.id),
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
            ratings.reduce((sum, row) => sum + toNumber(row.rating), 0) /
            totalReviews
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

export async function getAdminOverview(): Promise<AdminOverviewResponse> {
  const [
    { data: profiles, error: profileError },
    authUsers,
    { data: listings, error: listingError },
    { data: reports, error: reportError },
    pendingOffersResult,
    { data: conversations, error: conversationError },
    { data: states, error: stateError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, created_at')
      .order('created_at', { ascending: false }),
    listAllAuthUsers(),
    supabaseAdmin
      .from('listings')
      .select('id, title, brand, status, created_at, sold_at, state_id')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('reports')
      .select(`
        id,
        status,
        created_at,
        updated_at,
        listings!reports_listing_id_fkey ( id, title )
      `)
      .order('updated_at', { ascending: false }),
    supabaseAdmin.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin
      .from('conversations')
      .select(`
        id,
        listings!conversations_listing_id_fkey ( brand )
      `),
    supabaseAdmin.from('states').select('id, name, slug').order('name'),
  ]);

  if (profileError) {
    console.error('[Admin] Failed to load overview profiles:', profileError);
    throw new AdminServiceError('Unable to load admin overview users', 500);
  }

  if (listingError) {
    console.error('[Admin] Failed to load overview listings:', listingError);
    throw new AdminServiceError('Unable to load admin overview listings', 500);
  }

  if (reportError) {
    console.error('[Admin] Failed to load overview reports:', reportError);
    throw new AdminServiceError('Unable to load admin overview reports', 500);
  }

  if (pendingOffersResult.error) {
    console.error('[Admin] Failed to count pending offers:', pendingOffersResult.error);
    throw new AdminServiceError('Unable to load admin overview offers', 500);
  }

  if (conversationError) {
    console.error('[Admin] Failed to load moderation threads:', conversationError);
    throw new AdminServiceError('Unable to load moderation thread overview', 500);
  }

  if (stateError) {
    console.error('[Admin] Failed to load states for overview:', stateError);
    throw new AdminServiceError('Unable to load admin overview locations', 500);
  }

  const profileRows = (profiles ?? []) as RawAdminOverviewProfile[];
  const listingRows = ((listings ?? []) as RawAdminOverviewListing[]).filter(
    (listing) => listing.brand !== MODERATION_LISTING_BRAND
  );
  const reportRows = (reports ?? []) as RawAdminOverviewReport[];
  const conversationRows = (conversations ?? []) as RawAdminOverviewConversation[];
  const stateRows = (states ?? []) as RawState[];

  const authUserMap = new Map(authUsers.map((user) => [user.id, user]));
  const monthBuckets = buildRecentMonthBuckets();
  const monthBucketMap = new Map(monthBuckets.map((bucket) => [bucket.value, bucket]));
  const pendingVerificationUsers = profileRows.filter(
    (profile) => !authUserMap.get(profile.id)?.email_confirmed_at
  ).length;
  const suspendedUsers = profileRows.filter((profile) =>
    isAccountSuspended(authUserMap.get(profile.id))
  ).length;
  const verifiedUsers = profileRows.length - pendingVerificationUsers;
  const verificationRate = profileRows.length
    ? Math.round((verifiedUsers / profileRows.length) * 100)
    : 0;
  const activeListings = listingRows.filter((listing) => listing.status === 'active').length;
  const soldItems = listingRows.filter((listing) => listing.status === 'sold').length;
  const pendingReports = reportRows.filter((report) => report.status === 'pending').length;
  const activeRegions = new Set(
    listingRows
      .map((listing) => normalizeId(listing.state_id))
      .filter((stateId): stateId is number => stateId !== null)
  ).size;
  const moderationThreads = conversationRows.filter(
    (conversation) => unwrapRelation(conversation.listings)?.brand === MODERATION_LISTING_BRAND
  ).length;

  for (const profile of profileRows) {
    const monthKey = buildMonthKey(profile.created_at);
    if (monthKey && monthBucketMap.has(monthKey)) {
      monthBucketMap.get(monthKey)!.users += 1;
    }
  }

  for (const listing of listingRows) {
    const createdMonthKey = buildMonthKey(listing.created_at);
    if (createdMonthKey && monthBucketMap.has(createdMonthKey)) {
      monthBucketMap.get(createdMonthKey)!.listings += 1;
    }

    if (listing.status === 'sold') {
      const soldMonthKey = buildMonthKey(listing.sold_at ?? listing.created_at);
      if (soldMonthKey && monthBucketMap.has(soldMonthKey)) {
        monthBucketMap.get(soldMonthKey)!.soldItems += 1;
      }
    }
  }

  for (const report of reportRows) {
    const monthKey = buildMonthKey(report.created_at);
    if (monthKey && monthBucketMap.has(monthKey)) {
      monthBucketMap.get(monthKey)!.reports += 1;
    }
  }

  const stateNameMap = new Map(
    stateRows.map((state) => [normalizeId(state.id) ?? 0, state.name])
  );
  const stateListingCounts = new Map<number, number>();

  for (const listing of listingRows) {
    const stateId = normalizeId(listing.state_id);
    if (stateId === null) {
      continue;
    }

    stateListingCounts.set(stateId, (stateListingCounts.get(stateId) ?? 0) + 1);
  }

  const busiestStateEntry = [...stateListingCounts.entries()].sort(
    (left, right) => right[1] - left[1]
  )[0];
  const busiestState = busiestStateEntry
    ? {
        name: stateNameMap.get(busiestStateEntry[0]) ?? 'Unknown region',
        listingCount: busiestStateEntry[1],
      }
    : null;

  const reportCountsByListing = new Map<string, { title: string; reportCount: number }>();

  for (const report of reportRows) {
    const relatedListing = unwrapRelation(report.listings);
    if (!relatedListing) {
      continue;
    }

    const current = reportCountsByListing.get(relatedListing.id) ?? {
      title: relatedListing.title,
      reportCount: 0,
    };

    current.reportCount += 1;
    reportCountsByListing.set(relatedListing.id, current);
  }

  const mostReportedListingEntry = [...reportCountsByListing.entries()].sort(
    (left, right) => right[1].reportCount - left[1].reportCount
  )[0];
  const mostReportedListing = mostReportedListingEntry
    ? {
        id: mostReportedListingEntry[0],
        title: mostReportedListingEntry[1].title,
        reportCount: mostReportedListingEntry[1].reportCount,
      }
    : null;

  const recentActivity = [
    ...profileRows.slice(0, 4).map((profile) => ({
      id: `profile-${profile.id}`,
      actorLabel: buildActorLabel(profile),
      actionLabel: 'Joined platform',
      targetLabel: 'New marketplace account',
      statusLabel: 'New User',
      statusTone: 'neutral' as const,
      timestamp: profile.created_at,
    })),
    ...listingRows.slice(0, 4).map((listing) => ({
      id: `listing-${listing.id}`,
      actorLabel: 'Marketplace',
      actionLabel: listing.status === 'sold' ? 'Sale completed' : 'Listing published',
      targetLabel: listing.title,
      statusLabel: formatRecentStatusLabel(listing.status),
      statusTone: listing.status === 'sold' ? ('success' as const) : ('neutral' as const),
      timestamp: listing.status === 'sold' ? listing.sold_at ?? listing.created_at : listing.created_at,
    })),
    ...reportRows.slice(0, 4).map((report) => {
      const relatedListing = unwrapRelation(report.listings);

      return {
        id: `report-${report.id}`,
        actorLabel: 'Moderation',
        actionLabel: report.status === 'pending' ? 'Report queued' : 'Report updated',
        targetLabel: relatedListing?.title ?? 'Listing review',
        statusLabel: formatRecentStatusLabel(report.status),
        statusTone: report.status === 'pending' ? ('attention' as const) : ('success' as const),
        timestamp: report.updated_at || report.created_at,
      };
    }),
  ]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 8);

  return {
    stats: {
      totalUsers: profileRows.length,
      activeListings,
      soldItems,
      pendingReports,
      pendingOffers: pendingOffersResult.count ?? 0,
    },
    health: {
      verificationRate,
      pendingVerificationUsers,
      suspendedUsers,
      activeRegions,
      moderationThreads,
    },
    activity: {
      months: monthBuckets,
    },
    spotlight: {
      busiestState,
      mostReportedListing,
    },
    recentActivity,
  };
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

  const sellerProfileMap = new Map(
    ((profiles ?? []) as RawProfile[]).map((profile) => [profile.id, profile])
  );
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
    categoryId === null ? null : categoryLookup.find((category) => category.id === categoryId)?.name ?? null;
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
    supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id),
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
        reasonLabel: REPORT_REASON_LABELS[report.reason] ?? humanizeValue(report.reason),
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

export async function getAdminReports(query: AdminReportsQuery): Promise<AdminReportsResponse> {
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const search = (query.search ?? '').trim().toLowerCase();
  const status = normalizeAdminReportStatusFilter(query.status);

  const [
    { data: profiles, error: profileError },
    { data: listings, error: listingError },
    { data: reports, error: reportError },
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
      .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`),
    supabaseAdmin
      .from('reports')
      .select('id, listing_id, reporter_id, reason, details, status, created_at, updated_at')
      .order('created_at', { ascending: false }),
  ]);

  if (profileError) {
    console.error('[Admin] Failed to load profiles for report management:', profileError);
    throw new AdminServiceError('Unable to load report profiles', 500);
  }

  if (listingError) {
    console.error('[Admin] Failed to load listings for report management:', listingError);
    throw new AdminServiceError('Unable to load reported listings', 500);
  }

  if (reportError) {
    console.error('[Admin] Failed to load reports for report management:', reportError);
    throw new AdminServiceError('Unable to load listing reports', 500);
  }

  const rawReports = (reports ?? []) as RawAdminReport[];
  const profileMap = new Map(
    ((profiles ?? []) as RawProfile[]).map((profile) => [profile.id, profile])
  );
  const listingMap = new Map(
    ((listings ?? []) as RawAdminListing[]).map((listing) => [listing.id, listing])
  );
  const totalReportCountMap = new Map<string, number>();
  const openReportCountMap = new Map<string, number>();
  const latestOpenReasonLabelMap = new Map<string, string>();

  rawReports.forEach((report) => {
    incrementStringMapCount(totalReportCountMap, report.listing_id);

    if (report.status === 'pending' || report.status === 'reviewed') {
      incrementStringMapCount(openReportCountMap, report.listing_id);

      if (!latestOpenReasonLabelMap.has(report.listing_id)) {
        latestOpenReasonLabelMap.set(
          report.listing_id,
          REPORT_REASON_LABELS[report.reason] ?? humanizeValue(report.reason)
        );
      }
    }
  });

  const allReports = rawReports
    .map((report) => {
      const listing = listingMap.get(report.listing_id);
      const reporterProfile = profileMap.get(report.reporter_id);
      const sellerProfile = listing ? profileMap.get(listing.seller_id) : null;

      if (
        !listing ||
        !reporterProfile ||
        !sellerProfile ||
        listing.brand === MODERATION_LISTING_BRAND ||
        sellerProfile.role === 'admin'
      ) {
        return null;
      }

      return buildAdminReportListItem(report, listing, reporterProfile, sellerProfile, {
        totalReportCount: totalReportCountMap.get(report.listing_id) ?? 0,
        openReportCount: openReportCountMap.get(report.listing_id) ?? 0,
        latestOpenReasonLabel: latestOpenReasonLabelMap.get(report.listing_id) ?? null,
      });
    })
    .filter((report): report is AdminReportListItem => report !== null);

  const filteredReports = allReports.filter((report) => {
    const matchesSearch =
      !search ||
      report.reasonLabel.toLowerCase().includes(search) ||
      report.details?.toLowerCase().includes(search) ||
      report.id.toLowerCase().includes(search) ||
      report.listing.title.toLowerCase().includes(search) ||
      report.listing.id.toLowerCase().includes(search) ||
      report.reporter.fullName.toLowerCase().includes(search) ||
      report.reporter.username.toLowerCase().includes(search) ||
      report.seller.fullName.toLowerCase().includes(search) ||
      report.seller.username.toLowerCase().includes(search);

    const matchesStatus = status === 'all' ? true : report.status === status;

    return matchesSearch && matchesStatus;
  });

  const totalItems = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedReports = filteredReports.slice(startIndex, startIndex + pageSize);
  const pausedListingIds = new Set(
    allReports
      .filter((report) => report.listing.status === 'archived')
      .map((report) => report.listing.id)
  );

  return {
    stats: {
      totalReports: allReports.length,
      pendingReports: allReports.filter((report) => report.status === 'pending').length,
      inReviewReports: allReports.filter((report) => report.status === 'reviewed').length,
      resolvedReports: allReports.filter((report) => report.status === 'resolved').length,
      pausedListings: pausedListingIds.size,
    },
    filters: {
      search: query.search?.trim() ?? '',
      status,
    },
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    reports: paginatedReports,
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

export async function updateAdminReportStatus(
  input: UpdateAdminReportStatusInput
): Promise<AdminReportStatusUpdateResponse> {
  const { data: report, error: reportError } = await supabaseAdmin
    .from('reports')
    .select('id, status')
    .eq('id', input.reportId)
    .maybeSingle();

  if (reportError) {
    console.error('[Admin] Failed to inspect report before status update:', reportError);
    throw new AdminServiceError('Unable to inspect the selected report', 500);
  }

  if (!report) {
    throw new AdminServiceError('Report was not found', 404);
  }

  const nextStatus: ReportStatus =
    input.action === 'review'
      ? 'reviewed'
      : input.action === 'resolve'
        ? 'resolved'
        : 'rejected';
  const timestamp = new Date().toISOString();
  const { data: updatedReport, error: updateError } = await supabaseAdmin
    .from('reports')
    .update({
      status: nextStatus,
      updated_at: timestamp,
    })
    .eq('id', input.reportId)
    .select('id, status, updated_at')
    .single();

  if (updateError || !updatedReport) {
    console.error('[Admin] Failed to update report status:', updateError);
    throw new AdminServiceError('Unable to update the report status', 500);
  }

  return {
    id: updatedReport.id,
    status: updatedReport.status as ReportStatus,
    statusLabel:
      REPORT_STATUS_LABELS[updatedReport.status as ReportStatus] ??
      humanizeValue(updatedReport.status),
    updatedAt: updatedReport.updated_at,
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
    .select('id, seller_id, title, brand')
    .eq('id', input.listingId)
    .maybeSingle();

  if (listingError) {
    console.error('[Admin] Failed to inspect listing before deletion:', listingError);
    throw new AdminServiceError('Unable to inspect the selected listing', 500);
  }

  if (!listing) {
    throw new AdminServiceError('Listing was not found', 404);
  }

  if (listing.brand === MODERATION_LISTING_BRAND) {
    throw new AdminServiceError('Moderation thread listings cannot be deleted from listing management', 403);
  }

  const sellerProfile = await getProfileById(listing.seller_id);

  if (sellerProfile.role === 'admin') {
    throw new AdminServiceError('Admin-owned listings cannot be deleted from listing management', 403);
  }

  const { data: conversations, error: conversationsError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('listing_id', input.listingId);

  if (conversationsError) {
    console.error('[Admin] Failed to inspect related conversations before listing deletion:', conversationsError);
    throw new AdminServiceError('Unable to inspect related conversation records', 500);
  }

  const conversationIds = ((conversations ?? []) as Array<{ id: string }>).map((conversation) => conversation.id);
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
    supabaseAdmin.from('favorites').select('listing_id', { count: 'exact', head: true }).eq('listing_id', input.listingId),
    supabaseAdmin.from('listing_images').select('id', { count: 'exact', head: true }).eq('listing_id', input.listingId),
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

  if (conversationIds.length > 0) {
    const { error: deleteMessagesError } = await supabaseAdmin
      .from('messages')
      .delete()
      .in('conversation_id', conversationIds);

    if (deleteMessagesError) {
      console.error('[Admin] Failed to delete listing messages:', deleteMessagesError);
      throw new AdminServiceError('Unable to remove related messages before deleting the listing', 500);
    }
  }

  const cleanupResults = await Promise.all([
    supabaseAdmin.from('favorites').delete().eq('listing_id', input.listingId),
    supabaseAdmin.from('listing_images').delete().eq('listing_id', input.listingId),
    supabaseAdmin.from('listing_daily_views').delete().eq('listing_id', input.listingId),
    supabaseAdmin.from('reports').delete().eq('listing_id', input.listingId),
    supabaseAdmin.from('reviews').delete().eq('listing_id', input.listingId),
    supabaseAdmin.from('offers').delete().eq('listing_id', input.listingId),
    supabaseAdmin.from('conversations').delete().eq('listing_id', input.listingId),
  ]);

  for (const cleanupResult of cleanupResults) {
    if (cleanupResult.error) {
      console.error('[Admin] Failed during admin listing cleanup:', cleanupResult.error);
      throw new AdminServiceError('Unable to clean up related records before deleting the listing', 500);
    }
  }

  const { error: deleteError } = await supabaseAdmin.from('listings').delete().eq('id', input.listingId);

  if (deleteError) {
    console.error('[Admin] Failed to delete listing from admin management:', deleteError);
    throw new AdminServiceError('Unable to delete the listing', 500);
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
