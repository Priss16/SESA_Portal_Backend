const pool = require("../db");

exports.getUnread = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, message, created_at FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, notifications: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ success: true, notifications: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    if (req.params.id === 'all') {
      await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    } else {
      await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?', [req.user.id, req.params.id]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
