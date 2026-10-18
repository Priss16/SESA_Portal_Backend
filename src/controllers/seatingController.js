const pool = require("../db");

// --------------------------------------------------
// GET SEATING FOR ONE EXAM
// GET /api/seating?exam_id=3
// --------------------------------------------------

const getSeating = async (req, res) => {
  try {
    const { exam_id } = req.query;
    const examIdNum = Number(exam_id);

    if (!exam_id || !Number.isInteger(examIdNum) || examIdNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "exam_id is required and must be a positive integer",
      });
    }

    const [examRows] = await pool.query(
      `
      SELECT e.id, s.department_id
      FROM exams e
      INNER JOIN subjects s ON e.subject_id = s.id
      WHERE e.id = ?
      `,
      [examIdNum]
    );

    if (examRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    const examDepartmentId = examRows[0].department_id;
    const userId = req.user.id;

    const [userRows] = await pool.query(
      `
      SELECT id, role, department_id
      FROM users
      WHERE id = ?
      `,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const dbUser = userRows[0];
    const role = dbUser.role;

    if (role === "student") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (role === "hod" || role === "staff") {
      if (!dbUser.department_id) {
        return res.status(403).json({
          success: false,
          message: "Department is required for this role",
        });
      }

      let isAllowed = false;

      if (dbUser.department_id === examDepartmentId) {
        isAllowed = true;
      }

      if (!isAllowed && role === "staff") {
        const [staffRows] = await pool.query('SELECT id FROM staff WHERE user_id = ?', [userId]);
        if (staffRows.length > 0) {
          const [invigRows] = await pool.query('SELECT id FROM invigilations WHERE staff_id = ? AND exam_id = ?', [staffRows[0].id, examIdNum]);
          if (invigRows.length > 0) {
            isAllowed = true;
          }
        }
      }

      if (!isAllowed) {
        return res.json({
          success: true,
          data: [],
        });
      }
    }

    const [rows] = await pool.query(
      `
      SELECT
        sa.id,
        sa.exam_id,
        sa.student_id,
        sa.hall_id,
        sa.seat_id,
        st.register_number,
        st.name AS student_name,
        h.hall_number,
        h.name AS hall_name,
        se.seat_number,
        se.seat_row,
        se.seat_column,
        d.name AS department_name,
        d.code AS department_code,
        sa.created_at
      FROM seating_assignments sa
      INNER JOIN students st ON sa.student_id = st.id
      INNER JOIN halls h ON sa.hall_id = h.id
      INNER JOIN seats se ON sa.seat_id = se.id
      LEFT JOIN departments d ON st.department_id = d.id
      WHERE sa.exam_id = ?
      ORDER BY h.hall_number, se.seat_row, se.seat_column;
      `,
      [examIdNum]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Get seating error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch seating",
    });
  }
};// --------------------------------------------------
// GET MY SEATING
// GET /api/seating/my
//
// Student can see only their own exam hall + seat.
// Identity comes from the verified JWT.
// Optional query:
// /api/seating/my?exam_id=3
// --------------------------------------------------

const getMySeating = async (req, res) => {
  try {
    // Only students can use this endpoint.
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is available to students only",
      });
    }

    const userId = Number(req.user.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid student identity",
      });
    }

    const { exam_id } = req.query;

    let examCondition = "";
    const queryParams = [userId];

    if (exam_id !== undefined) {
      const examId = Number(exam_id);

      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid exam_id",
        });
      }

      examCondition = `
        AND e.id = ?
      `;

      queryParams.push(examId);
    }

    const [rows] = await pool.query(
      `
      SELECT
        sa.id AS assignment_id,

        e.id AS exam_id,
        s.code AS subject_code,
        s.name AS subject_name,
        e.exam_date,
        e.start_time,
        e.end_time,
        e.status,

        st.id AS student_id,
        st.register_number,
        st.name AS student_name,

        d.code AS department_code,
        d.name AS department_name,

        h.id AS hall_id,
        h.hall_number,
        h.name AS hall_name,
        h.building,
        h.floor,

        se.id AS seat_id,
        se.seat_number,
        se.seat_row,
        se.seat_column,

        sa.created_at AS assigned_at

      FROM users u

      INNER JOIN students st
        ON st.user_id = u.id

      INNER JOIN seating_assignments sa
        ON sa.student_id = st.id

      INNER JOIN exams e
        ON sa.exam_id = e.id

      INNER JOIN subjects s
        ON e.subject_id = s.id

      LEFT JOIN departments d
        ON st.department_id = d.id

      INNER JOIN halls h
        ON sa.hall_id = h.id

      INNER JOIN seats se
        ON sa.seat_id = se.id

      WHERE u.id = ?
        ${examCondition}

      ORDER BY
        e.exam_date ASC,
        e.start_time ASC,
        sa.id ASC
      `,
      queryParams
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Get my seating error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your seating",
    });
  }
};

