import { Router } from 'express';
import { getPlatformConfig } from '../controllers/publicSettingsController';

const router = Router();

router.get('/config', getPlatformConfig);

export default router;
