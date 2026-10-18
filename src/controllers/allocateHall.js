const pool = require("../db");

const allocateHall = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      hall_id,
      exam1_id,
      exam2_id,
      year,
      dept1_code,
      start_reg1,
      end_reg1,
      dept2_code,
      start_reg2,
      end_reg2,
      invigilator1_id,
      invigilator2_id,
    } = req.body;

    if (!hall_id || !exam1_id || !exam2_id || !dept1_code || !dept2_code || !start_reg1 || !end_reg1 || !start_reg2 || !end_reg2 || !invigilator1_id || !invigilator2_id) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }
    if (dept1_code === dept2_code) {
      return res.status(400).json({ success: false, message: "Departments must be different." });
    }
    if (invigilator1_id === invigilator2_id) {
      return res.status(400).json({ success: false, message: "Invigilators must be different." });
    }

    await connection.beginTransaction();

    // Validate hall and capacity
    const [halls] = await connection.query(`SELECT * FROM halls WHERE id = ? FOR UPDATE`, [hall_id]);
    if (halls.length === 0) throw new Error("Hall not found.");
    const hall = halls[0];
    if (hall.status !== 'available') throw new Error(`Hall is ${hall.status}, not available.`);
    
    // Validate invigilators
    const [staffs] = await connection.query(
      `SELECT * FROM staff WHERE id IN (?, ?)`,
      [invigilator1_id, invigilator2_id]
    );
    if (staffs.length !== 2) throw new Error("One or both invigilators not found.");
    if (staffs[0].department_id === staffs[1].department_id) {
      throw new Error("Invigilators must belong to different departments.");
    }

    // Fetch unassigned students for Dept 1
    const [students1] = await connection.query(`
      SELECT st.id, st.register_number, st.name, st.department_id, d.code as dept_code, ? as assigned_exam_id
      FROM exam_enrollments ee
      JOIN students st ON ee.student_id = st.id
      JOIN departments d ON st.department_id = d.id
      WHERE ee.exam_id = ? AND d.code = ?
      AND st.register_number >= ? AND st.register_number <= ?
      AND st.id NOT IN (SELECT student_id FROM seating_assignments WHERE exam_id = ?)
      ORDER BY st.register_number ASC
    `, [exam1_id, exam1_id, dept1_code, start_reg1, end_reg1, exam1_id]);

    // Fetch unassigned students for Dept 2
    const [students2] = await connection.query(`
      SELECT st.id, st.register_number, st.name, st.department_id, d.code as dept_code, ? as assigned_exam_id
      FROM exam_enrollments ee
      JOIN students st ON ee.student_id = st.id
      JOIN departments d ON st.department_id = d.id
      WHERE ee.exam_id = ? AND d.code = ?
      AND st.register_number >= ? AND st.register_number <= ?
      AND st.id NOT IN (SELECT student_id FROM seating_assignments WHERE exam_id = ?)
      ORDER BY st.register_number ASC
    `, [exam2_id, exam2_id, dept2_code, start_reg2, end_reg2, exam2_id]);
    
    const totalRequired = students1.length + students2.length;
    if (totalRequired === 0) {
        throw new Error("No unassigned students found in the given register number ranges.");
    }
    
    if (totalRequired > hall.capacity) {
      throw new Error(`Total students (${totalRequired}) exceeds hall capacity (${hall.capacity}).`);
    }

    // Get seats in deterministic order
    const [seats] = await connection.query(`
      SELECT id, seat_row, seat_column 
      FROM seats 
      WHERE hall_id = ? 
      ORDER BY seat_row, seat_column
    `, [hall_id]);

    if (seats.length < totalRequired) {
      throw new Error("Not enough physical seats mapped in the database for this hall.");
    }

    // Consecutive two-department arrangement (e.g. 1 from D1, 1 from D2, interleaved)
    let i1 = 0;
    let i2 = 0;
    let seatIdx = 0;
    const assignments = [];

    while (i1 < students1.length || i2 < students2.length) {
      const seat = seats[seatIdx];
      if (seatIdx % 2 === 0 && i1 < students1.length) {
        assignments.push({ student: students1[i1], seat });
        i1++;
      } else if (seatIdx % 2 === 1 && i2 < students2.length) {
        assignments.push({ student: students2[i2], seat });
        i2++;
      } else if (i1 < students1.length) {
        assignments.push({ student: students1[i1], seat });
        i1++;
      } else if (i2 < students2.length) {
        assignments.push({ student: students2[i2], seat });
        i2++;
      }
      seatIdx++;
    }

    // Insert seating assignments
    for (const a of assignments) {
      await connection.query(
        `INSERT INTO seating_assignments (exam_id, student_id, hall_id, seat_id) VALUES (?, ?, ?, ?)`,
        [a.student.assigned_exam_id, a.student.id, hall_id, a.seat.id]
      );
    }

    // Assign Invigilators. Assign them to exam1_id as the primary reference for this hall's time slot.
    await connection.query(
      `INSERT INTO invigilations (exam_id, hall_id, staff_id, assignment_slot, status) VALUES (?, ?, ?, 1, 'assigned')`,
      [exam1_id, hall_id, invigilator1_id]
    );
    await connection.query(
      `INSERT INTO invigilations (exam_id, hall_id, staff_id, assignment_slot, status) VALUES (?, ?, ?, 2, 'assigned')`,
      [exam1_id, hall_id, invigilator2_id]
    );

    // Update Hall Status
    await connection.query(
      `UPDATE halls SET status = 'unavailable' WHERE id = ?`,
      [hall_id]
    );

    // Create Audit Log
    const userId = req.user?.id || null;
    await connection.query(
      `INSERT INTO audit_logs (user_id, action, description) VALUES (?, ?, ?)`,
      [userId, 'ALLOCATE_HALL', `Allocated hall ${hall.hall_number} for exams ${exam1_id} & ${exam2_id} (${students1.length} ${dept1_code}, ${students2.length} ${dept2_code})`]
    );

    // Create Notification
    await connection.query(
      `INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`,
      [req.user.id, 'Hall Allocated', `Hall ${hall.hall_number} allocated successfully for ${students1.length + students2.length} students.`]
    );

    await connection.commit();

    // Fetch final result to send back
    const [finalAssignments] = await connection.query(`
      SELECT sa.id, st.register_number, st.name as student_name, d.code as dept_code,
             s.seat_row, s.seat_column
      FROM seating_assignments sa
      JOIN students st ON sa.student_id = st.id
      JOIN departments d ON st.department_id = d.id
      JOIN seats s ON sa.seat_id = s.id
      WHERE sa.hall_id = ? AND (sa.exam_id = ? OR sa.exam_id = ?)
      ORDER BY s.seat_row, s.seat_column
    `, [hall_id, exam1_id, exam2_id]);

    const [finalInvigilators] = await connection.query(`
      SELECT i.assignment_slot, st.name, d.code as department_code
      FROM invigilations i
      JOIN staff st ON i.staff_id = st.id
      LEFT JOIN departments d ON st.department_id = d.id
      WHERE i.hall_id = ? AND i.exam_id = ?
    `, [hall_id, exam1_id]);

    res.json({
      success: true,
      message: "Hall allocated successfully.",
      data: {
        hall: hall.hall_number,
        capacity: hall.capacity,
        students: finalAssignments,
        invigilators: finalInvigilators
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error("Hall allocation error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to allocate hall." });
  } finally {
    connection.release();
  }
};

module.exports = { allocateHall };
