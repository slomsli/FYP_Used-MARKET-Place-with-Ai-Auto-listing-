import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  deleteAdminListingHandler,
  ensureAdminModerationThreadHandler,
  getAdminListingDetailsHandler,
  getAdminReportDetailsHandler,
  getAdminListingsHandler,
  getAdminOverviewHandler,
  getAdminReportsHandler,
  createAdminUserHandler,
  createCategoryHandler,
  createLocationHandler,
  getAdminStructureHandler,
  getAdminUserDetailsHandler,
  getAdminUsersHandler,
  updateAdminListingStatusHandler,
  updateAdminReportStatusHandler,
  updateAdminUserStatusHandler,
} from '../controllers/adminController';
import {
  approveVerificationRequestHandler,
  getAdminVerificationRequestDetailHandler,
  getAdminVerificationRequestsHandler,
  rejectVerificationRequestHandler,
  requestVerificationResubmissionHandler,
} from '../controllers/verificationController';

import {
  getPlatformSettings,
  updatePlatformSettings,
} from '../controllers/settingsController';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/overview', getAdminOverviewHandler);
router.get('/users', getAdminUsersHandler);
router.get('/verification/requests', getAdminVerificationRequestsHandler);
router.get('/verification/requests/:id', getAdminVerificationRequestDetailHandler);
router.patch('/verification/requests/:id/approve', approveVerificationRequestHandler);
router.patch('/verification/requests/:id/reject', rejectVerificationRequestHandler);
router.patch('/verification/requests/:id/resubmission', requestVerificationResubmissionHandler);
router.get('/listings', getAdminListingsHandler);
router.get('/listings/:listingId', getAdminListingDetailsHandler);
router.get('/reports', getAdminReportsHandler);
router.get('/reports/:reportId', getAdminReportDetailsHandler);
router.post('/users', createAdminUserHandler);
router.get('/users/:userId', getAdminUserDetailsHandler);
router.patch('/users/:userId/status', updateAdminUserStatusHandler);
router.post('/users/:userId/moderation-thread', ensureAdminModerationThreadHandler);
router.patch('/reports/:reportId/status', updateAdminReportStatusHandler);
router.patch('/listings/:listingId/status', updateAdminListingStatusHandler);
router.delete('/listings/:listingId', deleteAdminListingHandler);

router.get('/structure', getAdminStructureHandler);
router.post('/structure/categories', createCategoryHandler);
router.post('/structure/locations', createLocationHandler);

router.get('/settings', getPlatformSettings);
router.put('/settings', updatePlatformSettings);

export default router;
