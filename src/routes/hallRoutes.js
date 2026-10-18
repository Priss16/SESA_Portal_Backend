const express = require("express");

const {
  getHalls,
  createHall,
  updateHall,
} = require("../controllers/hallController");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "principal", "hod", "staff"),
  getHalls
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  createHall
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateHall
);

module.exports = router;