const pool = require("../db");

const getDepartments = async (req, res) => {
  try {
    const [departments] = await pool.query(`
      SELECT
        d.id,
        d.code,
        d.name,
        (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id) AS students,
        (SELECT COUNT(*) FROM staff st WHERE st.department_id = d.id) AS staff,
        (SELECT COUNT(*) FROM subjects sub WHERE sub.department_id = d.id) AS subjects,
        (SELECT name FROM staff st WHERE st.department_id = d.id AND st.designation = 'HOD' LIMIT 1) AS hod
      FROM departments d
      ORDER BY d.name ASC
    `);

    res.json({
      success: true,
      data: departments,
    });
  } catch (error) {
    console.error("Get departments error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
    });
  }
};

const getDepartmentStats = async (req, res) => {
  try {
    const { id } = req.params;

    // Run multiple queries in parallel for efficiency
    const [
      [subjects],
      [students],
      [staff],
      [exams],
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM subjects WHERE department_id = ?", [id]),
      pool.query("SELECT COUNT(*) as count FROM students WHERE department_id = ?", [id]),
      pool.query("SELECT COUNT(*) as count FROM staff WHERE department_id = ?", [id]),
      pool.query("SELECT COUNT(*) as count FROM exams e JOIN subjects s ON e.subject_id = s.id WHERE s.department_id = ?", [id])
    ]);

    // For halls and invigilation, since they are not strictly tied to a department in all schemas, 
    // we can return mock values or zeroes if not applicable.
    // Assuming halls are global, we just return total halls
    const [halls] = await pool.query("SELECT COUNT(*) as count FROM halls");
    
    // Total invigilations for this department's exams
    const [invigilations] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM invigilations i
      JOIN exams e ON i.exam_id = e.id
      JOIN subjects s ON e.subject_id = s.id
      WHERE s.department_id = ?
    `, [id]);

    res.json({
      success: true,
      data: {
        subjects: subjects[0].count,
        students: students[0].count,
        staff: staff[0].count,
        exams: exams[0].count,
        halls: halls[0].count,
        invigilation: invigilations[0].count
      }
    });
  } catch (error) {
    console.error("Get department stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
};

const createDepartment = async (req, res) => {
  try {
    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: "Department code and name are required",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO departments (code, name)
       VALUES (?, ?)`,
      [code, name]
    );

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: {
        id: result.insertId,
        code,
        name,
      },
    });
  } catch (error) {
    console.error("Create department error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create department",
    });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: "Department code and name are required",
      });
    }

    const [result] = await pool.query(
      `UPDATE departments
       SET code = ?, name = ?
       WHERE id = ?`,
      [code, name, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    res.json({
      success: true,
      message: "Department updated successfully",
    });
  } catch (error) {
    console.error("Update department error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update department",
    });
  }
};

module.exports = {
  getDepartments,
  getDepartmentStats,
  createDepartment,
  updateDepartment,
};