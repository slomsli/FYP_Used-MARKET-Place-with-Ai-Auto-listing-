import type { ListingCondition } from '@/src/types/listing';
import type { ListingReportReason, ListingReportStatus } from '@/src/types/report';

export type AdminRole = 'user' | 'admin';
export type AdminUserStatus = 'active' | 'pending_verification' | 'suspended';
export type AdminListingStatusFilter =
  | 'all'
  | 'active'
  | 'draft'
  | 'reserved'
  | 'sold'
  | 'rejected'
  | 'archived'
  | 'reported';
export type AdminReportStatusFilter = 'all' | ListingReportStatus;

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
    role: 'all' | AdminRole;
    status: 'all' | AdminUserStatus;
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
    reason: ListingReportReason;
    reasonLabel: string;
    details: string | null;
    status: ListingReportStatus;
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
  reason: ListingReportReason;
  reasonLabel: string;
  details: string | null;
  reportType: 'listing' | 'delivery_issue';
  status: ListingReportStatus;
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

export interface AdminReportDetailResponse {
  report: AdminReportListItem;
}

export interface AdminReportStatusUpdateResponse {
  id: string;
  status: ListingReportStatus;
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
