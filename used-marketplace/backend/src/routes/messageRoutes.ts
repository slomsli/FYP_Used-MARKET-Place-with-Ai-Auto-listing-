import { Router } from 'express';
import { getConversations, getMessages, sendMessage, sendReply, markAsRead } from '../controllers/messageController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All message routes require authentication
router.use(authenticate);

router.get('/', getConversations);
router.post('/', sendMessage);
router.get('/:conversationId', getMessages);
router.post('/:conversationId/reply', sendReply);
router.put('/:conversationId/read', markAsRead);

export default router;
