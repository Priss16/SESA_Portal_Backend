const pool = require("../db");

// POST /api/invigilation-substitutions
const createSubstitutionRequest = async (req, res) => {
  try {
    const { invigilation_id, replacement_staff_id, reason } = req.body;
    
    if (!invigilation_id || !replacement_staff_id || !reason) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const userId = req.user.id;
    // Get staff ID of current user
    const [staffRows] = await pool.query("SELECT id FROM staff WHERE user_id = ?", [userId]);
    if (staffRows.length === 0) {
      return res.status(404).json({ success: false, message: "Staff record not found" });
    }
    const requesterStaffId = staffRows[0].id;

    if (requesterStaffId === replacement_staff_id) {
      return res.status(400).json({ success: false, message: "Cannot substitute yourself" });
    }

    // Verify invigilation assignment belongs to staff
    const [invigilationRows] = await pool.query("SELECT id, exam_id FROM invigilations WHERE id = ? AND staff_id = ?", [invigilation_id, requesterStaffId]);
    if (invigilationRows.length === 0) {
      return res.status(403).json({ success: false, message: "Invigilation assignment not found or doesn't belong to you" });
    }

    // Verify replacement staff exists
    const [repStaffRows] = await pool.query("SELECT id FROM staff WHERE id = ?", [replacement_staff_id]);
    if (repStaffRows.length === 0) {
      return res.status(400).json({ success: false, message: "Replacement staff not found" });
    }

    // Check for existing pending request
    const [existingRequest] = await pool.query("SELECT id FROM invigilation_substitution_requests WHERE invigilation_id = ? AND status = 'pending'", [invigilation_id]);
    if (existingRequest.length > 0) {
      return res.status(400).json({ success: false, message: "A pending substitution request already exists for this invigilation" });
    }

    const [result] = await pool.query(`
      INSERT INTO invigilation_substitution_requests 
      (invigilation_id, requester_staff_id, replacement_staff_id, reason)
      VALUES (?, ?, ?, ?)
    `, [invigilation_id, requesterStaffId, replacement_staff_id, reason]);

    // Update invigilation status to substitution_pending
    await pool.query("UPDATE invigilations SET status = 'substitution_pending' WHERE id = ?", [invigilation_id]);

    res.json({ success: true, message: "Substitution request submitted successfully", data: { id: result.insertId } });
  } catch (error) {
    console.error("Create substitution request error:", error);
    res.status(500).json({ success: false, message: "Failed to submit request" });
  }
};

// GET /api/invigilation-substitutions/my
const getMySubstitutionRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const [staffRows] = await pool.query("SELECT id FROM staff WHERE user_id = ?", [userId]);
    if (staffRows.length === 0) {
      return res.status(404).json({ success: false, message: "Staff record not found" });
    }
    const staffId = staffRows[0].id;

    const [rows] = await pool.query(`
      SELECT 
        isr.id AS request_id, isr.reason, isr.status, isr.requested_at, isr.principal_remarks, isr.decision_at,
        i.exam_id, e.exam_date, e.start_time, e.end_time,
        s.name AS subject_name, s.code AS subject_code,
        h.hall_number,
        st_req.name AS requester_name,
        st_rep.name AS replacement_name
      FROM invigilation_substitution_requests isr
      INNER JOIN invigilations i ON isr.invigilation_id = i.id
      INNER JOIN exams e ON i.exam_id = e.id
      INNER JOIN subjects s ON e.subject_id = s.id
      INNER JOIN halls h ON i.hall_id = h.id
      INNER JOIN staff st_req ON isr.requester_staff_id = st_req.id
      INNER JOIN staff st_rep ON isr.replacement_staff_id = st_rep.id
      WHERE isr.requester_staff_id = ?
      ORDER BY isr.requested_at DESC
    `, [staffId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Get my substitution requests error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch requests" });
  }
};

