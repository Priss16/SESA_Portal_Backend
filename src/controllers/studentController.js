const pool = require("../db");

// --------------------------------------------------
// GET STUDENTS
// --------------------------------------------------

const getStudents = async (req, res) => {
  try {
    let departmentCondition = "";
    const queryParams = [];

    // Staff and HOD are department-scoped.
    // Admin and Principal can see all students.
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

    const [students] = await pool.query(
      `
      SELECT
        s.id,
        s.register_number,
        s.name,
        s.email,
        s.year,
        s.semester,
        s.phone,
        d.code AS department_code,
        d.name AS department_name

      FROM students s

      LEFT JOIN departments d
        ON s.department_id = d.id

      WHERE 1 = 1
        ${departmentCondition}

      ORDER BY s.id DESC
      `,
      queryParams
    );

    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    console.error("Get students error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch students",
    });
  }
};

// --------------------------------------------------
// CREATE STUDENT
// --------------------------------------------------

const createStudent = async (req, res) => {
  try {
    const {
      register_number,
      name,
      email,
      department_id,
      year,
      semester,
      phone,
    } = req.body;

    if (!register_number || !name) {
      return res.status(400).json({
        success: false,
        message: "Register number and name are required",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO students
       (register_number, name, email, department_id, year, semester, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        register_number,
        name,
        email || null,
        department_id || null,
        year || null,
        semester || null,
        phone || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: {
        id: result.insertId,
        register_number,
        name,
        email: email || null,
        department_id: department_id || null,
        year: year || null,
        semester: semester || null,
        phone: phone || null,
      },
    });
  } catch (error) {
    console.error("Create student error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create student",
    });
  }
};

// --------------------------------------------------
// UPDATE STUDENT
// --------------------------------------------------

const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      register_number,
      name,
      email,
      department_id,
      year,
      semester,
      phone,
    } = req.body;

    if (!register_number || !name) {
      return res.status(400).json({
        success: false,
        message: "Register number and name are required",
      });
    }

    const [result] = await pool.query(
      `UPDATE students
       SET
         register_number = ?,
         name = ?,
         email = ?,
         department_id = ?,
         year = ?,
         semester = ?,
         phone = ?
       WHERE id = ?`,
      [
        register_number,
        name,
        email || null,
        department_id || null,
        year || null,
        semester || null,
        phone || null,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({
      success: true,
      message: "Student updated successfully",
    });
  } catch (error) {
    console.error("Update student error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update student",
    });
  }
};

module.exports = {
  getStudents,
  createStudent,
  updateStudent,
};