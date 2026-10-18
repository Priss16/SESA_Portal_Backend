const pool = require("../db");

// GET /api/invigilations
const getInvigilations = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        i.id, i.exam_id, i.hall_id, i.staff_id, i.assignment_slot, i.status, i.assigned_by, i.assigned_at,
        e.exam_date, e.start_time, e.end_time, e.status AS exam_status,
        s.code AS subject_code, s.name AS subject_name,
        h.hall_number, h.name AS hall_name,
        st.name AS staff_name, st.department_id AS staff_department_id
      FROM invigilations i
      INNER JOIN exams e ON i.exam_id = e.id
      INNER JOIN subjects s ON e.subject_id = s.id
      INNER JOIN halls h ON i.hall_id = h.id
      INNER JOIN staff st ON i.staff_id = st.id
      ORDER BY e.exam_date DESC, e.start_time DESC, h.hall_number ASC, i.assignment_slot ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Get invigilations error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch invigilations" });
  }
};

// GET /api/invigilations/my
const getMyInvigilations = async (req, res) => {
  try {
    const userId = req.user.id;
    // Map users.id -> staff.user_id
    const [staffRows] = await pool.query(`SELECT id FROM staff WHERE user_id = ?`, [userId]);
    if (staffRows.length === 0) {
      return res.status(404).json({ success: false, message: "Staff record not found for this user" });
    }
    const staffId = staffRows[0].id;

    const [rows] = await pool.query(`
      SELECT 
        i.id AS invigilation_id, i.exam_id, i.hall_id, i.assignment_slot, i.status AS assignment_status, i.assigned_at,
        e.exam_date, e.start_time, e.end_time, e.status AS exam_status,
        s.code AS subject_code, s.name AS subject_name,
        h.hall_number, h.name AS hall_name, h.building, h.floor
      FROM invigilations i
      INNER JOIN exams e ON i.exam_id = e.id
      INNER JOIN subjects s ON e.subject_id = s.id
      INNER JOIN halls h ON i.hall_id = h.id
      WHERE i.staff_id = ?
      ORDER BY e.exam_date ASC, e.start_time ASC
    `, [staffId]);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Get my invigilations error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch your invigilations" });
  }
};

// POST /api/invigilations/assign
const assignInvigilation = async (req, res) => {
  try {
    const { exam_id, hall_id, staff_id, assignment_slot } = req.body;
    
    if (!exam_id || !hall_id || !staff_id || !assignment_slot) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (assignment_slot !== 1 && assignment_slot !== 2) {
      return res.status(400).json({ success: false, message: "Assignment slot must be 1 or 2" });
    }

    const [examRows] = await pool.query("SELECT id FROM exams WHERE id = ?", [exam_id]);
    if (examRows.length === 0) return res.status(404).json({ success: false, message: "Exam not found" });

    const [hallRows] = await pool.query("SELECT id FROM halls WHERE id = ?", [hall_id]);
    if (hallRows.length === 0) return res.status(404).json({ success: false, message: "Hall not found" });

    const [staffRows] = await pool.query("SELECT id FROM staff WHERE id = ?", [staff_id]);
    if (staffRows.length === 0) return res.status(404).json({ success: false, message: "Staff not found" });

    // Check if staff is already assigned to this exam
    const [existingStaffAssignment] = await pool.query(`
      SELECT id FROM invigilations WHERE exam_id = ? AND staff_id = ?
    `, [exam_id, staff_id]);
    if (existingStaffAssignment.length > 0) {
      return res.status(400).json({ success: false, message: "Staff member is already assigned to this exam" });
    }

    // Check if slot is taken
    const [existingSlot] = await pool.query(`
      SELECT id FROM invigilations WHERE exam_id = ? AND hall_id = ? AND assignment_slot = ?
    `, [exam_id, hall_id, assignment_slot]);
    if (existingSlot.length > 0) {
      return res.status(400).json({ success: false, message: "This slot is already assigned for the given hall and exam" });
    }

    const [result] = await pool.query(`
      INSERT INTO invigilations (exam_id, hall_id, staff_id, assignment_slot, assigned_by)
      VALUES (?, ?, ?, ?, ?)
    `, [exam_id, hall_id, staff_id, assignment_slot, req.user.id]);

    const { sendNotificationEmail } = require('../utils/mailer');
    const [staffDetails] = await pool.query(`
      SELECT s.user_id, s.name, s.email, h.hall_number, e.exam_date, e.start_time 
      FROM staff s, halls h, exams e
      WHERE s.id = ? AND h.id = ? AND e.id = ?
    `, [staff_id, hall_id, exam_id]);

    if (staffDetails.length > 0) {
      const details = staffDetails[0];
      const dateStr = new Date(details.exam_date).toLocaleDateString();
      const message = `You have been assigned to invigilate Hall ${details.hall_number} on ${dateStr} at ${details.start_time}.`;
      
      if (details.user_id) {
        await pool.query('INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)', [details.user_id, 'New Invigilation Duty', message]);
      }
      if (details.email) {
        await sendNotificationEmail(details.email, 'New Invigilation Duty', message);
      }
    }

    res.json({ success: true, message: "Invigilation assigned successfully", data: { id: result.insertId } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: "Duplicate entry for invigilation assignment" });
    }
    console.error("Assign invigilation error:", error);
    res.status(500).json({ success: false, message: "Failed to assign invigilation" });
  }
};

// GET /api/invigilations/exam/:exam_id
const getExamInvigilations = async (req, res) => {
  try {
    const examId = req.params.exam_id;
    
    // First, find all halls that have students assigned for this exam, or halls explicitly assigned via invigilations
    // Some halls might have invigilators assigned without students yet, or students without invigilators
    const [hallsForExam] = await pool.query(`
      SELECT DISTINCT h.id AS hall_id, h.hall_number
      FROM seating_assignments sa
      INNER JOIN halls h ON sa.hall_id = h.id
      WHERE sa.exam_id = ?
      UNION
      SELECT DISTINCT h.id AS hall_id, h.hall_number
      FROM invigilations i
      INNER JOIN halls h ON i.hall_id = h.id
      WHERE i.exam_id = ?
    `, [examId, examId]);

    // Fetch all invigilation assignments for this exam
    const [assignments] = await pool.query(`
      SELECT i.hall_id, i.staff_id, i.assignment_slot, s.name AS staff_name
      FROM invigilations i
      INNER JOIN staff s ON i.staff_id = s.id
      WHERE i.exam_id = ?
    `, [examId]);

    const result = hallsForExam.map(hall => {
      const hallAssignments = assignments.filter(a => a.hall_id === hall.hall_id);
      return {
        hall_id: hall.hall_id,
        hall_number: hall.hall_number,
        invigilators: hallAssignments.map(a => ({
          staff_id: a.staff_id,
          staff_name: a.staff_name,
          slot: a.assignment_slot
        })),
        invigilator_count: hallAssignments.length,
        complete: hallAssignments.length === 2
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Get exam invigilations error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch exam invigilations" });
  }
};

// DELETE /api/invigilations/:id
const deleteInvigilation = async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM invigilations WHERE id = ?", [id]);
    res.json({ success: true, message: "Invigilation assignment removed" });
  } catch (error) {
    console.error("Delete invigilation error:", error);
    res.status(500).json({ success: false, message: "Failed to remove assignment" });
  }
};

// POST /api/invigilations
const createInvigilation = async (req, res) => {
  return assignInvigilation(req, res); // Alias to match req
};

module.exports = {
  getInvigilations,
  getMyInvigilations,
  assignInvigilation,
  createInvigilation,
  getExamInvigilations,
  deleteInvigilation
};
