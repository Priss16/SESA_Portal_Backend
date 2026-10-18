const express = require("express");

const {
  getInvigilations,
  getMyInvigilations,
  assignInvigilation,
  createInvigilation,
  getExamInvigilations,
  deleteInvigilation
} = require("../controllers/invigilationController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "principal"),
  getInvigilations
);

router.get(
  "/my",
  authenticateToken,
  authorizeRoles("staff"),
  getMyInvigilations
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  createInvigilation
);

router.post(
  "/assign",
  authenticateToken,
  authorizeRoles("admin"),
  assignInvigilation
);

router.get(
  "/exam/:exam_id",
  authenticateToken,
  authorizeRoles("admin", "principal"),
  getExamInvigilations
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteInvigilation
);

module.exports = router;
