import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  applyForIdentityVerification,
  approveVerificationRequest,
  getAdminVerificationRequestDetail,
  getAdminVerificationRequests,
  getMyVerification,
  MAX_IDENTITY_MULTIPART_BYTES,
  rejectVerificationRequest,
  requestVerificationResubmission,
  VerificationServiceError,
  type IdentityVerificationUpload,
} from '../services/verificationService';
import {
  getFormBoolean,
  getFormFile,
  getFormString,
  MultipartParseError,
  parseMultipartFormData,
} from '../utils/multipart';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handleVerificationError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  if (error instanceof VerificationServiceError || error instanceof MultipartParseError) {
    sendError(res, error.message, error.status);
    return;
  }

  console.error(fallbackMessage, error);
  sendError(res, fallbackMessage, 500);
}

async function formFileToUpload(
  file: File | null,
  fallbackName: string
): Promise<IdentityVerificationUpload | null> {
  if (!file) {
    return null;
  }

  const arrayBuffer = await file.arrayBuffer();

  return {
    fileName: file.name || fallbackName,
    contentType: file.type || '',
    size: file.size,
    buffer: Buffer.from(arrayBuffer),
  };
}

export async function getMyVerificationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await getMyVerification(req.user.id);
    sendSuccess(res, data);
  } catch (error) {
    handleVerificationError(res, error, 'Internal server error while loading verification status');
  }
}

export async function applyForVerificationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const formData = await parseMultipartFormData(req, MAX_IDENTITY_MULTIPART_BYTES);
    const selfie = await formFileToUpload(getFormFile(formData, 'selfie'), 'selfie');
    const documentFront = await formFileToUpload(
      getFormFile(formData, 'documentFront') ??
        getFormFile(formData, 'documentFrontImage') ??
        getFormFile(formData, 'document'),
      'document-front'
    );

    const data = await applyForIdentityVerification({
      userId: req.user.id,
      documentType: getFormString(formData, 'documentType'),
      documentCountry: getFormString(formData, 'documentCountry'),
      documentNumberLast4: getFormString(formData, 'documentNumberLast4'),
      userNotes: getFormString(formData, 'userNotes'),
      consent: getFormBoolean(formData, 'consent'),
      selfie,
      documentFront,
    });

    sendSuccess(res, data, 201);
  } catch (error) {
    handleVerificationError(res, error, 'Internal server error while submitting verification');
  }
}

export async function getAdminVerificationRequestsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const data = await getAdminVerificationRequests(status);
    sendSuccess(res, data);
  } catch (error) {
    handleVerificationError(res, error, 'Internal server error while loading verification requests');
  }
}

export async function getAdminVerificationRequestDetailHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const data = await getAdminVerificationRequestDetail(req.params.id);
    sendSuccess(res, data);
  } catch (error) {
    handleVerificationError(res, error, 'Internal server error while loading verification request');
  }
}

export async function approveVerificationRequestHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await approveVerificationRequest({
      adminUserId: req.user.id,
      requestId: req.params.id,
      adminNotes: typeof req.body?.adminNotes === 'string' ? req.body.adminNotes : null,
    });
    sendSuccess(res, data);
  } catch (error) {
    handleVerificationError(res, error, 'Internal server error while approving verification');
  }
}

export async function rejectVerificationRequestHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await rejectVerificationRequest({
      adminUserId: req.user.id,
      requestId: req.params.id,
      rejectionReason:
        typeof req.body?.rejectionReason === 'string' ? req.body.rejectionReason : null,
      adminNotes: typeof req.body?.adminNotes === 'string' ? req.body.adminNotes : null,
    });
    sendSuccess(res, data);
  } catch (error) {
    handleVerificationError(res, error, 'Internal server error while rejecting verification');
  }
}

export async function requestVerificationResubmissionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await requestVerificationResubmission({
      adminUserId: req.user.id,
      requestId: req.params.id,
      rejectionReason:
        typeof req.body?.rejectionReason === 'string' ? req.body.rejectionReason : null,
      adminNotes: typeof req.body?.adminNotes === 'string' ? req.body.adminNotes : null,
    });
    sendSuccess(res, data);
  } catch (error) {
    handleVerificationError(res, error, 'Internal server error while requesting resubmission');
  }
}
