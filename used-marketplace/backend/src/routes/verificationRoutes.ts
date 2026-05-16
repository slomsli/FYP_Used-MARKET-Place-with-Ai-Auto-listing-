import { Router } from 'express';
import {
  applyForVerificationHandler,
  getMyVerificationHandler,
} from '../controllers/verificationController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.use(authenticate);

router.get('/me', getMyVerificationHandler);
router.post('/apply', applyForVerificationHandler);

export default router;
