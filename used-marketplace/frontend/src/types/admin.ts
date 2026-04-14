export type AdminRole = 'user' | 'admin';
export type AdminUserStatus = 'active' | 'pending_verification' | 'suspended';

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
