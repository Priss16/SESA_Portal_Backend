const bcrypt = require('bcrypt');
require('dotenv').config();
const pool = require('./src/db');

async function run() {
  try {
    const rawPassword = 'Staff@0001ece';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const username = 'staff_ece1';
    const email = 'ece_staff1@nec.edu.in';
    const deptId = 2; // ECE
    const staffName = 'Dr R. Karthikeyan';

    // 1. Insert into users
    const [userRes] = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, department_id, is_active)
       VALUES (?, ?, ?, 'staff', ?, 1)`,
      [username, email, passwordHash, deptId]
    );
    const newUserId = userRes.insertId;

    // 2. Insert into staff
    await pool.query(
      `INSERT INTO staff (user_id, staff_id, name, email, department_id, designation, phone)
       VALUES (?, ?, ?, ?, ?, 'Associate Professor', '9876543212')`,
      [newUserId, 'STF003', staffName, email, deptId]
    );

    console.log('Successfully created staff_ece1 user and staff record.');
    process.exit(0);
  } catch (err) {
    console.error('Error adding staff:', err);
    process.exit(1);
  }
}

run();
