const express = require("express");
const { login, googleLogin, getMe, changePassword, forgotPassword, resetPassword, registerStudent } = require("../controllers/authController");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", login);
router.post("/register-student", registerStudent);
router.post("/google", googleLogin);
router.get("/me", authenticateToken, getMe);
router.post("/change-password", authenticateToken, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;