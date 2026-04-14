import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth';
import {
  AdminServiceError,
  ensureAdminModerationThread,
  createAdminUser,
  createCategory,
  createLocation,
  getAdminStructure,
  getAdminUserDetails,
  getAdminUsers,
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
