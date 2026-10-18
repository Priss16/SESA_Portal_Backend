const express = require("express");

const {
  createSubstitutionRequest,
  getMySubstitutionRequests,
  getAllSubstitutionRequests,
  approveSubstitutionRequest,
  rejectSubstitutionRequest
} = require("../controllers/substitutionController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  authorizeRoles("staff"),
  createSubstitutionRequest
);

router.get(
  "/my",
  authenticateToken,
  authorizeRoles("staff"),
  getMySubstitutionRequests
);

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "principal"),
  getAllSubstitutionRequests
);

router.patch(
  "/:id/approve",
  authenticateToken,
  authorizeRoles("principal"),
  approveSubstitutionRequest
);

router.patch(
  "/:id/reject",
  authenticateToken,
  authorizeRoles("principal"),
  rejectSubstitutionRequest
);

module.exports = router;
