const pool = require("../db");

const generateDualSeating = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { exam_ids } = req.body;
    if (!Array.isArray(exam_ids) || exam_ids.length !== 2) {
      return res.status(400).json({ success: false, message: "Exactly two exam_ids required for dual seating" });
    }

    await connection.beginTransaction();

    // Fetch both exams
    const [exams] = await connection.query(
      `SELECT e.id, s.department_id, e.status FROM exams e JOIN subjects s ON e.subject_id = s.id WHERE e.id IN (?, ?)`,
      exam_ids
    );
    if (exams.length !== 2) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "One or both exams not found" });
    }

    // Get students for both exams
    const studentsByExam = {};
    for (const exam of exams) {
      const [students] = await connection.query(`
        SELECT st.id, st.register_number, st.name
        FROM exam_enrollments ee
        JOIN students st ON ee.student_id = st.id
        WHERE ee.exam_id = ? AND st.department_id = ?
        ORDER BY st.register_number
      `, [exam.id, exam.department_id]);
      
      const [existing] = await connection.query(`SELECT student_id FROM seating_assignments WHERE exam_id = ?`, [exam.id]);
      const existingSet = new Set(existing.map(r => Number(r.student_id)));
      
      studentsByExam[exam.id] = students.filter(s => !existingSet.has(Number(s.id)));
    }

    const students1 = studentsByExam[exam_ids[0]];
    const students2 = studentsByExam[exam_ids[1]];
    
    if (students1.length === 0 && students2.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "No unassigned students for both exams" });
    }

    // Get all free seats
    const [allSeats] = await connection.query(`
      SELECT se.id AS seat_id, se.hall_id, h.capacity
      FROM seats se
      JOIN halls h ON se.hall_id = h.id
      WHERE h.status = 'available'
      ORDER BY h.id, se.seat_row, se.seat_column
    `);

    // Assign in interleaved pattern
    let i1 = 0, i2 = 0;
    let seatIdx = 0;
    
    while ((i1 < students1.length || i2 < students2.length) && seatIdx < allSeats.length) {
      const seat = allSeats[seatIdx];
      
      if (seatIdx % 2 === 0 && i1 < students1.length) {
        await connection.query(
          `INSERT INTO seating_assignments (exam_id, student_id, hall_id, seat_id) VALUES (?, ?, ?, ?)`,
          [exam_ids[0], students1[i1].id, seat.hall_id, seat.seat_id]
        );
        i1++;
        seatIdx++;
      } else if (seatIdx % 2 === 1 && i2 < students2.length) {
        await connection.query(
          `INSERT INTO seating_assignments (exam_id, student_id, hall_id, seat_id) VALUES (?, ?, ?, ?)`,
          [exam_ids[1], students2[i2].id, seat.hall_id, seat.seat_id]
        );
        i2++;
        seatIdx++;
      } else if (i1 < students1.length) {
        await connection.query(
          `INSERT INTO seating_assignments (exam_id, student_id, hall_id, seat_id) VALUES (?, ?, ?, ?)`,
          [exam_ids[0], students1[i1].id, seat.hall_id, seat.seat_id]
        );
        i1++;
        seatIdx++;
      } else if (i2 < students2.length) {
        await connection.query(
          `INSERT INTO seating_assignments (exam_id, student_id, hall_id, seat_id) VALUES (?, ?, ?, ?)`,
          [exam_ids[1], students2[i2].id, seat.hall_id, seat.seat_id]
        );
        i2++;
        seatIdx++;
      }
    }

    if (i1 < students1.length || i2 < students2.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Not enough seats for dual allocation" });
    }

    await connection.commit();
    res.json({ success: true, message: "Dual seating generated successfully" });

  } catch (error) {
    await connection.rollback();
    console.error("Dual seating error:", error);
    res.status(500).json({ success: false, message: "Failed to generate dual seating" });
  } finally {
    connection.release();
  }
};

module.exports = { generateDualSeating };
