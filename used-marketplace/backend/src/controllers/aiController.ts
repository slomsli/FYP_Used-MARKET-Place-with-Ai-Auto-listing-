import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import { generateListingData } from '../services/aiService';
import {
  AI_LISTING_AUTOFILL_SETTING_KEY,
  isSettingEnabled,
} from '../services/settingsService';
import { sendError, sendSuccess } from '../utils/apiResponse';

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

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

    // Validation
    for (const img of images) {
      if (!img.base64Data || !img.contentType) {
        sendError(res, 'Each image must include base64Data and contentType', 400);
        return;
      }

      const contentType = img.contentType.toLowerCase();
      if (!contentType.startsWith('image/')) {
        sendError(res, 'Only image files are supported', 400);
        return;
      }

      if (!ALLOWED_MIME_TYPES.includes(contentType)) {
        sendError(res, 'Unsupported image format. Allowed: jpeg, png, webp, heic', 400);
        return;
      }

      // Check size roughly from base64
      const base64Str = img.base64Data.replace(/^data:image\/\w+;base64,/, '');
      const approxSizeBytes = (base64Str.length * 3) / 4;
      if (approxSizeBytes > MAX_IMAGE_SIZE_BYTES) {
        sendError(res, 'One or more images exceed the 8MB size limit', 400);
        return;
      }
    }

    const generatedData = await generateListingData(images);

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
