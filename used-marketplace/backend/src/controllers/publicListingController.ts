import type { Request, Response } from 'express';
import {
  LISTING_CONDITIONS,
  PUBLIC_LISTING_SORT_OPTIONS,
  type ListingCondition,
  type PublicListingSortOption,
} from '../types/listing';
import {
  getPublicListingById,
  getPublicListings,
  incrementPublicListingView,
  ListingServiceError,
} from '../services/listingService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handlePublicListingError(
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

function parseListingId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ListingServiceError('listingId is required', 422);
  }

  return value.trim();
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function parsePositiveIntegerList(value: unknown, label: string): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ListingServiceError(`${label} must be a comma-separated string of positive integers`, 422);
  }

  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  const parsedValues = parts.map((item) => Number(item));
  if (parsedValues.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw new ListingServiceError(`${label} must contain only positive integers`, 422);
  }

  return Array.from(new Set(parsedValues));
}

function parseConditionList(value: unknown): ListingCondition[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ListingServiceError('conditions must be a comma-separated string', 422);
  }

  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  if (parts.some((item) => !LISTING_CONDITIONS.includes(item as ListingCondition))) {
    throw new ListingServiceError(
      `conditions must be within: ${LISTING_CONDITIONS.join(', ')}`,
      422
    );
  }

  return Array.from(new Set(parts as ListingCondition[]));
}

function parseOptionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) <= 0) {
    throw new ListingServiceError(`${label} must be a positive integer`, 422);
  }

  return Number(value);
}

function parseOptionalNonNegativeNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new ListingServiceError(`${label} must be a non-negative number`, 422);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ListingServiceError(`${label} must be a non-negative number`, 422);
  }

  return parsed;
}

function parsePublicSort(value: unknown): PublicListingSortOption {
  if (value === undefined) {
    return 'newest';
  }

  if (
    typeof value !== 'string' ||
    !PUBLIC_LISTING_SORT_OPTIONS.includes(value as PublicListingSortOption)
  ) {
    throw new ListingServiceError(
      `sort must be one of: ${PUBLIC_LISTING_SORT_OPTIONS.join(', ')}`,
      422
    );
  }

  return value as PublicListingSortOption;
}

function parseLimit(value: unknown): number {
  if (value === undefined) {
    return 6;
  }

  const parsed = parseOptionalPositiveInteger(value, 'limit');
  if (!parsed) {
    return 6;
  }

  return Math.min(parsed, 48);
}

function parseOffset(value: unknown): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ListingServiceError('offset must be a non-negative integer', 422);
  }

  return Number(value);
}

export async function browsePublicListings(req: Request, res: Response): Promise<void> {
  try {
    const minPrice = parseOptionalNonNegativeNumber(req.query.minPrice, 'minPrice');
    const maxPrice = parseOptionalNonNegativeNumber(req.query.maxPrice, 'maxPrice');

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new ListingServiceError('minPrice cannot be greater than maxPrice', 422);
    }

    const response = await getPublicListings({
      q: parseString(req.query.q),
      categoryIds: parsePositiveIntegerList(req.query.categoryIds, 'categoryIds'),
      conditions: parseConditionList(req.query.conditions),
      stateId: parseOptionalPositiveInteger(req.query.stateId, 'stateId'),
      minPrice,
      maxPrice,
      sort: parsePublicSort(req.query.sort),
      limit: parseLimit(req.query.limit),
      offset: parseOffset(req.query.offset),
    });

    sendSuccess(res, response);
  } catch (error) {
    handlePublicListingError(res, error, 'Internal server error while fetching public listings');
  }
}

export async function getPublicListing(req: Request, res: Response): Promise<void> {
  try {
    const listingId = parseListingId(req.params.listingId);
    const response = await getPublicListingById(listingId);
    sendSuccess(res, response);
  } catch (error) {
    handlePublicListingError(res, error, 'Internal server error while fetching listing detail');
  }
}

export async function recordPublicListingView(req: Request, res: Response): Promise<void> {
  try {
    const listingId = parseListingId(req.params.listingId);
    const response = await incrementPublicListingView(listingId);
    sendSuccess(res, response);
  } catch (error) {
    handlePublicListingError(res, error, 'Internal server error while recording listing view');
  }
}