// --------------------------------------------------
// GENERATE SEATING
// POST /api/seating/generate
// --------------------------------------------------

const generateSeating = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { exam_id } = req.body;

    if (!exam_id) {
      return res.status(400).json({
        success: false,
        message: "exam_id is required",
      });
    }

    await connection.beginTransaction();

    // ------------------------------------------------
    // 1. Get exam + subject information
    // ------------------------------------------------

    const [examRows] = await connection.query(
      `
      SELECT
        e.id,
        e.subject_id,
        e.status,

        s.code AS subject_code,
        s.name AS subject_name,
        s.department_id,
        s.semester

      FROM exams e

      INNER JOIN subjects s
        ON e.subject_id = s.id

      WHERE e.id = ?
      `,
      [exam_id]
    );

    if (examRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Exam not found",
      });
    }

    const exam = examRows[0];

    // ------------------------------------------------
    // 2. Prevent allocation for cancelled exams
    // ------------------------------------------------

    if (exam.status === "cancelled") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Seating cannot be generated for a cancelled exam",
      });
    }

   // ------------------------------------------------
// 3. Find eligible students.
//
// Prefer department + semester matching.
// If no students match, fall back to all students
// because this project currently has no
// student-subject enrollment table.
// ------------------------------------------------

// ------------------------------------------------
// 3. Find enrolled students for this exam.
//
// Seating eligibility comes ONLY from
// exam_enrollments.
//
// Do NOT fall back to all students.
// ------------------------------------------------

const [students] = await connection.query(
  `
  SELECT
    st.id,
    st.register_number,
    st.name,
    st.department_id,
    st.year,
    st.semester

  FROM exam_enrollments ee

  INNER JOIN students st
    ON ee.student_id = st.id

  WHERE ee.exam_id = ?
    AND st.department_id = ?

  ORDER BY
    st.register_number,
    st.id
  `,
  [
    exam_id,
    exam.department_id,
  ]
);

