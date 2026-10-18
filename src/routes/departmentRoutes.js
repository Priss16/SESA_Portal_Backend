const express = require("express");

const {
  getDepartments,
  getDepartmentStats,
  createDepartment,
  updateDepartment,
} = require("../controllers/departmentController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "staff", "principal", "hod"),
  getDepartments
);

router.get(
  "/:id/stats",
  authenticateToken,
  authorizeRoles("admin", "principal", "hod"),
  getDepartmentStats
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  createDepartment
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateDepartment
);

module.exports = router;