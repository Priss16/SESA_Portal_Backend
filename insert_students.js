const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function insertData() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sesa_db',
  });

  try {
    console.log("Starting data insertion...");
    
    // Get departments
    const [departments] = await connection.query('SELECT * FROM departments');
    const deptMap = {};
    departments.forEach(d => deptMap[d.code] = d.id);
    
    const specs = [
      { code: 'CSE', prefix: '24104', start: 1, end: 120, year: 3 },
      { code: 'ECE', prefix: '24103', start: 1, end: 120, year: 3 },
      { code: 'EEE', prefix: '24105', start: 1, end: 90, year: 3 },
      { code: 'CIVIL', prefix: '24102', start: 1, end: 60, year: 3 },
      { code: 'AIDS', prefix: '24106', start: 1, end: 70, year: 3 },
      { code: 'MECH', prefix: '24101', start: 1, end: 70, year: 3 },
    ];
    
    for (const spec of specs) {
      const deptId = deptMap[spec.code];
      if (!deptId) {
        console.warn(`Department ${spec.code} not found, skipping.`);
        continue;
      }
      
      console.log(`Inserting students for ${spec.code}...`);
      
      for (let i = spec.start; i <= spec.end; i++) {
        const numStr = i.toString().padStart(3, '0');
        const regNum = `${spec.prefix}${numStr}`;
        const name = `Student ${regNum}`;
        const email = `student${regNum}@college.edu`;
        const password = 'hashed_password';
        
        // Insert student (ignore if exists)
        await connection.query(
          `INSERT IGNORE INTO students (register_number, name, email, department_id, year) VALUES (?, ?, ?, ?, ?)`,
          [regNum, name, email, deptId, spec.year]
        );
      }
    }
    
    console.log("Students inserted. Now enrolling in exams...");
    
    // Get exams with their department_id from subjects
    const [exams] = await connection.query(`
      SELECT e.id as exam_id, s.department_id 
      FROM exams e 
      JOIN subjects s ON e.subject_id = s.id
    `);
    
    // For each student, enroll them in all exams for their department
    const [students] = await connection.query('SELECT id, department_id, year FROM students');
    
    for (const student of students) {
      const studentExams = exams.filter(e => e.department_id === student.department_id);
      for (const exam of studentExams) {
        await connection.query(
          `INSERT IGNORE INTO exam_enrollments (student_id, exam_id) VALUES (?, ?)`,
          [student.id, exam.exam_id]
        );
      }
    }
    
    console.log("Finished adding students and enrolling in exams.");
    
  } catch (error) {
    console.error("Error inserting data:", error);
  } finally {
    await connection.end();
  }
}

insertData();
