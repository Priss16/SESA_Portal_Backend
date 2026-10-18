const pool = require("../db");

// --------------------------------------------------
// GET ALL EXAMS
// --------------------------------------------------

const getExams = async (req, res) => {
  try {
    let departmentCondition = "";
    const queryParams = [];

    // Staff and HOD are department-scoped.
    // Admin and Principal can see all departments.
    if (req.user.role === "staff" || req.user.role === "hod") {
      if (!req.user.department_id) {
        return res.status(403).json({
          success: false,
          message: "Your account is not assigned to a department",
        });
      }

      departmentCondition = `
        AND s.department_id = ?
      `;

      queryParams.push(req.user.department_id);
    }

    const [exams] = await pool.query(
      `
      SELECT
        e.id,
        e.subject_id,

        s.code AS subject_code,
        s.name AS subject_name,
        s.semester,
        d.code AS department_code,

        e.exam_date,
        e.start_time,
        e.end_time,
        e.duration_minutes,
        e.status,

        (
          SELECT COUNT(DISTINCT sa.hall_id)
          FROM seating_assignments sa
          WHERE sa.exam_id = e.id
        ) AS hall_count,

        (
          SELECT COUNT(DISTINCT sa.student_id)
          FROM seating_assignments sa
          WHERE sa.exam_id = e.id
        ) AS student_count,

        e.created_at,
        e.updated_at

      FROM exams e

      INNER JOIN subjects s
        ON e.subject_id = s.id

      LEFT JOIN departments d
        ON s.department_id = d.id

      WHERE 1 = 1
        ${departmentCondition}

      ORDER BY
        e.exam_date ASC,
        e.start_time ASC,
        e.id ASC
      `,
      queryParams
    );

    res.json({
      success: true,
      data: exams,
    });
  } catch (error) {
    console.error("Get exams error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch exams",
    });
  }
};

// --------------------------------------------------
// GET ONE EXAM
// --------------------------------------------------

const getExamById = async (req, res) => {
  try {
    const { id } = req.params;

    const [exams] = await pool.query(
      `
      SELECT
        e.id,
        e.subject_id,

        s.code AS subject_code,
        s.name AS subject_name,
        d.code AS department_code,

        e.exam_date,
        e.start_time,
        e.end_time,
        e.duration_minutes,
        e.status,

        e.created_at,
        e.updated_at

      FROM exams e

      INNER JOIN subjects s
        ON e.subject_id = s.id

      LEFT JOIN departments d
        ON s.department_id = d.id

      WHERE e.id = ?
      `,
      [id]
    );

    if (exams.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    res.json({
      success: true,
      data: exams[0],
    });
  } catch (error) {
    console.error("Get exam by id error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch exam",
    });
  }
};

// --------------------------------------------------
// CREATE EXAM
// --------------------------------------------------

const createExam = async (req, res) => {
  try {
    const {
      subject_id,
      exam_date,
      start_time,
      end_time,
      duration_minutes,
      status,
    } = req.body;

    if (
      !subject_id ||
      !exam_date ||
      !start_time ||
      !end_time
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Subject, exam date, start time, and end time are required",
      });
    }

    // Make sure the selected subject exists.
    const [subject] = await pool.query(
      `
      SELECT id
      FROM subjects
      WHERE id = ?
      `,
      [subject_id]
    );

    if (subject.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject",
      });
    }

    // Prevent invalid duration values.
    let duration = null;

    if (
      duration_minutes !== undefined &&
      duration_minutes !== null &&
      duration_minutes !== ""
    ) {
      duration = Number(duration_minutes);

      if (!Number.isInteger(duration) || duration <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Duration must be a positive number of minutes",
        });
      }
    }

    // Only allow statuses that exist in the database enum.
    const allowedStatuses = [
      "draft",
      "scheduled",
      "published",
      "completed",
      "cancelled",
    ];

    const examStatus = status || "draft";

    if (!allowedStatuses.includes(examStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid exam status",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO exams
      (
        subject_id,
        exam_date,
        start_time,
        end_time,
        duration_minutes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        Number(subject_id),
        exam_date,
        start_time,
        end_time,
        duration,
        examStatus,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Exam created successfully",
      data: {
        id: result.insertId,
        subject_id: Number(subject_id),
        exam_date,
        start_time,
        end_time,
        duration_minutes: duration,
        status: examStatus,
      },
    });
  } catch (error) {
    console.error("Create exam error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create exam",
    });
  }
};

