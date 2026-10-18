const pool = require("../db");

const getHalls = async (req, res) => {
  try {
    let departmentCondition = "";
    const queryParams = [];

    // HOD and Staff can only see halls assigned to their department.
    // Admin and Principal can see all halls.
    if (req.user.role === "hod" || req.user.role === "staff") {
      if (!req.user.department_id) {
        return res.status(403).json({
          success: false,
          message: "Your account is not assigned to a department",
        });
      }

      departmentCondition = `
        AND EXISTS (
          SELECT 1
          FROM hall_departments hd_scope
          WHERE hd_scope.hall_id = h.id
            AND hd_scope.department_id = ?
        )
      `;

      queryParams.push(req.user.department_id);
    }

    const [halls] = await pool.query(
      `
      SELECT
        h.id,
        h.hall_number,
        h.name,
        h.building,
        h.floor,
        h.capacity,
        h.row_count,
        h.column_count,
        h.status,
        COALESCE(
          GROUP_CONCAT(
            DISTINCT d.code
            ORDER BY d.code
            SEPARATOR ', '
          ),
          ''
        ) AS department_codes
      FROM halls h
      LEFT JOIN hall_departments hd
        ON h.id = hd.hall_id
      LEFT JOIN departments d
        ON hd.department_id = d.id
      WHERE 1 = 1
        ${departmentCondition}
      GROUP BY
        h.id,
        h.hall_number,
        h.name,
        h.building,
        h.floor,
        h.capacity,
        h.row_count,
        h.column_count,
        h.status
      ORDER BY h.id DESC
      `,
      queryParams
    );

    res.json({
      success: true,
      data: halls,
    });
  } catch (error) {
    console.error("Get halls error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch halls",
    });
  }
};
const createHall = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      hall_number,
      name,
      building,
      floor,
      capacity,
      row_count,
      column_count,
      status,
      department_ids,
    } = req.body;

    if (!hall_number || !capacity || !row_count || !column_count) {
      return res.status(400).json({
        success: false,
        message:
          "Hall number, capacity, row count, and column count are required",
      });
    }

    if (
      department_ids !== undefined &&
      !Array.isArray(department_ids)
    ) {
      return res.status(400).json({
        success: false,
        message: "department_ids must be an array",
      });
    }

    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO halls
       (
         hall_number,
         name,
         building,
         floor,
         capacity,
         row_count,
         column_count,
         status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hall_number,
        name ?? null,
        building ?? null,
        floor ?? null,
        capacity,
        row_count,
        column_count,
        status ?? "available",
      ]
    );

    const hallId = result.insertId;

    if (Array.isArray(department_ids) && department_ids.length > 0) {
      for (const departmentId of department_ids) {
        await connection.query(
          `INSERT INTO hall_departments
           (hall_id, department_id)
           VALUES (?, ?)`,
          [hallId, departmentId]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Hall created successfully",
      data: {
        id: hallId,
        hall_number,
        name: name ?? null,
        building: building ?? null,
        floor: floor ?? null,
        capacity,
        row_count,
        column_count,
        status: status ?? "available",
        department_ids: department_ids ?? [],
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("Create hall error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create hall",
    });
  } finally {
    connection.release();
  }
};

const updateHall = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const {
      hall_number,
      name,
      building,
      floor,
      capacity,
      row_count,
      column_count,
      status,
      department_ids,
    } = req.body;

    if (!hall_number || !capacity || !row_count || !column_count) {
      return res.status(400).json({
        success: false,
        message:
          "Hall number, capacity, row count, and column count are required",
      });
    }

    if (
      department_ids !== undefined &&
      !Array.isArray(department_ids)
    ) {
      return res.status(400).json({
        success: false,
        message: "department_ids must be an array",
      });
    }

    await connection.beginTransaction();

    const [result] = await connection.query(
      `UPDATE halls
       SET
         hall_number = ?,
         name = ?,
         building = ?,
         floor = ?,
         capacity = ?,
         row_count = ?,
         column_count = ?,
         status = ?
       WHERE id = ?`,
      [
        hall_number,
        name ?? null,
        building ?? null,
        floor ?? null,
        capacity,
        row_count,
        column_count,
        status ?? "available",
        id,
      ]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Hall not found",
      });
    }

    if (Array.isArray(department_ids)) {
      await connection.query(
        `DELETE FROM hall_departments
         WHERE hall_id = ?`,
        [id]
      );

      for (const departmentId of department_ids) {
        await connection.query(
          `INSERT INTO hall_departments
           (hall_id, department_id)
           VALUES (?, ?)`,
          [id, departmentId]
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Hall updated successfully",
    });
  } catch (error) {
    await connection.rollback();

    console.error("Update hall error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update hall",
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  getHalls,
  createHall,
  updateHall,
};