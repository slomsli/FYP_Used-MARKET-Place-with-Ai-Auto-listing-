import type {
  AdminVerificationRequestDetail,
  AdminVerificationRequestsResponse,
  IdentityDocumentType,
  IdentityRequestStatus,
  UserVerificationResponse,
} from '@/src/types/verification';

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

export interface ApplyIdentityVerificationPayload {
  documentType: IdentityDocumentType;
  documentCountry?: string;
  documentNumberLast4?: string;
  userNotes?: string;
  consent: boolean;
  selfie: File;
  documentFront: File;
}

async function parseJsonResponse(response: Response): Promise<ApiResult | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function authorizedJsonRequest<T>(
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

async function authorizedFormRequest<T>(
  path: string,
  token: string,
  formData: FormData
): Promise<ServiceResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
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

export async function getMyVerification(
  token: string
): Promise<ServiceResponse<UserVerificationResponse>> {
  return authorizedJsonRequest<UserVerificationResponse>('/api/verification/me', token, {
    method: 'GET',
  });
}

export async function applyIdentityVerification(
  token: string,
  payload: ApplyIdentityVerificationPayload
): Promise<ServiceResponse<UserVerificationResponse>> {
  const formData = new FormData();
  formData.append('documentType', payload.documentType);
  if (payload.documentCountry?.trim()) {
    formData.append('documentCountry', payload.documentCountry.trim());
  }
  if (payload.documentNumberLast4?.trim()) {
    formData.append('documentNumberLast4', payload.documentNumberLast4.trim());
  }
  if (payload.userNotes?.trim()) {
    formData.append('userNotes', payload.userNotes.trim());
  }
  formData.append('consent', String(payload.consent));
  formData.append('selfie', payload.selfie, payload.selfie.name);
  formData.append('documentFront', payload.documentFront, payload.documentFront.name);

  return authorizedFormRequest<UserVerificationResponse>('/api/verification/apply', token, formData);
}

export async function getAdminVerificationRequests(
  token: string,
  status: IdentityRequestStatus | 'all' = 'pending'
): Promise<ServiceResponse<AdminVerificationRequestsResponse>> {
  const params = new URLSearchParams();
  params.set('status', status);

  return authorizedJsonRequest<AdminVerificationRequestsResponse>(
    `/api/admin/verification/requests?${params.toString()}`,
    token,
    { method: 'GET' }
  );
}

export async function getAdminVerificationRequestDetail(
  token: string,
  requestId: string
): Promise<ServiceResponse<AdminVerificationRequestDetail>> {
  return authorizedJsonRequest<AdminVerificationRequestDetail>(
    `/api/admin/verification/requests/${requestId}`,
    token,
    { method: 'GET' }
  );
}

export async function approveAdminVerificationRequest(
  token: string,
  requestId: string,
  adminNotes?: string
): Promise<ServiceResponse<AdminVerificationRequestDetail>> {
  return authorizedJsonRequest<AdminVerificationRequestDetail>(
    `/api/admin/verification/requests/${requestId}/approve`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ adminNotes }),
    }
  );
}

export async function rejectAdminVerificationRequest(
  token: string,
  requestId: string,
  payload: { rejectionReason: string; adminNotes?: string }
): Promise<ServiceResponse<AdminVerificationRequestDetail>> {
  return authorizedJsonRequest<AdminVerificationRequestDetail>(
    `/api/admin/verification/requests/${requestId}/reject`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function requestAdminVerificationResubmission(
  token: string,
  requestId: string,
  payload: { rejectionReason: string; adminNotes?: string }
): Promise<ServiceResponse<AdminVerificationRequestDetail>> {
  return authorizedJsonRequest<AdminVerificationRequestDetail>(
    `/api/admin/verification/requests/${requestId}/resubmission`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}