if (students.length === 0) {
  await connection.rollback();

  return res.status(400).json({
    success: false,
    message:
      "No students are enrolled for this exam",
  });
}    // ------------------------------------------------
    // 4. Find students who are already assigned
    //    to this exam.
    // ------------------------------------------------

    const [existingStudentRows] =
      await connection.query(
        `
        SELECT DISTINCT student_id
        FROM seating_assignments
        WHERE exam_id = ?
        `,
        [exam_id]
      );

    const assignedStudentIds =
      new Set(
        existingStudentRows.map(
          (row) => Number(row.student_id)
        )
      );

    const pendingStudents =
      students.filter(
        (student) =>
          !assignedStudentIds.has(
            Number(student.id)
          )
      );

    // ------------------------------------------------
    // 5. Find already-used seats for this exam.
    // ------------------------------------------------

    const [existingSeatRows] =
      await connection.query(
        `
        SELECT DISTINCT seat_id
        FROM seating_assignments
        WHERE exam_id = ?
        `,
        [exam_id]
      );

    const assignedSeatIds =
      new Set(
        existingSeatRows.map(
          (row) => Number(row.seat_id)
        )
      );

    // ------------------------------------------------
    // 6. Find free seats.
    //
    //    Prefer halls assigned to the exam
    //    subject's department.
    // ------------------------------------------------

    const [departmentSeats] =
      await connection.query(
        `
        SELECT
          se.id AS seat_id,
          se.hall_id,
          se.seat_row,
          se.seat_column,
          se.seat_number,

          h.hall_number,
          h.name AS hall_name,
          h.capacity,

          hd.department_id

        FROM seats se

        INNER JOIN halls h
          ON se.hall_id = h.id

        INNER JOIN hall_departments hd
          ON h.id = hd.hall_id

        WHERE h.status = 'available'
          AND hd.department_id = ?

        ORDER BY
          h.id,
          se.seat_row,
          se.seat_column
        `,
        [exam.department_id]
      );

    // ------------------------------------------------
    // 7. If no department-specific seats exist,
    //    use any available hall.
    //
    //    This fallback keeps the local demo usable
    //    even when hall_departments has not been
    //    populated for every hall.
    // ------------------------------------------------

    let availableSeats =
      departmentSeats.filter(
        (seat) =>
          !assignedSeatIds.has(
            Number(seat.seat_id)
          )
      );

    if (availableSeats.length === 0) {
      const [allSeats] =
        await connection.query(
          `
          SELECT
            se.id AS seat_id,
            se.hall_id,
            se.seat_row,
            se.seat_column,
            se.seat_number,

            h.hall_number,
            h.name AS hall_name,
            h.capacity

          FROM seats se

          INNER JOIN halls h
            ON se.hall_id = h.id

          WHERE h.status = 'available'

          ORDER BY
            h.id,
            se.seat_row,
            se.seat_column
          `
        );

      availableSeats =
        allSeats.filter(
          (seat) =>
            !assignedSeatIds.has(
              Number(seat.seat_id)
            )
        );
    }

    if (
      availableSeats.length <
      pendingStudents.length
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Not enough available seats for all eligible students",
        data: {
          eligible_students:
            students.length,
          already_assigned:
            assignedStudentIds.size,
          students_to_assign:
            pendingStudents.length,
          available_seats:
            availableSeats.length,
        },
      });
    }

    // ------------------------------------------------
    // 8. Assign students to seats
    // ------------------------------------------------

    const createdAssignments = [];

    for (
      let i = 0;
      i < pendingStudents.length;
      i++
    ) {
      const student =
        pendingStudents[i];

      const seat =
        availableSeats[i];

      await connection.query(
        `
        INSERT INTO seating_assignments
        (
          exam_id,
          student_id,
          hall_id,
          seat_id
        )
        VALUES (?, ?, ?, ?)
        `,
        [
          Number(exam_id),
          Number(student.id),
          Number(seat.hall_id),
          Number(seat.seat_id),
        ]
      );

      createdAssignments.push({
        student_id: student.id,
        register_number:
          student.register_number,
        student_name: student.name,

        hall_id: seat.hall_id,
        hall_number:
          seat.hall_number,

        seat_id: seat.seat_id,
        seat_number:
          seat.seat_number,
      });
    }

    await connection.commit();

    // ------------------------------------------------
    // 8.5 Send email and notifications to newly assigned students
    // ------------------------------------------------
    if (createdAssignments.length > 0) {
      const { sendNotificationEmail } = require('../utils/mailer');
      const PDFDocument = require('pdfkit');
      
      const [examDetails] = await pool.query(`SELECT exam_date, start_time, subject_id FROM exams WHERE id = ?`, [exam_id]);
      const eDate = examDetails.length > 0 ? new Date(examDetails[0].exam_date).toLocaleDateString() : '';
      const eTime = examDetails.length > 0 ? examDetails[0].start_time : '';
      
      let subjectName = '';
      if (examDetails.length > 0) {
        const [subjDetails] = await pool.query(`SELECT name, code FROM subjects WHERE id = ?`, [examDetails[0].subject_id]);
        if (subjDetails.length > 0) {
          subjectName = `${subjDetails[0].name} (${subjDetails[0].code})`;
        }
      }
      
      for (const assignment of createdAssignments) {
        const [studentDetails] = await pool.query(`
          SELECT u.id as user_id, u.email 
          FROM students st
          JOIN users u ON st.user_id = u.id
          WHERE st.id = ?
        `, [assignment.student_id]);
        
        if (studentDetails.length > 0) {
          const s = studentDetails[0];
          const message = `Your hall plan for the exam on ${eDate} at ${eTime} has been allotted. You are assigned to Hall ${assignment.hall_number}, Seat ${assignment.seat_number}.`;
          
          if (s.user_id) {
            await pool.query('INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)', [s.user_id, 'Hall Plan Allotted', message]);
          }
          if (s.email) {
            // Generate PDF
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            const pdfPromise = new Promise((resolve) => {
              doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
              });
            });

            // --- College Header ---
            doc.font('Helvetica-Bold')
               .fontSize(14)
               .text('NATIONAL ENGINEERING COLLEGE, K.R.Nagar, Kovilpatti- 628 503', { align: 'center' });
            
            doc.font('Helvetica')
               .fontSize(10)
               .text('(An Autonomous Institution - Affiliated to Anna University, Chennai)', { align: 'center' });
            
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold')
               .fontSize(12)
               .text('OFFICE OF THE CONTROLLER OF EXAMINATIONS', { align: 'center' });
            
            doc.moveDown(0.5);
            doc.fillColor('#0056b3') // A nice blue
               .fontSize(12)
               .text('PERSONALIZED HALL SLIP', { align: 'center' });

            doc.moveDown(0.5);
            doc.fillColor('#cc0000') // Red color for exam title
               .fontSize(11)
               .text('END SEMESTER EXAMINATIONS', { align: 'center' });
            
            // Red Line separator
            doc.moveDown(0.5);
            doc.strokeColor('#cc0000')
               .lineWidth(1)
               .moveTo(50, doc.y)
               .lineTo(545, doc.y)
               .stroke();
            doc.moveDown(1.5);

            // --- Student & Exam Details ---
            doc.fillColor('#000000');
            
            // Left Column: Student Details
            const leftX = 50;
            const rightX = 300;
            let currentY = doc.y;

            doc.font('Helvetica-Bold').fontSize(11).text('REGISTER NO:', leftX, currentY);
            doc.font('Helvetica').text(assignment.register_number, leftX + 100, currentY);

            doc.font('Helvetica-Bold').text('NAME:', leftX, currentY + 20);
            doc.font('Helvetica').text(assignment.student_name, leftX + 100, currentY + 20);

            // Right Column: Exam Details
            doc.font('Helvetica-Bold').text('DATE:', rightX, currentY);
            doc.font('Helvetica').fillColor('#cc0000').text(eDate, rightX + 50, currentY).fillColor('#000000');

            doc.font('Helvetica-Bold').text('TIME:', rightX, currentY + 20);
            doc.font('Helvetica').fillColor('#cc0000').text(eTime, rightX + 50, currentY + 20).fillColor('#000000');

            doc.moveDown(3);
            
            // --- Subject & Seating Box ---
            const boxTop = doc.y;
            doc.rect(50, boxTop, 495, 120).strokeColor('#333333').stroke();
            
            doc.font('Helvetica-Bold').fontSize(12)
               .text('SUBJECT:', 60, boxTop + 15);
            doc.font('Helvetica').fontSize(11)
               .text(subjectName, 130, boxTop + 15, { width: 400 });

            doc.font('Helvetica-Bold').fontSize(12)
               .text('ALLOCATED HALL:', 60, boxTop + 55);
            doc.font('Helvetica').fontSize(14)
               .text(assignment.hall_number, 190, boxTop + 54);

            doc.font('Helvetica-Bold').fontSize(12)
               .text('ALLOCATED SEAT:', 60, boxTop + 85);
            doc.font('Helvetica').fontSize(14).fillColor('#0056b3')
               .text(assignment.seat_number, 190, boxTop + 84);

            // Footer instructions
            doc.fillColor('#000000');
            doc.moveDown(6);
            doc.font('Helvetica-Oblique').fontSize(9)
               .text('Please bring your college ID card to the exam hall.', 50, doc.y, { align: 'center' });
            doc.text('Report to the hall at least 30 minutes before the commencement of the exam.', { align: 'center' });
            
            doc.end();

            const pdfBuffer = await pdfPromise;
            
            await sendNotificationEmail(s.email, 'Hall Plan Allotted', message, '', [
              { filename: 'HallPlan.pdf', content: pdfBuffer }
            ]);
          }
        }
      }
    }

    // ------------------------------------------------
    // 9. Return complete seating for the exam
    // ------------------------------------------------

    const [finalSeating] =
      await pool.query(
        `
        SELECT
          sa.id,
          sa.exam_id,
          sa.student_id,
          sa.hall_id,
          sa.seat_id,

          st.register_number,
          st.name AS student_name,

          h.hall_number,
          h.name AS hall_name,

          se.seat_number,
          se.seat_row,
          se.seat_column

        FROM seating_assignments sa

        INNER JOIN students st
          ON sa.student_id = st.id

        INNER JOIN halls h
          ON sa.hall_id = h.id

        INNER JOIN seats se
          ON sa.seat_id = se.id

        WHERE sa.exam_id = ?

        ORDER BY
          h.hall_number,
          se.seat_row,
          se.seat_column
        `,
        [exam_id]
      );

    res.json({
      success: true,
      message:
        pendingStudents.length > 0
          ? "Seating generated successfully"
          : "Seating already exists for all eligible students",

      data: {
        exam: {
          id: exam.id,
          subject_id:
            exam.subject_id,
          subject_code:
            exam.subject_code,
          subject_name:
            exam.subject_name,
        },

        summary: {
          eligible_students:
            students.length,

          newly_assigned:
            createdAssignments.length,

          total_assigned:
            finalSeating.length,

          hall_count:
            new Set(
              finalSeating.map(
                (row) =>
                  Number(
                    row.hall_id
                  )
              )
            ).size,

          student_count:
            new Set(
              finalSeating.map(
                (row) =>
                  Number(
                    row.student_id
                  )
              )
            ).size,
        },

        assignments:
          finalSeating,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors.
    }

    console.error(
      "Generate seating error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to generate seating",
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  getSeating,
  getMySeating,
  generateSeating,
};