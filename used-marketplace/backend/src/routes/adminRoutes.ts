import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  ensureAdminModerationThreadHandler,
  createAdminUserHandler,
  createCategoryHandler,
  createLocationHandler,
  getAdminStructureHandler,
  getAdminUserDetailsHandler,
  getAdminUsersHandler,
  updateAdminUserStatusHandler,
} from '../controllers/adminController';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/users', getAdminUsersHandler);
router.post('/users', createAdminUserHandler);
router.get('/users/:userId', getAdminUserDetailsHandler);
router.patch('/users/:userId/status', updateAdminUserStatusHandler);
router.post('/users/:userId/moderation-thread', ensureAdminModerationThreadHandler);

router.get('/structure', getAdminStructureHandler);
router.post('/structure/categories', createCategoryHandler);
router.post('/structure/locations', createLocationHandler);

export default router;
