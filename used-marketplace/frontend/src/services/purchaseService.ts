import type {
  PurchaseReceiptDetailResponse,
  PurchasesDashboardResponse,
} from '@/src/types/purchase';

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

export async function getPurchases(
  token: string
): Promise<ServiceResponse<PurchasesDashboardResponse>> {
  return authorizedRequest<PurchasesDashboardResponse>(
    '/api/dashboard/purchases',
    token,
    { method: 'GET' }
  );
}

export async function getPurchaseReceipt(
  token: string,
  receiptId: string
): Promise<ServiceResponse<PurchaseReceiptDetailResponse>> {
  return authorizedRequest<PurchaseReceiptDetailResponse>(
    `/api/dashboard/purchases/${encodeURIComponent(receiptId)}`,
    token,
    { method: 'GET' }
  );
}

export async function markPurchaseReceiptPaid(
  token: string,
  receiptId: string,
  payload: {
    paymentMethod?: string;
    paymentReference?: string;
    buyerNote?: string;
  }
): Promise<ServiceResponse<PurchaseReceiptDetailResponse>> {
  return authorizedRequest<PurchaseReceiptDetailResponse>(
    `/api/dashboard/purchases/${encodeURIComponent(receiptId)}/mark-paid`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function confirmPurchaseReceiptPayment(
  token: string,
  receiptId: string
): Promise<ServiceResponse<PurchaseReceiptDetailResponse>> {
  return authorizedRequest<PurchaseReceiptDetailResponse>(
    `/api/dashboard/purchases/${encodeURIComponent(receiptId)}/confirm-payment`,
    token,
    { method: 'PATCH' }
  );
}

export async function markPurchaseReceiptReceived(
  token: string,
  receiptId: string
): Promise<ServiceResponse<PurchaseReceiptDetailResponse>> {
  return authorizedRequest<PurchaseReceiptDetailResponse>(
    `/api/dashboard/purchases/${encodeURIComponent(receiptId)}/mark-received`,
    token,
    { method: 'PATCH' }
  );
}

export async function reportPurchaseReceiptNotReceived(
  token: string,
  receiptId: string,
  payload: {
    buyerStatement: string;
    paymentReference?: string;
    proofs?: Array<{
      fileName: string;
      contentType: string;
      base64Data: string;
    }>;
  }
): Promise<ServiceResponse<PurchaseReceiptDetailResponse>> {
  return authorizedRequest<PurchaseReceiptDetailResponse>(
    `/api/dashboard/purchases/${encodeURIComponent(receiptId)}/not-received`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}
