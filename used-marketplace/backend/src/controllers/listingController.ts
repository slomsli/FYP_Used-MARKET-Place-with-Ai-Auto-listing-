import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  FILTERABLE_LISTING_STATUSES,
  LISTING_SORT_OPTIONS,
  type CreateListingBody,
  type ListingFilterStatus,
  type ListingSortOption,
  type MarkListingSoldBody,
  type UploadListingImageBody,
} from '../types/listing';
import {
  createListing,
  deleteListing,
  getListingMetadata,
  getListingSaleBuyerCandidates,
  getSellerListingById,
  getMyListings,
  ListingServiceError,
  markListingAsActive,
  markListingAsSold,
  uploadListingImage,
  updateListing,
} from '../services/listingService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handleListingError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  if (error instanceof ListingServiceError) {
    sendError(res, error.message, error.status);
    return;
  }

  console.error(fallbackMessage, error);
  sendError(res, fallbackMessage, 500);
}

function parseOptionalPositiveInteger(
  value: unknown,
  label: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) <= 0) {
    throw new ListingServiceError(`${label} must be a positive integer`, 422);
  }

  return Number(value);
}

function parseListingStatus(value: unknown): ListingFilterStatus {
  if (value === undefined) {
    return 'all';
  }

  if (typeof value !== 'string' || !FILTERABLE_LISTING_STATUSES.includes(value as ListingFilterStatus)) {
    throw new ListingServiceError(
      `status must be one of: ${FILTERABLE_LISTING_STATUSES.join(', ')}`,
      422
    );
  }

  return value as ListingFilterStatus;
}

function parseListingSort(value: unknown): ListingSortOption {
  if (value === undefined) {
    return 'recent';
  }

  if (typeof value !== 'string' || !LISTING_SORT_OPTIONS.includes(value as ListingSortOption)) {
    throw new ListingServiceError(
      `sort must be one of: ${LISTING_SORT_OPTIONS.join(', ')}`,
      422
    );
  }

  return value as ListingSortOption;
}

function parseListingId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ListingServiceError('listingId is required', 422);
  }

  return value.trim();
}

export async function getListingFormMetadata(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const stateId = parseOptionalPositiveInteger(req.query.stateId, 'stateId');
    const metadata = await getListingMetadata(stateId);
    sendSuccess(res, metadata);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while fetching listing metadata');
  }
}

export async function createNewListing(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const listing = await createListing(req.user.id, req.body as CreateListingBody);
    sendSuccess(res, listing, 201);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while creating listing');
  }
}

export async function uploadSellerListingImage(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const uploadedImage = await uploadListingImage(req.user.id, req.body as UploadListingImageBody);
    sendSuccess(res, uploadedImage, 201);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while uploading listing image');
  }
}

export async function getSellerListing(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const listingId = parseListingId(req.params.listingId);
    const listing = await getSellerListingById(req.user.id, listingId);
    sendSuccess(res, listing);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while fetching listing');
  }
}

export async function updateSellerListing(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const listingId = parseListingId(req.params.listingId);
    const listing = await updateListing(req.user.id, listingId, req.body as CreateListingBody);
    sendSuccess(res, listing);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while updating listing');
  }
}

export async function markSellerListingSold(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const listingId = parseListingId(req.params.listingId);
    const buyerUserId =
      typeof (req.body as MarkListingSoldBody | undefined)?.buyerUserId === 'string'
        ? (req.body as MarkListingSoldBody).buyerUserId?.trim() || null
        : null;
    const listing = await markListingAsSold(req.user.id, listingId, buyerUserId);
    sendSuccess(res, listing);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while marking listing as sold');
  }
}

export async function getSellerListingSaleBuyerCandidates(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const listingId = parseListingId(req.params.listingId);
    const candidates = await getListingSaleBuyerCandidates(req.user.id, listingId);
    sendSuccess(res, candidates);
  } catch (error) {
    handleListingError(
      res,
      error,
      'Internal server error while fetching sale buyer candidates'
    );
  }
}

export async function markSellerListingActive(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const listingId = parseListingId(req.params.listingId);
    const listing = await markListingAsActive(req.user.id, listingId);
    sendSuccess(res, listing);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while marking listing as active');
  }
}

export async function deleteSellerListing(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const listingId = parseListingId(req.params.listingId);
    const result = await deleteListing(req.user.id, listingId);
    sendSuccess(res, result);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while deleting listing');
  }
}

export async function getSellerListings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const status = parseListingStatus(req.query.status);
    const sort = parseListingSort(req.query.sort);
    const listings = await getMyListings(req.user.id, { status, sort });
    sendSuccess(res, listings);
  } catch (error) {
    handleListingError(res, error, 'Internal server error while fetching seller listings');
  }
}
