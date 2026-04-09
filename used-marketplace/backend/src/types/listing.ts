export const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export const CREATEABLE_LISTING_STATUSES = ['draft', 'active'] as const;
export const FILTERABLE_LISTING_STATUSES = [
  'all',
  'draft',
  'active',
  'reserved',
  'sold',
  'rejected',
  'archived',
] as const;
export const LISTING_SORT_OPTIONS = [
  'recent',
  'oldest',
  'price_asc',
  'price_desc',
  'views_desc',
] as const;
export const PUBLIC_LISTING_SORT_OPTIONS = [
  'newest',
  'price_asc',
  'price_desc',
  'popular',
] as const;

export type ListingCondition = (typeof LISTING_CONDITIONS)[number];
export type CreateableListingStatus = (typeof CREATEABLE_LISTING_STATUSES)[number];
export type ListingFilterStatus = (typeof FILTERABLE_LISTING_STATUSES)[number];
export type ListingSortOption = (typeof LISTING_SORT_OPTIONS)[number];
export type PublicListingSortOption = (typeof PUBLIC_LISTING_SORT_OPTIONS)[number];

export interface CreateListingBody {
  title: string;
  categoryId: number | string;
  description?: string;
  brand?: string;
  condition: ListingCondition;
  price: number | string;
  currency?: string;
  negotiable?: boolean;
  status?: CreateableListingStatus;
  stateId?: number | string | null;
  areaId?: number | string | null;
  imagePaths?: string[];
  coverImagePath?: string | null;
}

export interface UploadListingImageBody {
  fileName: string;
  contentType: string;
  base64Data: string;
}

export interface UploadedListingImage {
  url: string;
  path: string;
}

export interface ListingLookupOption {
  id: number;
  name: string;
  slug: string;
}

export interface ListingAreaOption extends ListingLookupOption {
  stateId: number;
}

export interface ListingMetadata {
  categories: Array<ListingLookupOption & { parentId: number | null }>;
  states: ListingLookupOption[];
  areas: ListingAreaOption[];
  conditions: Array<{ value: ListingCondition; label: string }>;
  statuses: Array<{ value: CreateableListingStatus; label: string }>;
  currencies: string[];
}

export interface ListingCategorySummary {
  id: number;
  name: string;
  slug: string;
}

export interface ListingLocationSummary {
  stateId: number | null;
  stateName: string | null;
  areaId: number | null;
  areaName: string | null;
}

export interface ListingSummary {
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
  favoritesCount: number;
  totalOffersCount: number;
  pendingOffersCount: number;
  category: ListingCategorySummary | null;
  location: ListingLocationSummary;
}

export interface MyListingsResponse {
  filters: {
    status: ListingFilterStatus;
    sort: ListingSortOption;
  };
  statusCounts: {
    all: number;
    draft: number;
    active: number;
    reserved: number;
    sold: number;
    rejected: number;
    archived: number;
  };
  sellerStats: {
    totalSalesAmount: number;
    soldItems: number;
    activeItems: number;
    averageRating: number | null;
    totalReviews: number;
  };
  listings: ListingSummary[];
}

export interface DeleteListingResult {
  id: string;
  deleted: true;
}

export interface PublicCategoryFilterOption extends ListingLookupOption {
  count: number;
}

export interface PublicStateFilterOption extends ListingLookupOption {
  count: number;
}

export interface PublicConditionFilterOption {
  value: ListingCondition;
  label: string;
  count: number;
}

export interface PublicSellerPreview {
  id: string;
  displayName: string;
  avatarPath: string | null;
}

export interface PublicListingSummary extends ListingSummary {
  locationLabel: string;
  seller: PublicSellerPreview;
}

export interface PublicListingsQuery {
  q?: string;
  categoryIds?: number[];
  conditions?: ListingCondition[];
  stateId?: number;
  minPrice?: number;
  maxPrice?: number;
  sort: PublicListingSortOption;
  limit: number;
  offset: number;
}

export interface PublicListingsResponse {
  filters: {
    q: string;
    categoryIds: number[];
    conditions: ListingCondition[];
    stateId: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    sort: PublicListingSortOption;
    limit: number;
    offset: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  summary: {
    resultCount: number;
    priceRange: {
      min: number;
      max: number;
    };
  };
  lookups: {
    categories: PublicCategoryFilterOption[];
    states: PublicStateFilterOption[];
    conditions: PublicConditionFilterOption[];
  };
  listings: PublicListingSummary[];
}

export interface PublicSellerSummary {
  id: string;
  displayName: string;
  username: string;
  avatarPath: string | null;
  memberSince: string;
  averageRating: number | null;
  totalReviews: number;
  totalSales: number;
  activeListings: number;
  location: ListingLocationSummary;
}

export interface PublicListingDetailResponse {
  listing: PublicListingSummary;
  seller: PublicSellerSummary;
  related: PublicListingSummary[];
}

export interface ListingViewResult {
  id: string;
  viewsCount: number;
}
