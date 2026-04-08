import { Router } from 'express';
import { getSummary } from '../controllers/dashboardController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Apply auth middleware to all dashboard endpoints
router.use(authenticate);

// GET /api/dashboard/summary
router.get('/summary', getSummary);

export default router;
