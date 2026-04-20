import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  getReceivedOffers,
  getSentOffers,
  createOffer,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  createCounterOffer,
  OfferServiceError,
  type OfferKind,
} from '../services/offerService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handleOfferError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  if (error instanceof OfferServiceError) {
    sendError(res, error.message, error.status);
    return;
  }

  console.error(fallbackMessage, error);
  sendError(res, fallbackMessage, 500);
}

const VALID_OFFER_KINDS: OfferKind[] = ['purchase_request', 'offer', 'counter_offer'];

/**
 * GET /api/dashboard/offers/received
 */
export async function getReceivedOffersHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await getReceivedOffers(req.user.id);
    sendSuccess(res, data);
  } catch (error) {
    handleOfferError(res, error, 'Internal server error while fetching received offers');
  }
}

/**
 * GET /api/dashboard/offers/sent
 */
export async function getSentOffersHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await getSentOffers(req.user.id);
    sendSuccess(res, data);
  } catch (error) {
    handleOfferError(res, error, 'Internal server error while fetching sent offers');
  }
}

/**
 * POST /api/dashboard/offers
 * Body: { listingId, offerPrice, message?, offerKind }
 */
export async function createOfferHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { listingId, offerPrice, message, offerKind } = req.body as {
      listingId?: string;
      offerPrice?: number;
      message?: string;
      offerKind?: OfferKind;
    };

    if (!listingId || typeof listingId !== 'string' || !listingId.trim()) {
      sendError(res, 'listingId is required', 422);
      return;
    }

    if (offerPrice === undefined || typeof offerPrice !== 'number' || offerPrice < 0) {
      sendError(res, 'offerPrice must be a non-negative number', 422);
      return;
    }

    const kind = offerKind || 'offer';
    if (!VALID_OFFER_KINDS.includes(kind)) {
      sendError(res, `offerKind must be one of: ${VALID_OFFER_KINDS.join(', ')}`, 422);
      return;
    }

    const result = await createOffer(req.user.id, {
      listingId: listingId.trim(),
      offerPrice,
      message,
      offerKind: kind,
    });

    sendSuccess(res, result, 201);
  } catch (error) {
    handleOfferError(res, error, 'Internal server error while creating offer');
  }
}

/**
 * PATCH /api/dashboard/offers/:offerId/accept
 */
export async function acceptOfferHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { offerId } = req.params;

    if (!offerId?.trim()) {
      sendError(res, 'offerId is required', 422);
      return;
    }

    const result = await acceptOffer(req.user.id, offerId.trim());
    sendSuccess(res, result);
  } catch (error) {
    handleOfferError(res, error, 'Internal server error while accepting offer');
  }
}

/**
 * PATCH /api/dashboard/offers/:offerId/reject
 */
export async function rejectOfferHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { offerId } = req.params;

    if (!offerId?.trim()) {
      sendError(res, 'offerId is required', 422);
      return;
    }

    const result = await rejectOffer(req.user.id, offerId.trim());
    sendSuccess(res, result);
  } catch (error) {
    handleOfferError(res, error, 'Internal server error while rejecting offer');
  }
}

/**
 * PATCH /api/dashboard/offers/:offerId/cancel
 */
export async function cancelOfferHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { offerId } = req.params;

    if (!offerId?.trim()) {
      sendError(res, 'offerId is required', 422);
      return;
    }

    const result = await cancelOffer(req.user.id, offerId.trim());
    sendSuccess(res, result);
  } catch (error) {
    handleOfferError(res, error, 'Internal server error while cancelling offer');
  }
}

/**
 * POST /api/dashboard/offers/:offerId/counter
 * Body: { counterPrice, message? }
 */
export async function counterOfferHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const { offerId } = req.params;
    const { counterPrice, message } = req.body as {
      counterPrice?: number;
      message?: string;
    };

    if (!offerId?.trim()) {
      sendError(res, 'offerId is required', 422);
      return;
    }

    if (counterPrice === undefined || typeof counterPrice !== 'number' || counterPrice < 0) {
      sendError(res, 'counterPrice must be a non-negative number', 422);
      return;
    }

    const result = await createCounterOffer(req.user.id, {
      offerId: offerId.trim(),
      counterPrice,
      message,
    });

    sendSuccess(res, result, 201);
  } catch (error) {
    handleOfferError(res, error, 'Internal server error while creating counter offer');
  }
}
