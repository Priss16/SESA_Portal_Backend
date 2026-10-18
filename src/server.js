const express = require("express");
const cors = require("cors");
const pool = require("./db");

require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const staffRoutes = require("./routes/staffRoutes");
const subjectRoutes = require("./routes/subjectRoutes");
const examRoutes = require("./routes/examRoutes");
const hallRoutes = require("./routes/hallRoutes");
const seatingRoutes = require("./routes/seatingRoutes");
const invigilationRoutes = require("./routes/invigilationRoutes");
const substitutionRoutes = require("./routes/substitutionRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const examEnrollmentRoutes = require("./routes/examEnrollmentRoutes");

const {
  authenticateToken,
  authorizeRoles,
} = require("./middleware/authMiddleware");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "SESA backend is running",
  });
});

// Database test
app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS result");

    res.json({
      success: true,
      message: "MySQL database connected successfully",
      data: rows,
    });
  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Student routes
app.use("/api/students", studentRoutes);

app.use("/api/departments", departmentRoutes);

app.use("/api/staff", staffRoutes);

app.use("/api/subjects", subjectRoutes);

app.use("/api/exams", examRoutes);

app.use("/api/halls", hallRoutes);

app.use("/api/seating", seatingRoutes);

app.use("/api/invigilations", invigilationRoutes);

app.use("/api/invigilation-substitutions", substitutionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/exam-enrollments", examEnrollmentRoutes);

// JWT authentication test
app.get(
  "/api/protected-test",
  authenticateToken,
  (req, res) => {
    res.json({
      success: true,
      message: "JWT authentication is working",
      user: req.user,
    });
  }
);

// Admin authorization test
app.get(
  "/api/admin-test",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({
      success: true,
      message: "Admin authorization is working",
      user: req.user,
    });
  }
);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`SESA backend running on http://localhost:${PORT}`);
});