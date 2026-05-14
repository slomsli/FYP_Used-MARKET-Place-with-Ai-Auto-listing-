export const LISTING_FILTER_STATUSES = [
  'all',
  'paused',
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

export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
export type CreateableListingStatus = 'draft' | 'active';
export type SellerListingSubmissionStatus = CreateableListingStatus | 'rejected';
export type ListingFilterStatus = (typeof LISTING_FILTER_STATUSES)[number];
export type ListingSortOption = (typeof LISTING_SORT_OPTIONS)[number];
export type PublicListingSortOption = (typeof PUBLIC_LISTING_SORT_OPTIONS)[number];

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
  features: {
    aiListingAutofillEnabled: boolean;
  };
}

export interface CreateListingPayload {
  title: string;
  categoryId: number | null;
  description?: string;
  brand?: string;
  condition: ListingCondition | null;
  price: number | null;
  currency?: string;
  negotiable?: boolean;
  autoNegotiationEnabled?: boolean;
  autoNegotiationFloorPrice?: number | null;
  status?: SellerListingSubmissionStatus;
  stateId?: number | null;
  areaId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  imageStoragePaths?: string[];
  coverImageStoragePath?: string | null;
  imagePaths?: string[];
  coverImagePath?: string | null;
}

export interface MarkListingSoldPayload {
  buyerUserId?: string | null;
}

export interface ListingImageUploadPayload {
  fileName: string;
  contentType: string;
  base64Data: string;
}

export interface UploadedListingImage {
  url: string;
  path: string;
  storagePath: string;
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
  latitude: number | null;
  longitude: number | null;
}

export interface ListingBuyerSummary {
  id: string;
  displayName: string;
  avatarPath: string | null;
}

export interface ListingSaleBuyerCandidate {
  id: string;
  displayName: string;
  avatarPath: string | null;
  contextLabel: string;
  lastActivityAt: string | null;
}

export interface ListingSummary {
  id: string;
  title: string;
  description: string | null;
  brand: string | null;
  price: number;
  currency: string;
  negotiable: boolean;
  autoNegotiationEnabled?: boolean;
  autoNegotiationFloorPrice?: number | null;
  status: string;
  statusLabel: string;
  condition: ListingCondition;
  conditionLabel: string;
  coverImageStoragePath: string | null;
  imageStoragePaths: string[];
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
  soldTo: ListingBuyerSummary | null;
  moderationReason: string | null;
  moderationReasonUpdatedAt: string | null;
}

export interface MyListingsResponse {
  filters: {
    status: ListingFilterStatus;
    sort: ListingSortOption;
  };
  statusCounts: {
    all: number;
    paused: number;
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

export interface GenerateListingImageInput {
  base64Data: string;
  contentType: string;
}

export interface GeneratedListingData {
  title: string;
  brand: string | null;
  suggestedCategoryName: string;
  matchedCategoryId: number | null;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  description: string;
  color: string | null;
  model: string | null;
  material: string | null;
}
