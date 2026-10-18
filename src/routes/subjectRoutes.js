const express = require("express");

const {
  getSubjects,
  createSubject,
  updateSubject,
} = require("../controllers/subjectController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  getSubjects
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  createSubject
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateSubject
);

module.exports = router;