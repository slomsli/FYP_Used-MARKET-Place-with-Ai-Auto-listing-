import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  generateListingCoach,
  generateListingData,
  type ListingCoachInput,
} from '../services/aiService';
import {
  AI_LISTING_COACH_SETTING_KEY,
  AI_LISTING_AUTOFILL_SETTING_KEY,
  isSettingEnabled,
} from '../services/settingsService';
import { sendError, sendSuccess } from '../utils/apiResponse';

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function validateImagePayloads(images: unknown): { base64Data: string; contentType: string }[] | null {
  if (images === undefined) {
    return [];
  }

  if (!Array.isArray(images)) {
    return null;
  }

  const validImages: { base64Data: string; contentType: string }[] = [];

  for (const img of images) {
    if (!img || typeof img !== 'object') {
      return null;
    }

    const candidate = img as Record<string, unknown>;
    const base64Data = typeof candidate.base64Data === 'string' ? candidate.base64Data : '';
    const contentType = typeof candidate.contentType === 'string'
      ? candidate.contentType.toLowerCase()
      : '';

    if (!base64Data || !contentType) {
      return null;
    }

    if (!contentType.startsWith('image/')) {
      return null;
    }

    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return null;
    }

    const base64Str = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const approxSizeBytes = (base64Str.length * 3) / 4;
    if (approxSizeBytes > MAX_IMAGE_SIZE_BYTES) {
      return null;
    }

    validImages.push({ base64Data, contentType });
  }

  return validImages;
}

export async function generateListingFromImageHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const isAutofillEnabled = await isSettingEnabled(AI_LISTING_AUTOFILL_SETTING_KEY, true);

    if (!isAutofillEnabled) {
      sendError(res, 'AI listing autofill is disabled by an administrator', 403);
      return;
    }

    const { images } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      sendError(res, 'Please provide an array of images for analysis', 400);
      return;
    }

    const validImages = validateImagePayloads(images);
    if (!validImages) {
      sendError(res, 'Images must be jpeg, png, webp, or heic files under 8MB each', 400);
      return;
    }

    const generatedData = await generateListingData(validImages);

    sendSuccess(res, generatedData);
  } catch (error) {
    console.error('[AI Controller] Error generating listing from image:', error);
    const fallbackMessage = 'Unable to generate listing metadata right now';
    const safeMessage =
      process.env.NODE_ENV === 'production'
        ? fallbackMessage
        : error instanceof Error && error.message
          ? error.message
          : fallbackMessage;

    sendError(res, safeMessage, 500);
  }
}

export async function generateListingCoachHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const isCoachEnabled = await isSettingEnabled(AI_LISTING_COACH_SETTING_KEY, true);

    if (!isCoachEnabled) {
      sendError(res, 'AI listing coach is disabled by an administrator', 403);
      return;
    }

    const body = req.body && typeof req.body === 'object'
      ? req.body as Record<string, unknown>
      : {};
    const images = validateImagePayloads(body.images);

    if (!images) {
      sendError(res, 'Images must be jpeg, png, webp, or heic files under 8MB each', 400);
      return;
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const price = typeof body.price === 'number'
      ? body.price
      : typeof body.price === 'string' && body.price.trim()
        ? Number(body.price)
        : null;

    if (!title && !description && images.length === 0) {
      sendError(res, 'Add a title, description, or photo before asking the AI coach', 400);
      return;
    }

    const coachInput: ListingCoachInput = {
      title,
      description,
      brand: typeof body.brand === 'string' ? body.brand : '',
      categoryName: typeof body.categoryName === 'string' ? body.categoryName : null,
      parentCategoryName:
        typeof body.parentCategoryName === 'string' ? body.parentCategoryName : null,
      condition: typeof body.condition === 'string' ? body.condition : null,
      price: Number.isFinite(price) ? price : null,
      currency: typeof body.currency === 'string' && body.currency.trim()
        ? body.currency.trim()
        : 'MYR',
      negotiable: body.negotiable === true,
      stateName: typeof body.stateName === 'string' ? body.stateName : null,
      areaName: typeof body.areaName === 'string' ? body.areaName : null,
      imageCount: typeof body.imageCount === 'number' && Number.isFinite(body.imageCount)
        ? Math.max(0, Math.round(body.imageCount))
        : images.length,
      images: images.slice(0, 3),
    };

    const coachResult = await generateListingCoach(coachInput);
    sendSuccess(res, coachResult);
  } catch (error) {
    console.error('[AI Controller] Error generating listing coach:', error);
    const fallbackMessage = 'Unable to run AI listing coach right now';
    const safeMessage =
      process.env.NODE_ENV === 'production'
        ? fallbackMessage
        : error instanceof Error && error.message
          ? error.message
          : fallbackMessage;

    sendError(res, safeMessage, 500);
  }
}
