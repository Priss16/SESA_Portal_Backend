const pool = require("../db");

const getSubjects = async (req, res) => {
  try {
    const [subjects] = await pool.query(`
      SELECT
        s.id,
        s.code,
        s.name,
        s.department_id,
        d.code AS department_code,
        d.name AS department_name,
        s.semester,
        s.credits,
        s.created_at,
        s.updated_at
      FROM subjects s
      LEFT JOIN departments d
        ON s.department_id = d.id
      ORDER BY s.id DESC
    `);

    res.json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    console.error("Get subjects error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch subjects",
    });
  }
};

const createSubject = async (req, res) => {
  try {
    const {
      code,
      name,
      department_id,
      semester,
      credits,
    } = req.body;

    if (!code || !name || !department_id || !semester) {
      return res.status(400).json({
        success: false,
        message:
          "Code, name, department, and semester are required",
      });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();

    const [department] = await pool.query(
      `SELECT id FROM departments WHERE id = ?`,
      [department_id]
    );

    if (department.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid department",
      });
    }

    const [existing] = await pool.query(
      `SELECT id
       FROM subjects
       WHERE code = ?`,
      [normalizedCode]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Subject code already exists",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO subjects
       (
         code,
         name,
         department_id,
         semester,
         credits
       )
       VALUES (?, ?, ?, ?, ?)`,
      [
        normalizedCode,
        normalizedName,
        Number(department_id),
        Number(semester),
        credits === "" || credits === undefined
          ? null
          : Number(credits),
      ]
    );

    res.status(201).json({
      success: true,
      message: "Subject created successfully",
      data: {
        id: result.insertId,
        code: normalizedCode,
        name: normalizedName,
        department_id: Number(department_id),
        semester: Number(semester),
        credits:
          credits === "" || credits === undefined
            ? null
            : Number(credits),
      },
    });
  } catch (error) {
    console.error("Create subject error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Subject code already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create subject",
    });
  }
};

const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      code,
      name,
      department_id,
      semester,
      credits,
    } = req.body;

    if (!code || !name || !department_id || !semester) {
      return res.status(400).json({
        success: false,
        message:
          "Code, name, department, and semester are required",
      });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();

    const [subject] = await pool.query(
      `SELECT id
       FROM subjects
       WHERE id = ?`,
      [id]
    );

    if (subject.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    const [department] = await pool.query(
      `SELECT id
       FROM departments
       WHERE id = ?`,
      [department_id]
    );

    if (department.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid department",
      });
    }

    const [duplicate] = await pool.query(
      `SELECT id
       FROM subjects
       WHERE code = ?
       AND id <> ?`,
      [normalizedCode, id]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Subject code already exists",
      });
    }

    await pool.query(
      `UPDATE subjects
       SET
         code = ?,
         name = ?,
         department_id = ?,
         semester = ?,
         credits = ?
       WHERE id = ?`,
      [
        normalizedCode,
        normalizedName,
        Number(department_id),
        Number(semester),
        credits === "" || credits === undefined
          ? null
          : Number(credits),
        id,
      ]
    );

    res.json({
      success: true,
      message: "Subject updated successfully",
    });
  } catch (error) {
    console.error("Update subject error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Subject code already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update subject",
    });
  }
};

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
};