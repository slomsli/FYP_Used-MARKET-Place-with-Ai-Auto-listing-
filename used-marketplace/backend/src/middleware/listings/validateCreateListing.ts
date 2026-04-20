import type { Request, Response, NextFunction } from 'express';
import {
  CREATEABLE_LISTING_STATUSES,
  LISTING_CONDITIONS,
  type CreateListingBody,
} from '../../types/listing';
import { sendError } from '../../utils/apiResponse';

function isPositiveIntegerLike(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0;
  }

  if (typeof value === 'string' && value.trim()) {
    return /^\d+$/.test(value.trim()) && Number(value) > 0;
  }

  return false;
}

function isNonNegativeNumberLike(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
  }

  return false;
}

export function validateCreateListing(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Partial<CreateListingBody>;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendError(res, 'Request body must be a valid JSON object', 422);
    return;
  }

  if (!body.title?.trim()) {
    sendError(res, 'Listing title is required', 422);
    return;
  }

  if (body.title.trim().length > 120) {
    sendError(res, 'Listing title must be 120 characters or fewer', 422);
    return;
  }

  const isDraft = body.status === 'draft';

  if (!isDraft && !isPositiveIntegerLike(body.categoryId)) {
    sendError(res, 'A valid categoryId is required', 422);
    return;
  }

  if (!isDraft && (!body.condition || !(LISTING_CONDITIONS as readonly string[]).includes(body.condition))) {
    sendError(res, 'Condition must be one of: new, like_new, good, fair, poor', 422);
    return;
  }

  if (!isDraft && !isNonNegativeNumberLike(body.price)) {
    sendError(res, 'Price must be a valid non-negative number', 422);
    return;
  }

  if (body.description !== undefined && typeof body.description !== 'string') {
    sendError(res, 'Description must be a string', 422);
    return;
  }

  if (typeof body.description === 'string' && body.description.length > 3000) {
    sendError(res, 'Description must be 3000 characters or fewer', 422);
    return;
  }

  if (body.brand !== undefined && typeof body.brand !== 'string') {
    sendError(res, 'Brand must be a string', 422);
    return;
  }

  if (typeof body.brand === 'string' && body.brand.length > 100) {
    sendError(res, 'Brand must be 100 characters or fewer', 422);
    return;
  }

  if (
    body.status !== undefined &&
    !CREATEABLE_LISTING_STATUSES.includes(body.status)
  ) {
    sendError(res, 'Status must be either draft or active', 422);
    return;
  }

  if (body.currency !== undefined) {
    if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency.trim())) {
      sendError(res, 'Currency must be a 3-letter uppercase code such as MYR', 422);
      return;
    }
  }

  if (body.negotiable !== undefined && typeof body.negotiable !== 'boolean') {
    sendError(res, 'Negotiable must be a boolean value', 422);
    return;
  }

  if (
    !isDraft &&
    body.stateId !== undefined &&
    body.stateId !== null &&
    !isPositiveIntegerLike(body.stateId)
  ) {
    sendError(res, 'stateId must be a positive integer', 422);
    return;
  }

  if (
    !isDraft &&
    body.areaId !== undefined &&
    body.areaId !== null &&
    !isPositiveIntegerLike(body.areaId)
  ) {
    sendError(res, 'areaId must be a positive integer', 422);
    return;
  }

  if (body.imagePaths !== undefined) {
    if (!Array.isArray(body.imagePaths)) {
      sendError(res, 'imagePaths must be an array of strings', 422);
      return;
    }

    if (body.imagePaths.length > 6) {
      sendError(res, 'A maximum of 6 image paths is supported per listing', 422);
      return;
    }

    if (body.imagePaths.some((path) => typeof path !== 'string' || !path.trim())) {
      sendError(res, 'Each image path must be a non-empty string', 422);
      return;
    }
  }

  if (
    body.coverImagePath !== undefined &&
    body.coverImagePath !== null &&
    (typeof body.coverImagePath !== 'string' || !body.coverImagePath.trim())
  ) {
    sendError(res, 'coverImagePath must be a non-empty string when provided', 422);
    return;
  }

  next();
}
