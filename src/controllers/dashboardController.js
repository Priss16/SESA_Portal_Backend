const pool = require("../db");

const getAdminDashboardStats = async (req, res) => {
  try {
    const [[{ totalStudents }]] = await pool.query('SELECT COUNT(*) as totalStudents FROM students');
    const [[{ totalStaff }]] = await pool.query('SELECT COUNT(*) as totalStaff FROM staff');
    const [[{ totalDepartments }]] = await pool.query('SELECT COUNT(*) as totalDepartments FROM departments');
    const [[{ totalExams }]] = await pool.query('SELECT COUNT(*) as totalExams FROM exams');
    const [[{ totalHalls }]] = await pool.query('SELECT COUNT(*) as totalHalls FROM halls');
    const [[{ totalAvailableHalls }]] = await pool.query('SELECT COUNT(*) as totalAvailableHalls FROM halls WHERE status = "AVAILABLE" OR status = "active" OR status IS NULL'); // Assuming status logic
    const [[{ totalAllocatedHalls }]] = await pool.query('SELECT COUNT(*) as totalAllocatedHalls FROM halls WHERE status = "ALLOCATED"');
    
    // Dept Breakdown (for existing chart, let's keep students by dept)
    const [deptRows] = await pool.query(`
      SELECT d.code as dept, COUNT(s.id) as count 
      FROM departments d 
      LEFT JOIN students s ON s.department_id = d.id 
      GROUP BY d.id
    `);
    const maxDept = Math.max(...deptRows.map(r => r.count), 1);
    const deptBreakdown = deptRows.map(r => ({
      dept: r.dept || 'Unknown',
      count: r.count,
      pct: (r.count / maxDept) * 100
    }));

    // Hall Utilization
    const assignedHalls = totalAllocatedHalls;
    const freeHalls = totalHalls - assignedHalls;
    const hallUtilization = {
      assigned: assignedHalls,
      free: freeHalls,
      pct: totalHalls > 0 ? Math.round((assignedHalls / totalHalls) * 100) : 0
    };

    const [upcomingExamsList] = await pool.query('SELECT e.id, s.code as subject, e.exam_date as date, e.status FROM exams e JOIN subjects s ON e.subject_id = s.id ORDER BY e.exam_date ASC LIMIT 4');

    // Notifications
    const [notifications] = await pool.query('SELECT id, title, created_at as time FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 3', [req.user.id]);

    // Recent Activity
    const [recentActivity] = await pool.query('SELECT id, description as title, action as type, "#" as link FROM audit_logs ORDER BY created_at DESC LIMIT 4');

    res.json({
      success: true,
      stats: {
        totalStudents,
        totalStaff,
        totalDepartments,
        totalExams,
        totalHalls,
        totalAvailableHalls,
        totalAllocatedHalls,
        upcomingExams: upcomingExamsList.length
      },
      deptBreakdown,
      hallUtilization,
      upcomingExams: upcomingExamsList,
      notifications,
      recentActivity
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPrincipalDashboardStats = async (req, res) => {
  try {
    const [[{ depts }]] = await pool.query('SELECT COUNT(*) as depts FROM departments');
    const [[{ exams }]] = await pool.query('SELECT COUNT(*) as exams FROM exams');
    const [[{ halls }]] = await pool.query('SELECT COUNT(*) as halls FROM halls');
    const [[{ staff }]] = await pool.query('SELECT COUNT(*) as staff FROM users WHERE role="staff"');
    
    // Fallback if invigilation_substitution_requests is not implemented yet
    let subs = 0;
    try {
      const [[{ pendingSubs }]] = await pool.query('SELECT COUNT(*) as pendingSubs FROM invigilation_substitution_requests WHERE status="pending"');
      subs = pendingSubs;
    } catch(e) {}

    const [upcomingExamsList] = await pool.query(`
      SELECT e.id, s.code as code, s.name as subject, d.name as dept, e.exam_date as date, e.start_time as time, e.status 
      FROM exams e 
      JOIN subjects s ON e.subject_id = s.id
      LEFT JOIN departments d ON s.department_id = d.id
      ORDER BY e.exam_date ASC LIMIT 4
    `);

    let recentSubsList = [];
    try {
      const [subs] = await pool.query(`
        SELECT r.id, d.name as department, u1.username as originalStaff, u2.username as replacementStaff, s.code as exam, r.status as finalStatus
        FROM invigilation_substitution_requests r
        JOIN users u1 ON r.requester_staff_id = u1.id
        LEFT JOIN users u2 ON r.replacement_staff_id = u2.id
        JOIN invigilations i ON r.invigilation_id = i.id
        JOIN exams e ON i.exam_id = e.id
        JOIN subjects s ON e.subject_id = s.id
        LEFT JOIN departments d ON s.department_id = d.id
        ORDER BY r.created_at DESC LIMIT 3
      `);
      recentSubsList = subs;
    } catch(e) {}

    const [recentActivity] = await pool.query('SELECT id, resource_name as title, resource_type as type, route as link FROM recent_access WHERE user_id = ? ORDER BY accessed_at DESC LIMIT 4', [req.user.id]);

    res.json({
      success: true,
      stats: { depts, exams, halls, staff, subs },
      upcomingExams: upcomingExamsList,
      recentSubs: recentSubsList,
      recentActivity
    });
  } catch (error) {
    console.error("Principal dashboard stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getHodDashboardStats = async (req, res) => {
  try {
    const departmentId = req.user.department_id;
    if (!departmentId) {
      return res.status(403).json({ success: false, message: "HOD must have a department assigned" });
    }

    const [[{ students }]] = await pool.query('SELECT COUNT(*) as students FROM users WHERE role="student" AND department_id = ?', [departmentId]);
    const [[{ exams }]] = await pool.query('SELECT COUNT(e.id) as exams FROM exams e JOIN subjects s ON e.subject_id = s.id WHERE s.department_id = ?', [departmentId]);
    const [[{ staff }]] = await pool.query('SELECT COUNT(*) as staff FROM users WHERE role="staff" AND department_id = ?', [departmentId]);
    
    const [upcomingExamsList] = await pool.query(`
      SELECT e.id, s.code as code, s.name as subject, e.exam_date as date, e.start_time as time, e.status 
      FROM exams e 
      JOIN subjects s ON e.subject_id = s.id
      WHERE s.department_id = ?
      ORDER BY e.exam_date ASC LIMIT 4
    `, [departmentId]);

    const [recentActivity] = await pool.query('SELECT id, resource_name as title, resource_type as type, route as link FROM recent_access WHERE user_id = ? ORDER BY accessed_at DESC LIMIT 4', [req.user.id]);

    res.json({
      success: true,
      stats: { students, exams, staff },
      upcomingExams: upcomingExamsList,
      recentActivity
    });
  } catch (error) {
    console.error("HOD dashboard stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAdminDashboardStats,
  getPrincipalDashboardStats,
  getHodDashboardStats
};
