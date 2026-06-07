import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import type {
  MarkPurchasePaidInput,
  ReportPurchaseDeliveryIssueInput,
} from '../types/purchase';
import {
  confirmPurchaseReceiptPayment,
  getPurchaseReceiptDetailForUser,
  getPurchaseReceiptsForUser,
  markPurchaseReceiptReceived,
  markPurchaseReceiptPaid,
  PurchaseServiceError,
  reportPurchaseReceiptNotReceived,
} from '../services/purchaseService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handlePurchaseError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  if (error instanceof PurchaseServiceError) {
    sendError(res, error.message, error.status);
    return;
  }

  console.error(fallbackMessage, error);
  sendError(res, fallbackMessage, 500);
}

function parseReceiptId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PurchaseServiceError('receiptId is required', 422);
  }

  return value.trim();
}

export async function getPurchasesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const purchases = await getPurchaseReceiptsForUser(req.user.id);
    sendSuccess(res, purchases);
  } catch (error) {
    handlePurchaseError(res, error, 'Internal server error while fetching purchases');
  }
}

export async function getPurchaseReceiptDetailHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const receiptId = parseReceiptId(req.params.receiptId);
    const receipt = await getPurchaseReceiptDetailForUser(req.user.id, receiptId);
    sendSuccess(res, receipt);
  } catch (error) {
    handlePurchaseError(res, error, 'Internal server error while fetching purchase receipt');
  }
}

export async function markPurchaseReceiptPaidHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const receiptId = parseReceiptId(req.params.receiptId);
    const payload = req.body as MarkPurchasePaidInput;
    const receipt = await markPurchaseReceiptPaid(req.user.id, receiptId, payload);
    sendSuccess(res, receipt);
  } catch (error) {
    handlePurchaseError(res, error, 'Internal server error while updating purchase payment');
  }
}

export async function confirmPurchaseReceiptPaymentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const receiptId = parseReceiptId(req.params.receiptId);
    const receipt = await confirmPurchaseReceiptPayment(req.user.id, receiptId);
    sendSuccess(res, receipt);
  } catch (error) {
    handlePurchaseError(
      res,
      error,
      'Internal server error while confirming purchase payment'
    );
  }
}

export async function markPurchaseReceiptReceivedHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const receiptId = parseReceiptId(req.params.receiptId);
    const receipt = await markPurchaseReceiptReceived(req.user.id, receiptId);
    sendSuccess(res, receipt);
  } catch (error) {
    handlePurchaseError(
      res,
      error,
      'Internal server error while confirming purchase delivery'
    );
  }
}

export async function reportPurchaseReceiptNotReceivedHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const receiptId = parseReceiptId(req.params.receiptId);
    const { buyerStatement, paymentReference, proofs } =
      req.body as ReportPurchaseDeliveryIssueInput;

    if (!buyerStatement || typeof buyerStatement !== 'string') {
      sendError(res, 'buyerStatement is required', 422);
      return;
    }

    if (paymentReference !== undefined && typeof paymentReference !== 'string') {
      sendError(res, 'paymentReference must be a string when provided', 422);
      return;
    }

    if (proofs !== undefined && !Array.isArray(proofs)) {
      sendError(res, 'proofs must be an array when provided', 422);
      return;
    }

    const normalizedProofs = (proofs ?? []).map((proof) => ({
      fileName: typeof proof.fileName === 'string' ? proof.fileName : '',
      contentType: typeof proof.contentType === 'string' ? proof.contentType : '',
      base64Data: typeof proof.base64Data === 'string' ? proof.base64Data : '',
    }));

    const receipt = await reportPurchaseReceiptNotReceived(req.user.id, receiptId, {
      buyerStatement,
      paymentReference,
      proofs: normalizedProofs,
    });
    sendSuccess(res, receipt, 201);
  } catch (error) {
    handlePurchaseError(
      res,
      error,
      'Internal server error while reporting purchase delivery'
    );
  }
}
