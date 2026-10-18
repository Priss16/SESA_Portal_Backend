const express = require("express");

const {
  getStaff,
  createStaff,
  updateStaff,
} = require("../controllers/staffController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "principal", "hod", "staff"),
  getStaff
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  createStaff
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateStaff
);

module.exports = router;