// GET /api/invigilation-substitutions
const getAllSubstitutionRequests = async (req, res) => {
  try {
    const { status, exam_id } = req.query;
    
    let query = `
      SELECT 
        isr.id, isr.invigilation_id, isr.reason, isr.status, isr.requested_at, isr.principal_remarks, isr.decision_at,
        i.exam_id, e.exam_date, e.start_time, e.end_time,
        s.name AS subject_name, s.code AS subject_code,
        h.hall_number,
        st_req.name AS requester_name,
        st_rep.name AS replacement_name
      FROM invigilation_substitution_requests isr
      INNER JOIN invigilations i ON isr.invigilation_id = i.id
      INNER JOIN exams e ON i.exam_id = e.id
      INNER JOIN subjects s ON e.subject_id = s.id
      INNER JOIN halls h ON i.hall_id = h.id
      INNER JOIN staff st_req ON isr.requester_staff_id = st_req.id
      INNER JOIN staff st_rep ON isr.replacement_staff_id = st_rep.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += " AND isr.status = ?";
      params.push(status);
    }
    
    if (exam_id) {
      query += " AND i.exam_id = ?";
      params.push(exam_id);
    }

    query += " ORDER BY isr.requested_at DESC";

    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Get all substitution requests error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch requests" });
  }
};

// PATCH /api/invigilation-substitutions/:id/approve
const approveSubstitutionRequest = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const principalId = req.user.id;

    await connection.beginTransaction();

    const [requestRows] = await connection.query("SELECT * FROM invigilation_substitution_requests WHERE id = ? FOR UPDATE", [id]);
    if (requestRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    
    const request = requestRows[0];
    if (request.status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Request is not pending" });
    }

    const [invigilationRows] = await connection.query("SELECT * FROM invigilations WHERE id = ? FOR UPDATE", [request.invigilation_id]);
    if (invigilationRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Invigilation assignment no longer exists" });
    }
    const invigilation = invigilationRows[0];

    const [repStaffRows] = await connection.query("SELECT id FROM staff WHERE id = ?", [request.replacement_staff_id]);
    if (repStaffRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Replacement staff not found" });
    }

    // Verify replacement staff is not already assigned to another hall for the same exam
    const [conflictRows] = await connection.query(
      "SELECT id FROM invigilations WHERE exam_id = ? AND staff_id = ?", 
      [invigilation.exam_id, request.replacement_staff_id]
    );
    if (conflictRows.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Replacement staff is already assigned to this exam" });
    }

    // Approve the request
    await connection.query(`
      UPDATE invigilation_substitution_requests 
      SET status = 'approved', principal_id = ?, principal_remarks = ?, decision_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [principalId, remarks || null, id]);

    // Update the invigilation assignment
    await connection.query(`
      UPDATE invigilations 
      SET staff_id = ?, status = 'substituted' 
      WHERE id = ?
    `, [request.replacement_staff_id, request.invigilation_id]);

    await connection.commit();
    res.json({ success: true, message: "Substitution approved successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Approve substitution request error:", error);
    res.status(500).json({ success: false, message: "Failed to approve request" });
  } finally {
    connection.release();
  }
};

// PATCH /api/invigilation-substitutions/:id/reject
const rejectSubstitutionRequest = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const principalId = req.user.id;

    await connection.beginTransaction();

    const [requestRows] = await connection.query("SELECT * FROM invigilation_substitution_requests WHERE id = ? FOR UPDATE", [id]);
    if (requestRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    
    const request = requestRows[0];
    if (request.status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Request is not pending" });
    }

    // Reject the request
    await connection.query(`
      UPDATE invigilation_substitution_requests 
      SET status = 'rejected', principal_id = ?, principal_remarks = ?, decision_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [principalId, remarks || null, id]);

    // Revert invigilation status
    await connection.query(`
      UPDATE invigilations 
      SET status = 'assigned' 
      WHERE id = ?
    `, [request.invigilation_id]);

    await connection.commit();
    res.json({ success: true, message: "Substitution rejected successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Reject substitution request error:", error);
    res.status(500).json({ success: false, message: "Failed to reject request" });
  } finally {
    connection.release();
  }
};

module.exports = {
  createSubstitutionRequest,
  getMySubstitutionRequests,
  getAllSubstitutionRequests,
  approveSubstitutionRequest,
  rejectSubstitutionRequest
};
