const express = require("express");

const {
  getSeating,
  getMySeating,
  generateSeating,
} = require("../controllers/seatingController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Student: Get only my own seating
router.get(
  "/my",
  authenticateToken,
  authorizeRoles("student"),
  getMySeating
);

// Admin / Principal / HOD / Staff: Get seating assignments for an exam
router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "principal", "hod", "staff"),
  getSeating
);

// Admin only: Generate seating for an exam
router.post(
  "/generate",
  authenticateToken,
  authorizeRoles("admin"),
  generateSeating
);
const { generateDualSeating } = require("../controllers/generateDualSeating");
const { allocateHall } = require("../controllers/allocateHall");

router.post(
  "/generate-dual",
  authenticateToken,
  authorizeRoles("admin"),
  generateDualSeating
);

router.post(
  "/allocate-hall",
  authenticateToken,
  authorizeRoles("admin"),
  allocateHall
);

module.exports = router;