import { Router } from 'express';
import {
  archiveConversation,
  createSupportConversation,
  getArchivedConversations,
  getConversations,
  getMessages,
  markAsRead,
  sendMessage,
  sendReply,
  unarchiveConversation,
  updateSupportTicketStatus,
} from '../controllers/messageController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All message routes require authentication
router.use(authenticate);

router.get('/', getConversations);
router.get('/archives', getArchivedConversations);
router.post('/support', createSupportConversation);
router.post('/', sendMessage);
router.get('/:conversationId', getMessages);
router.put('/:conversationId/archive', archiveConversation);
router.delete('/:conversationId/archive', unarchiveConversation);
router.post('/:conversationId/reply', sendReply);
router.put('/:conversationId/read', markAsRead);
router.put('/:conversationId/support-status', updateSupportTicketStatus);

export default router;
