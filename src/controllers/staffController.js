const pool = require("../db");

const getStaff = async (req, res) => {
  try {
    let departmentCondition = "";
    const queryParams = [];

    // HOD can only see staff from their own department.
    // Admin, Principal, and Staff (for substitution) can see all staff.
    if (req.user.role === "hod") {
      if (!req.user.department_id) {
        return res.status(403).json({
          success: false,
          message: "Your account is not assigned to a department",
        });
      }

      departmentCondition = `
        AND st.department_id = ?
      `;

      queryParams.push(req.user.department_id);
    }

    const [staff] = await pool.query(
      `
      SELECT
        st.id,
        st.staff_id,
        st.name,
        st.email,
        st.designation,
        st.phone,
        d.code AS department_code,
        d.name AS department_name

      FROM staff st

      LEFT JOIN departments d
        ON st.department_id = d.id

      WHERE 1 = 1
        ${departmentCondition}

      ORDER BY st.id DESC
      `,
      queryParams
    );

    res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error("Get staff error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch staff",
    });
  }
};
const createStaff = async (req, res) => {
  try {
    const {
      staff_id,
      name,
      email,
      department_id,
      designation,
      phone,
    } = req.body;

    if (!staff_id || !name) {
      return res.status(400).json({
        success: false,
        message: "Staff ID and name are required",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO staff
       (staff_id, name, email, department_id, designation, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        staff_id,
        name,
        email || null,
        department_id || null,
        designation || null,
        phone || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Staff created successfully",
      data: {
        id: result.insertId,
        staff_id,
        name,
        email: email || null,
        department_id: department_id || null,
        designation: designation || null,
        phone: phone || null,
      },
    });
  } catch (error) {
    console.error("Create staff error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create staff",
    });
  }
};

const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      staff_id,
      name,
      email,
      department_id,
      designation,
      phone,
    } = req.body;

    if (!staff_id || !name) {
      return res.status(400).json({
        success: false,
        message: "Staff ID and name are required",
      });
    }

    const [result] = await pool.query(
      `UPDATE staff
       SET
         staff_id = ?,
         name = ?,
         email = ?,
         department_id = ?,
         designation = ?,
         phone = ?
       WHERE id = ?`,
      [
        staff_id,
        name,
        email || null,
        department_id || null,
        designation || null,
        phone || null,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    res.json({
      success: true,
      message: "Staff updated successfully",
    });
  } catch (error) {
    console.error("Update staff error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update staff",
    });
  }
};

module.exports = {
  getStaff,
  createStaff,
  updateStaff,
};