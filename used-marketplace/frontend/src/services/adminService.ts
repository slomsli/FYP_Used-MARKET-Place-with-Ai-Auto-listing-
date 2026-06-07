import type {
  AdminDeleteListingResponse,
  AdminReportDetailResponse,
  AdminListingDetailResponse,
  AdminListingStatusUpdateResponse,
  AdminListingsResponse,
  AdminReportStatusFilter,
  AdminReportStatusUpdateResponse,
  AdminReportsResponse,
  AdminListingStatusFilter,
  AdminOverviewResponse,
  AdminModerationThreadResponse,
  AdminStructureResponse,
  AdminUserDetailResponse,
  AdminUserListItem,
  AdminUsersResponse,
} from '@/src/types/admin';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

interface ApiResult {
  success?: boolean;
  data?: unknown;
  error?: string;
}

export interface AdminUsersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: 'all' | 'user' | 'admin';
  status?: 'all' | 'active' | 'pending_verification' | 'suspended';
}

export interface AdminListingsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminListingStatusFilter;
  categoryId?: number | null;
  stateId?: number | null;
}

export interface AdminReportsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminReportStatusFilter;
}

export interface CreateAdminUserPayload {
  fullName: string;
  username: string;
  email: string;
  password: string;
  stateId?: number | null;
  areaId?: number | null;
}

export interface CreateCategoryPayload {
  name: string;
  parentId?: number | null;
}

export interface CreateLocationPayload {
  stateName: string;
  areaNames?: string[];
}

export async function getAdminOverview(
  token: string,
  year?: number
): Promise<ServiceResponse<AdminOverviewResponse>> {
  const params = new URLSearchParams();

  if (Number.isInteger(year)) {
    params.set('year', String(year));
  }

  const suffix = params.size ? `?${params.toString()}` : '';

  return authorizedRequest<AdminOverviewResponse>(`/api/admin/overview${suffix}`, token, {
    method: 'GET',
  });
}

async function parseJsonResponse(response: Response): Promise<ApiResult | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
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

export async function getAdminUsers(
  token: string,
  query: AdminUsersQuery = {}
): Promise<ServiceResponse<AdminUsersResponse>> {
  const params = new URLSearchParams();

  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.role && query.role !== 'all') params.set('role', query.role);
  if (query.status && query.status !== 'all') params.set('status', query.status);

  const suffix = params.size ? `?${params.toString()}` : '';
  return authorizedRequest<AdminUsersResponse>(`/api/admin/users${suffix}`, token, {
    method: 'GET',
  });
}

export async function getAdminListings(
  token: string,
  query: AdminListingsQuery = {}
): Promise<ServiceResponse<AdminListingsResponse>> {
  const params = new URLSearchParams();

  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.categoryId) params.set('categoryId', String(query.categoryId));
  if (query.stateId) params.set('stateId', String(query.stateId));

  const suffix = params.size ? `?${params.toString()}` : '';
  return authorizedRequest<AdminListingsResponse>(`/api/admin/listings${suffix}`, token, {
    method: 'GET',
  });
}

export async function getAdminListingDetails(
  token: string,
  listingId: string
): Promise<ServiceResponse<AdminListingDetailResponse>> {
  return authorizedRequest<AdminListingDetailResponse>(`/api/admin/listings/${listingId}`, token, {
    method: 'GET',
  });
}

export async function getAdminReports(
  token: string,
  query: AdminReportsQuery = {}
): Promise<ServiceResponse<AdminReportsResponse>> {
  const params = new URLSearchParams();

  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.status && query.status !== 'all') params.set('status', query.status);

  const suffix = params.size ? `?${params.toString()}` : '';
  return authorizedRequest<AdminReportsResponse>(`/api/admin/reports${suffix}`, token, {
    method: 'GET',
  });
}

export async function getAdminReportDetails(
  token: string,
  reportId: string
): Promise<ServiceResponse<AdminReportDetailResponse>> {
  return authorizedRequest<AdminReportDetailResponse>(`/api/admin/reports/${reportId}`, token, {
    method: 'GET',
  });
}

export async function createAdminUser(
  token: string,
  payload: CreateAdminUserPayload
): Promise<ServiceResponse<AdminUserListItem>> {
  return authorizedRequest<AdminUserListItem>('/api/admin/users', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAdminUserDetails(
  token: string,
  userId: string
): Promise<ServiceResponse<AdminUserDetailResponse>> {
  return authorizedRequest<AdminUserDetailResponse>(`/api/admin/users/${userId}`, token, {
    method: 'GET',
  });
}

export async function updateAdminUserStatus(
  token: string,
  userId: string,
  action: 'suspend' | 'activate'
): Promise<ServiceResponse<AdminUserListItem>> {
  return authorizedRequest<AdminUserListItem>(`/api/admin/users/${userId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
}

export async function ensureAdminModerationThread(
  token: string,
  userId: string,
  payload: { topic?: string } = {}
): Promise<ServiceResponse<AdminModerationThreadResponse>> {
  return authorizedRequest<AdminModerationThreadResponse>(`/api/admin/users/${userId}/moderation-thread`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminListing(
  token: string,
  listingId: string,
  reason: string
): Promise<ServiceResponse<AdminDeleteListingResponse>> {
  return authorizedRequest<AdminDeleteListingResponse>(`/api/admin/listings/${listingId}`, token, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

export async function updateAdminListingStatus(
  token: string,
  listingId: string,
  action: 'pause' | 'resume' | 'approve' | 'reject',
  reason?: string
): Promise<ServiceResponse<AdminListingStatusUpdateResponse>> {
  return authorizedRequest<AdminListingStatusUpdateResponse>(`/api/admin/listings/${listingId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ action, reason }),
  });
}

export async function updateAdminReportStatus(
  token: string,
  reportId: string,
  action: 'review' | 'resolve' | 'dismiss'
): Promise<ServiceResponse<AdminReportStatusUpdateResponse>> {
  return authorizedRequest<AdminReportStatusUpdateResponse>(`/api/admin/reports/${reportId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
}

export async function getAdminStructure(
  token: string,
  search?: string
): Promise<ServiceResponse<AdminStructureResponse>> {
  const params = new URLSearchParams();

  if (search?.trim()) {
    params.set('search', search.trim());
  }

  const suffix = params.size ? `?${params.toString()}` : '';
  return authorizedRequest<AdminStructureResponse>(`/api/admin/structure${suffix}`, token, {
    method: 'GET',
  });
}

export async function createCategory(
  token: string,
  payload: CreateCategoryPayload
): Promise<ServiceResponse<{ id: number; name: string; slug: string; parentId: number | null }>> {
  return authorizedRequest('/api/admin/structure/categories', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createLocation(
  token: string,
  payload: CreateLocationPayload
): Promise<ServiceResponse<{ state: { id: number; name: string; slug: string }; areas: Array<{ id: number; name: string; slug: string }> }>> {
  return authorizedRequest('/api/admin/structure/locations', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
