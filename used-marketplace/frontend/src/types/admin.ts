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
