const mysql = require('mysql2/promise');
require('dotenv').config();
const bcrypt = require('bcrypt');

async function seedData() {
  const pool = mysql.createPool({ 
    host: '127.0.0.1', 
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME 
  });
  
  try {
    console.log("Starting data population...");

    const passwordHash = await bcrypt.hash('Student@0001', 10);
    const staffPasswordHash = await bcrypt.hash('Staff@0001', 10);

    const deps = [
      { id: 1, code: 'CSE' },
      { id: 2, code: 'ECE' },
      { id: 3, code: 'EEE' },
      { id: 4, code: 'MECH' },
      { id: 5, code: 'CIVIL' },
      { id: 6, code: 'IT' },
      { id: 7, code: 'AIDS' }
    ];

    async function getOrInsertSubject(code, name, depId) {
      const [existing] = await pool.query('SELECT id FROM subjects WHERE code = ?', [code]);
      if(existing.length > 0) return existing[0].id;
      const [res] = await pool.query('INSERT INTO subjects (code, name, department_id, semester) VALUES (?, ?, ?, ?)', [code, name, depId, 5]);
      return res.insertId;
    }

    async function getOrInsertExam(subId, dateStr, start, end) {
      const [existing] = await pool.query('SELECT id FROM exams WHERE subject_id = ? AND start_time = ?', [subId, start]);
      if(existing.length > 0) return existing[0].id;
      const [res] = await pool.query('INSERT INTO exams (subject_id, exam_date, start_time, end_time, status) VALUES (?, ?, ?, ?, ?)', 
        [subId, dateStr, start, end, 'scheduled']);
      return res.insertId;
    }

    // Seed 5 students and 2 staff for each department
    for (let dep of deps) {
      const sub1Id = await getOrInsertSubject(`${dep.code}101`, `Core ${dep.code} Fundamentals`, dep.id);
      const sub2Id = await getOrInsertSubject(`${dep.code}102`, `Advanced ${dep.code} Applications`, dep.id);

      const dateStr = '2026-10-25';
      const exam1Id = await getOrInsertExam(sub1Id, dateStr, '10:00:00', '13:00:00'); // FN
      const exam2Id = await getOrInsertExam(sub2Id, dateStr, '14:00:00', '17:00:00'); // AN

      // Add 2 Staff
      for(let i=1; i<=2; i++) {
        const username = `staff_${dep.code.toLowerCase()}_${i}`;
        const staffIdStr = `SF${dep.id}00${i}`;
        const [existingUser] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if(existingUser.length === 0) {
          const [uRes] = await pool.query('INSERT INTO users (username, email, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?)', 
            [username, `${username}@nec.edu.in`, staffPasswordHash, 'staff', dep.id, 1]);
          await pool.query('INSERT INTO staff (user_id, staff_id, name, email, department_id, designation, phone) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [uRes.insertId, staffIdStr, `Prof. ${dep.code} ${i}`, `${username}@nec.edu.in`, dep.id, 'Assistant Professor', `98765000${dep.id}${i}`]);
        }
      }

      // Add 5 Students
      for(let i=1; i<=5; i++) {
        const regNum = `24${dep.id}00${i}`;
        const [existing] = await pool.query('SELECT * FROM users WHERE username = ?', [regNum]);
        
        let studentId;
        if(existing.length === 0) {
          const [uRes] = await pool.query('INSERT INTO users (username, email, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?)', 
            [regNum, `${regNum}@nec.edu.in`, passwordHash, 'student', dep.id, 1]);
          const [stRes] = await pool.query('INSERT INTO students (user_id, register_number, name, email, department_id, year, semester, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
            [uRes.insertId, regNum, `Student ${dep.code} ${i}`, `${regNum}@nec.edu.in`, dep.id, 3, 5, `99887700${dep.id}${i}`]);
          studentId = stRes.insertId;
        } else {
          const [stRes] = await pool.query('SELECT id FROM students WHERE register_number = ?', [regNum]);
          if(stRes.length > 0) studentId = stRes[0].id;
        }

        if(studentId) {
          await pool.query('INSERT IGNORE INTO exam_enrollments (exam_id, student_id) VALUES (?, ?)', [exam1Id, studentId]);
          await pool.query('INSERT IGNORE INTO exam_enrollments (exam_id, student_id) VALUES (?, ?)', [exam2Id, studentId]);
        }
      }
    }

    console.log("Data successfully populated! All departments now have subjects, exams (FN/AN), staff, students, and enrollments.");
  } catch(e) {
    console.error("Error populating data:", e);
  } finally {
    pool.end();
  }
}

seedData();
