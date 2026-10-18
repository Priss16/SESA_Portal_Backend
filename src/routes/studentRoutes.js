const express = require("express");

const {
  getStudents,
  createStudent,
  updateStudent,
} = require("../controllers/studentController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "principal", "hod", "staff"),
  getStudents
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  createStudent
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateStudent
);

module.exports = router;