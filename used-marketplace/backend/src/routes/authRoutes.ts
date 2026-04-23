import { Router } from 'express';
import { register } from '../controllers/auth/register';
import { login } from '../controllers/auth/login';
import { getMe } from '../controllers/auth/me';
import { checkStatus } from '../controllers/auth/status';
import {
  requestPasswordReset,
  verifyPasswordReset,
} from '../controllers/auth/passwordReset';
import {
  resendVerification,
  verifyEmail,
} from '../controllers/auth/verification';
import { validateRegister } from '../middleware/auth/validateRegister';
import { validateLogin } from '../middleware/auth/validateLogin';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Public routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/check-status', checkStatus);
router.post('/verify-email', verifyEmail);
router.post('/verify-email/resend', resendVerification);
router.post('/password-reset/request', requestPasswordReset);
router.post('/password-reset/verify', verifyPasswordReset);

// Protected routes
router.get('/me', authenticate, getMe);

export default router;
