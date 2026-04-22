import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  AdminServiceError,
  deleteAdminListing,
  ensureAdminModerationThread,
  getAdminListingDetails,
  getAdminListings,
  getAdminOverview,
  getAdminReports,
  createAdminUser,
  createCategory,
  createLocation,
  getAdminStructure,
  getAdminUserDetails,
  getAdminUsers,
  updateAdminListingStatus,
  updateAdminReportStatus,
  updateAdminUserStatus,
} from '../services/adminService';
import { sendError, sendSuccess } from '../utils/apiResponse';

function handleAdminError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof AdminServiceError) {
    sendError(res, error.message, error.status);
    return;
  }

  console.error(fallbackMessage, error);
  sendError(res, fallbackMessage, 500);
}

export async function getAdminOverviewHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getAdminOverview();
    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while fetching the admin overview');
  }
}

export async function getAdminUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getAdminUsers({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      role: typeof req.query.role === 'string' ? req.query.role : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });

    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while fetching admin users');
  }
}

export async function createAdminUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await createAdminUser(req.body as {
      fullName: string;
      username: string;
      email: string;
      password: string;
      stateId?: number | null;
      areaId?: number | null;
    });

    sendSuccess(res, data, 201);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while creating a user');
  }
}

export async function getAdminListingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getAdminListings({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
      stateId: req.query.stateId ? Number(req.query.stateId) : undefined,
    });

    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while fetching admin listings');
  }
}

export async function getAdminListingDetailsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const data = await getAdminListingDetails(req.params.listingId);
    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while fetching admin listing details');
  }
}

export async function getAdminReportsHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getAdminReports({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });

    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while fetching admin reports');
  }
}

export async function getAdminUserDetailsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const data = await getAdminUserDetails(req.params.userId);
    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while fetching user details');
  }
}

export async function updateAdminUserStatusHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const action = req.body?.action;

  if (action !== 'suspend' && action !== 'activate') {
    sendError(res, 'action must be either suspend or activate', 422);
    return;
  }

  try {
    const data = await updateAdminUserStatus({
      adminUserId: req.user.id,
      targetUserId: req.params.userId,
      action,
    });
    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while updating user status');
  }
}

export async function ensureAdminModerationThreadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  try {
    const data = await ensureAdminModerationThread(req.user.id, req.params.userId);
    sendSuccess(res, data, 201);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while preparing a moderation thread');
  }
}

export async function deleteAdminListingHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const listingId = typeof req.params.listingId === 'string' ? req.params.listingId.trim() : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

  if (!listingId) {
    sendError(res, 'listingId is required', 422);
    return;
  }

  try {
    const data = await deleteAdminListing({
      adminUserId: req.user.id,
      listingId,
      reason,
    });
    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while deleting a listing from admin management');
  }
}

export async function updateAdminListingStatusHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const listingId = typeof req.params.listingId === 'string' ? req.params.listingId.trim() : '';
  const action = req.body?.action;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;

  if (!listingId) {
    sendError(res, 'listingId is required', 422);
    return;
  }

  if (action !== 'pause' && action !== 'resume' && action !== 'approve' && action !== 'reject') {
    sendError(res, 'action must be one of: pause, resume, approve, reject', 422);
    return;
  }

  try {
    const data = await updateAdminListingStatus({
      adminUserId: req.user.id,
      listingId,
      action,
      reason,
    });
    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while updating listing status');
  }
}

export async function updateAdminReportStatusHandler(
  req: Request,
  res: Response
): Promise<void> {
  const reportId = typeof req.params.reportId === 'string' ? req.params.reportId.trim() : '';
  const action = req.body?.action;

  if (!reportId) {
    sendError(res, 'reportId is required', 422);
    return;
  }

  if (action !== 'review' && action !== 'resolve' && action !== 'dismiss') {
    sendError(res, 'action must be one of: review, resolve, dismiss', 422);
    return;
  }

  try {
    const data = await updateAdminReportStatus({
      reportId,
      action,
    });
    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while updating report status');
  }
}

export async function getAdminStructureHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await getAdminStructure({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });

    sendSuccess(res, data);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while fetching structure management data');
  }
}

export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await createCategory(req.body as { name: string; parentId?: number | null });
    sendSuccess(res, data, 201);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while creating a category');
  }
}

export async function createLocationHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await createLocation(req.body as { stateName: string; areaNames?: string[] });
    sendSuccess(res, data, 201);
  } catch (error) {
    handleAdminError(res, error, 'Internal server error while creating a location');
  }
}
