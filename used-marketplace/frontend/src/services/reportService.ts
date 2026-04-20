import type {
  CreateListingReportPayload,
  ListingReportSummary,
} from '@/src/types/report';

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

async function parseJsonResponse(response: Response): Promise<ApiResult | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function createListingReport(
  token: string,
  payload: CreateListingReportPayload
): Promise<ServiceResponse<ListingReportSummary>> {
  try {
    const response = await fetch(`${API_BASE}/api/listings/${payload.listingId}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reason: payload.reason,
        details: payload.details?.trim() || undefined,
      }),
    });

    const result = await parseJsonResponse(response);

    if (response.ok && result?.success) {
      return {
        data: (result.data ?? null) as ListingReportSummary | null,
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