// --------------------------------------------------
// UPDATE EXAM
// --------------------------------------------------

const updateExam = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      subject_id,
      exam_date,
      start_time,
      end_time,
      duration_minutes,
      status,
    } = req.body;

    if (
      !subject_id ||
      !exam_date ||
      !start_time ||
      !end_time
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Subject, exam date, start time, and end time are required",
      });
    }

    // Check that the exam exists.
    const [exam] = await pool.query(
      `
      SELECT id
      FROM exams
      WHERE id = ?
      `,
      [id]
    );

    if (exam.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    // Check that the subject exists.
    const [subject] = await pool.query(
      `
      SELECT id
      FROM subjects
      WHERE id = ?
      `,
      [subject_id]
    );

    if (subject.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subject",
      });
    }

    let duration = null;

    if (
      duration_minutes !== undefined &&
      duration_minutes !== null &&
      duration_minutes !== ""
    ) {
      duration = Number(duration_minutes);

      if (!Number.isInteger(duration) || duration <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Duration must be a positive number of minutes",
        });
      }
    }

    const allowedStatuses = [
      "draft",
      "scheduled",
      "published",
      "completed",
      "cancelled",
    ];

    const examStatus = status || "draft";

    if (!allowedStatuses.includes(examStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid exam status",
      });
    }

    await pool.query(
      `
      UPDATE exams
      SET
        subject_id = ?,
        exam_date = ?,
        start_time = ?,
        end_time = ?,
        duration_minutes = ?,
        status = ?
      WHERE id = ?
      `,
      [
        Number(subject_id),
        exam_date,
        start_time,
        end_time,
        duration,
        examStatus,
        id,
      ]
    );

    res.json({
      success: true,
      message: "Exam updated successfully",
    });
  } catch (error) {
    console.error("Update exam error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update exam",
    });
  }
};

// --------------------------------------------------
// UPDATE EXAM STATUS
// --------------------------------------------------

const updateExamStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "draft",
      "scheduled",
      "published",
      "completed",
      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid exam status",
      });
    }

    const [result] = await pool.query(
      `
      UPDATE exams
      SET status = ?
      WHERE id = ?
      `,
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    res.json({
      success: true,
      message: "Exam status updated successfully",
    });
  } catch (error) {
    console.error(
      "Update exam status error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to update exam status",
    });
  }
};

const getMyExams = async (req, res) => {
  try {
    const [students] = await pool.query(
      `SELECT id FROM students WHERE user_id = ?`,
      [req.user.id]
    );

    if (students.length === 0) {
      return res.status(404).json({ success: false, message: "Student profile not found" });
    }

    const studentId = students[0].id;

    const [exams] = await pool.query(
      `
      SELECT
        e.id,
        e.subject_id,
        s.code AS subject_code,
        s.name AS subject_name,
        s.semester,
        d.code AS department_code,
        e.exam_date,
        e.start_time,
        e.end_time,
        e.duration_minutes,
        e.status,
        e.created_at,
        e.updated_at
      FROM exams e
      INNER JOIN subjects s ON e.subject_id = s.id
      LEFT JOIN departments d ON s.department_id = d.id
      INNER JOIN exam_enrollments ee ON e.id = ee.exam_id
      WHERE ee.student_id = ?
      ORDER BY e.exam_date ASC, e.start_time ASC
      `,
      [studentId]
    );

    res.json({
      success: true,
      data: exams,
    });
  } catch (error) {
    console.error("Get my exams error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch enrolled exams" });
  }
};

module.exports = {
  getExams,
  getExamById,
  createExam,
  updateExam,
  updateExamStatus,
  getMyExams,
};