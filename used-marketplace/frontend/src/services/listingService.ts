import type {
  CreateListingPayload,
  DeleteListingResult,
  ListingImageUploadPayload,
  ListingCondition,
  ListingMetadata,
  ListingLookupOption,
  ListingAreaOption,
  ListingViewResult,
  ListingFilterStatus,
  ListingSortOption,
  ListingSummary,
  MyListingsResponse,
  PublicListingDetailResponse,
  PublicListingsResponse,
  PublicListingSortOption,
  UploadedListingImage,
} from '@/src/types/listing';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

interface ListingMetadataPayload {
  categories?: unknown;
  categoryOptions?: unknown;
  states?: unknown;
  stateOptions?: unknown;
  areas?: unknown;
  areaOptions?: unknown;
  conditions?: unknown;
  statuses?: unknown;
  currencies?: unknown;
  lookups?: {
    categories?: unknown;
    states?: unknown;
    areas?: unknown;
  };
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function publicRequest<T>(
  path: string,
  init?: RequestInit
): Promise<ServiceResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    const result = await parseJsonResponse(response);

    if (response.ok && result?.success) {
      return {
        data: (result.data ?? null) as T | null,
        error: null,
      };
    }

    return {
      data: null,
      error: result?.error || `Request failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function normalizeSlug(value: unknown, name: string, id: number): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  const derivedSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return derivedSlug || `option-${id}`;
}

function normalizeLookupOptions(value: unknown): ListingLookupOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const typedItem = item as Record<string, unknown>;
      const id = toPositiveInteger(typedItem.id);
      const name = typeof typedItem.name === 'string' ? typedItem.name.trim() : '';

      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        slug: normalizeSlug(typedItem.slug, name, id),
      };
    })
    .filter((item): item is ListingLookupOption => item !== null);
}

function normalizeAreaOptions(value: unknown): ListingAreaOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const typedItem = item as Record<string, unknown>;
      const id = toPositiveInteger(typedItem.id);
      const name = typeof typedItem.name === 'string' ? typedItem.name.trim() : '';
      const stateId = toPositiveInteger(typedItem.stateId ?? typedItem.state_id);

      if (!id || !name || !stateId) {
        return null;
      }

      return {
        id,
        name,
        slug: normalizeSlug(typedItem.slug, name, id),
        stateId,
      };
    })
    .filter((item): item is ListingAreaOption => item !== null);
}

function normalizeConditions(value: unknown): ListingMetadata['conditions'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedConditions: ListingCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const typedItem = item as Record<string, unknown>;
      const optionValue = typedItem.value;
      const label = typeof typedItem.label === 'string' ? typedItem.label.trim() : '';

      if (!allowedConditions.includes(optionValue as ListingCondition) || !label) {
        return null;
      }

      return {
        value: optionValue as ListingCondition,
        label,
      };
    })
    .filter((item): item is ListingMetadata['conditions'][number] => item !== null);
}

function normalizeStatuses(value: unknown): ListingMetadata['statuses'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const typedItem = item as Record<string, unknown>;
      const optionValue = typedItem.value;
      const label = typeof typedItem.label === 'string' ? typedItem.label.trim() : '';

      if ((optionValue !== 'draft' && optionValue !== 'active') || !label) {
        return null;
      }

      return {
        value: optionValue,
        label,
      };
    })
    .filter((item): item is ListingMetadata['statuses'][number] => item !== null);
}

function normalizeCurrencies(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ['MYR'];
  }

  const currencies = value
    .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
    .filter((item) => /^[A-Z]{3}$/.test(item));

  return currencies.length > 0 ? currencies : ['MYR'];
}

function normalizeListingMetadata(raw: unknown): ListingMetadata {
  const payload = (raw && typeof raw === 'object' ? raw : {}) as ListingMetadataPayload;
  const rawCategories = payload.categories ?? payload.categoryOptions ?? payload.lookups?.categories;
  const rawStates = payload.states ?? payload.stateOptions ?? payload.lookups?.states;
  const rawAreas = payload.areas ?? payload.areaOptions ?? payload.lookups?.areas;

  const categories = normalizeLookupOptions(rawCategories).map((category, index) => {
    const rawItem =
      Array.isArray(rawCategories) && rawCategories[index] && typeof rawCategories[index] === 'object'
        ? (rawCategories[index] as Record<string, unknown>)
        : null;

    return {
      ...category,
      parentId: toPositiveInteger(rawItem?.parentId ?? rawItem?.parent_id) ?? null,
    };
  });

  return {
    categories,
    states: normalizeLookupOptions(rawStates),
    areas: normalizeAreaOptions(rawAreas),
    conditions: normalizeConditions(payload.conditions),
    statuses: normalizeStatuses(payload.statuses),
    currencies: normalizeCurrencies(payload.currencies),
  };
}

function isNotFoundError(error: string | null) {
  return Boolean(error && /status 404\b/i.test(error));
}

async function authorizedRequest<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<ServiceResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });

    const result = await parseJsonResponse(response);

    if (response.ok && result?.success) {
      return {
        data: (result.data ?? null) as T | null,
        error: null,
      };
    }

    return {
      data: null,
      error: result?.error || `Request failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function getListingMetadata(
  token: string,
  stateId?: number
): Promise<ServiceResponse<ListingMetadata>> {
  const query = stateId ? `?stateId=${stateId}` : '';

  try {
    const response = await fetch(`${API_BASE}/api/dashboard/listings/metadata${query}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await parseJsonResponse(response);

    if (response.ok && result?.success) {
      return {
        data: normalizeListingMetadata(result.data),
        error: null,
      };
    }

    return {
      data: null,
      error: result?.error || `Request failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function createListing(
  token: string,
  payload: CreateListingPayload
): Promise<ServiceResponse<ListingSummary>> {
  return authorizedRequest<ListingSummary>('/api/dashboard/listings', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadListingImage(
  token: string,
  payload: ListingImageUploadPayload
): Promise<ServiceResponse<UploadedListingImage>> {
  return authorizedRequest<UploadedListingImage>('/api/dashboard/listings/uploads', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getSellerListing(
  token: string,
  listingId: string
): Promise<ServiceResponse<ListingSummary>> {
  return authorizedRequest<ListingSummary>(`/api/dashboard/listings/${listingId}`, token, {
    method: 'GET',
  });
}

export async function updateListing(
  token: string,
  listingId: string,
  payload: CreateListingPayload
): Promise<ServiceResponse<ListingSummary>> {
  return authorizedRequest<ListingSummary>(`/api/dashboard/listings/${listingId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function markListingAsSold(
  token: string,
  listingId: string
): Promise<ServiceResponse<ListingSummary>> {
  return authorizedRequest<ListingSummary>(
    `/api/dashboard/listings/${listingId}/mark-sold`,
    token,
    {
      method: 'PATCH',
    }
  );
}

export async function markListingAsActive(
  token: string,
  listingId: string
): Promise<ServiceResponse<ListingSummary>> {
  const primaryResponse = await authorizedRequest<ListingSummary>(
    `/api/dashboard/listings/${listingId}/mark-active`,
    token,
    {
      method: 'PATCH',
    }
  );

  if (!isNotFoundError(primaryResponse.error)) {
    return primaryResponse;
  }

  return authorizedRequest<ListingSummary>(
    `/api/dashboard/listings/${listingId}/activate`,
    token,
    {
      method: 'PATCH',
    }
  );
}

export async function deleteListing(
  token: string,
  listingId: string
): Promise<ServiceResponse<DeleteListingResult>> {
  return authorizedRequest<DeleteListingResult>(`/api/dashboard/listings/${listingId}`, token, {
    method: 'DELETE',
  });
}

export async function getMyListings(
  token: string,
  options: {
    status: ListingFilterStatus;
    sort: ListingSortOption;
  }
): Promise<ServiceResponse<MyListingsResponse>> {
  const query = new URLSearchParams({
    status: options.status,
    sort: options.sort,
  });

  return authorizedRequest<MyListingsResponse>(
    `/api/dashboard/listings?${query.toString()}`,
    token,
    {
      method: 'GET',
    }
  );
}

export async function getPublicListings(options: {
  q?: string;
  categoryIds?: number[];
  conditions?: ListingCondition[];
  stateId?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: PublicListingSortOption;
  limit?: number;
  offset?: number;
}): Promise<ServiceResponse<PublicListingsResponse>> {
  const query = new URLSearchParams();

  if (options.q?.trim()) {
    query.set('q', options.q.trim());
  }

  if (options.categoryIds && options.categoryIds.length > 0) {
    query.set('categoryIds', options.categoryIds.join(','));
  }

  if (options.conditions && options.conditions.length > 0) {
    query.set('conditions', options.conditions.join(','));
  }

  if (options.stateId) {
    query.set('stateId', String(options.stateId));
  }

  if (options.minPrice !== undefined) {
    query.set('minPrice', String(options.minPrice));
  }

  if (options.maxPrice !== undefined) {
    query.set('maxPrice', String(options.maxPrice));
  }

  if (options.sort) {
    query.set('sort', options.sort);
  }

  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }

  if (options.offset !== undefined) {
    query.set('offset', String(options.offset));
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return publicRequest<PublicListingsResponse>(`/api/listings${suffix}`, {
    method: 'GET',
  });
}

export async function getPublicListingById(
  listingId: string
): Promise<ServiceResponse<PublicListingDetailResponse>> {
  return publicRequest<PublicListingDetailResponse>(`/api/listings/${listingId}`, {
    method: 'GET',
  });
}

export async function recordPublicListingView(
  listingId: string
): Promise<ServiceResponse<ListingViewResult>> {
  return publicRequest<ListingViewResult>(`/api/listings/${listingId}/views`, {
    method: 'POST',
  });
}
