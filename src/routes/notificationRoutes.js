const express = require('express');
const router = express.Router();
const { getUnread, getAll, markAsRead } = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, getAll);
router.get('/unread', authenticateToken, getUnread);
router.post('/:id/read', authenticateToken, markAsRead);

module.exports = router;
