import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  deleteAdminListingHandler,
  ensureAdminModerationThreadHandler,
  getAdminListingDetailsHandler,
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

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/overview', getAdminOverviewHandler);
router.get('/users', getAdminUsersHandler);
router.get('/listings', getAdminListingsHandler);
router.get('/listings/:listingId', getAdminListingDetailsHandler);
router.get('/reports', getAdminReportsHandler);
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

export default router;
