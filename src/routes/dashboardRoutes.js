const express = require("express");
const { getAdminDashboardStats, getPrincipalDashboardStats, getHodDashboardStats } = require("../controllers/dashboardController");
const { authenticateToken, authorizeRoles, requireDepartment } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/admin", authenticateToken, authorizeRoles("admin"), getAdminDashboardStats);
router.get("/principal", authenticateToken, authorizeRoles("principal"), getPrincipalDashboardStats);
router.get("/hod", authenticateToken, authorizeRoles("hod"), requireDepartment("hod"), getHodDashboardStats);

module.exports = router;
