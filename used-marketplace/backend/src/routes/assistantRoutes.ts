import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate';
import {
  archiveAssistantThreadHandler,
  assistantChatHandler,
  createAssistantThreadHandler,
  deleteAssistantThreadHandler,
  getAssistantThreadMessagesHandler,
  getAssistantThreadsHandler,
  sendAssistantMessageHandler,
} from '../controllers/assistantController';

const assistantLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 25,
  message: {
    success: false,
    error: 'Too many assistant requests. Please slow down and try again in a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.use(authenticate);
router.post('/threads', assistantLimiter, createAssistantThreadHandler);
router.get('/threads', getAssistantThreadsHandler);
router.get('/threads/:threadId/messages', getAssistantThreadMessagesHandler);
router.delete('/threads/:threadId', assistantLimiter, deleteAssistantThreadHandler);
router.patch('/threads/:threadId/archive', assistantLimiter, archiveAssistantThreadHandler);
router.post('/chat', assistantLimiter, assistantChatHandler);
router.post('/message', assistantLimiter, sendAssistantMessageHandler);

export default router;
