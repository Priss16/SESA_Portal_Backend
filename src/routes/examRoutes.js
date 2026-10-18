const express = require("express");

const {
  getExams,
  createExam,
  updateExam,
  updateExamStatus,
} = require("../controllers/examController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Get exams
router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "principal", "hod", "staff"),
  getExams
);

const { getMyExams } = require("../controllers/examController");

// Student: Get my enrolled exams
router.get(
  "/my",
  authenticateToken,
  authorizeRoles("student"),
  getMyExams
);

// Create exam
router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  createExam
);

// Update exam details
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateExam
);

// Update only exam status
router.patch(
  "/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateExamStatus
);

module.exports = router;