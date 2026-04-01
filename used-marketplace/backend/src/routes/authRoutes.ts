import { Router } from 'express';
import { register } from '../controllers/auth/register';
import { login } from '../controllers/auth/login';
import { getMe } from '../controllers/auth/me';
import { validateRegister } from '../middleware/auth/validateRegister';
import { validateLogin } from '../middleware/auth/validateLogin';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Public routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);

// Protected routes
router.get('/me', authenticate, getMe);

export default router;
