const express = require("express");
const { getEnrollments, bulkEnroll, removeEnrollment } = require("../controllers/examEnrollmentController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", authenticateToken, authorizeRoles("admin", "principal", "hod"), getEnrollments);
router.post("/bulk", authenticateToken, authorizeRoles("admin"), bulkEnroll);
router.delete("/", authenticateToken, authorizeRoles("admin"), removeEnrollment);

module.exports = router;
