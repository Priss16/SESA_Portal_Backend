const pool = require("../db");

// GET /api/exam-enrollments?exam_id=3
const getEnrollments = async (req, res) => {
  try {
    const { exam_id } = req.query;
    if (!exam_id) return res.status(400).json({ success: false, message: "exam_id is required" });

    // Ensure exam exists and get details
    const [exams] = await pool.query(
      `SELECT e.id, e.status, s.name as subject_name, d.name as department_name, d.id as department_id, e.exam_date 
       FROM exams e 
       JOIN subjects s ON e.subject_id = s.id 
       JOIN departments d ON s.department_id = d.id 
       WHERE e.id = ?`,
      [exam_id]
    );

    if (exams.length === 0) return res.status(404).json({ success: false, message: "Exam not found" });
    const exam = exams[0];

    // Get all students for this department
    const [allStudents] = await pool.query(
      `SELECT st.id as student_id, st.register_number, st.name as student_name, st.year, st.semester, d.code as department_code
       FROM students st
       JOIN departments d ON st.department_id = d.id
       JOIN users u ON st.user_id = u.id
       WHERE st.department_id = ? AND u.is_active = 1
       ORDER BY st.register_number ASC`,
      [exam.department_id]
    );

    // Get enrollments for this exam
    const [enrollments] = await pool.query(
      `SELECT student_id, created_at FROM exam_enrollments WHERE exam_id = ?`,
      [exam_id]
    );
    const enrolledIds = new Set(enrollments.map(e => e.student_id));
    const enrollmentDates = {};
    enrollments.forEach(e => enrollmentDates[e.student_id] = e.created_at);

    const data = allStudents.map(student => ({
      ...student,
      is_enrolled: enrolledIds.has(student.student_id),
      enrolled_at: enrollmentDates[student.student_id] || null
    }));

    res.json({ success: true, exam, data });
  } catch (error) {
    console.error("Get enrollments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch enrollments" });
  }
};

// POST /api/exam-enrollments/bulk
const bulkEnroll = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { exam_id, student_ids } = req.body;
    if (!exam_id || !Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ success: false, message: "exam_id and non-empty student_ids array are required" });
    }

    await connection.beginTransaction();

    const [exams] = await connection.query(`SELECT status FROM exams WHERE id = ?`, [exam_id]);
    if (exams.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Exam not found" });
    }
    if (exams[0].status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Students cannot be enrolled into a cancelled exam." });
    }

    const [existing] = await connection.query(`SELECT student_id FROM exam_enrollments WHERE exam_id = ?`, [exam_id]);
    const enrolledSet = new Set(existing.map(e => e.student_id));
    
    let added = 0;
    let rejected = 0;

    for (const student_id of student_ids) {
      if (enrolledSet.has(student_id)) {
        rejected++;
      } else {
        await connection.query(`INSERT INTO exam_enrollments (exam_id, student_id) VALUES (?, ?)`, [exam_id, student_id]);
        added++;
      }
    }

    await connection.commit();
    
    // Log to audit log
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, description) VALUES (?, ?, ?)`,
      [req.user.id, 'BULK_ENROLL_STUDENTS', `Bulk enrolled ${added} students into exam ${exam_id}`]
    );

    res.json({
      success: true,
      message: "Bulk enrollment processed",
      data: { exam_id, requested: student_ids.length, enrolled: added, rejected }
    });
  } catch (error) {
    await connection.rollback();
    console.error("Bulk enroll error:", error);
    res.status(500).json({ success: false, message: "Server error during bulk enrollment" });
  } finally {
    connection.release();
  }
};

// DELETE /api/exam-enrollments?exam_id=3&student_id=2
const removeEnrollment = async (req, res) => {
  try {
    const { exam_id, student_id } = req.query;
    if (!exam_id || !student_id) return res.status(400).json({ success: false, message: "exam_id and student_id required" });

    // Check if seating already assigned
    const [seating] = await pool.query(
      `SELECT id FROM seating_assignments WHERE exam_id = ? AND student_id = ?`,
      [exam_id, student_id]
    );
    if (seating.length > 0) {
      return res.status(409).json({ success: false, message: "Enrollment cannot be removed because seating has already been assigned for this exam." });
    }

    const [result] = await pool.query(
      `DELETE FROM exam_enrollments WHERE exam_id = ? AND student_id = ?`,
      [exam_id, student_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Enrollment not found" });
    }

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, description) VALUES (?, ?, ?)`,
      [req.user.id, 'REMOVE_ENROLLMENT', `Removed student ${student_id} from exam ${exam_id}`]
    );

    res.json({ success: true, message: "Enrollment removed successfully" });
  } catch (error) {
    console.error("Remove enrollment error:", error);
    res.status(500).json({ success: false, message: "Failed to remove enrollment" });
  }
};

module.exports = {
  getEnrollments,
  bulkEnroll,
  removeEnrollment
};
