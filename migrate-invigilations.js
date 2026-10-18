const pool = require('./src/db');

async function migrate() {
  try {
    console.log("Creating invigilations table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invigilations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        exam_id INT NOT NULL,
        hall_id INT NOT NULL,
        staff_id INT NOT NULL,
        assignment_slot TINYINT NOT NULL,
        status ENUM('assigned', 'substitution_pending', 'substituted', 'completed') DEFAULT 'assigned',
        assigned_by INT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE(exam_id, staff_id),
        UNIQUE(exam_id, hall_id, assignment_slot),
        CHECK (assignment_slot IN (1,2)),
        FOREIGN KEY (exam_id) REFERENCES exams(id),
        FOREIGN KEY (hall_id) REFERENCES halls(id),
        FOREIGN KEY (staff_id) REFERENCES staff(id),
        FOREIGN KEY (assigned_by) REFERENCES users(id)
      ) ENGINE=InnoDB;
    `);
    console.log("Created invigilations table.");

    console.log("Creating invigilation_substitution_requests table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invigilation_substitution_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invigilation_id INT NOT NULL,
        requester_staff_id INT NOT NULL,
        replacement_staff_id INT NOT NULL,
        reason TEXT NOT NULL,
        status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        principal_id INT NULL,
        principal_remarks TEXT NULL,
        decision_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (invigilation_id) REFERENCES invigilations(id),
        FOREIGN KEY (requester_staff_id) REFERENCES staff(id),
        FOREIGN KEY (replacement_staff_id) REFERENCES staff(id),
        FOREIGN KEY (principal_id) REFERENCES users(id)
      ) ENGINE=InnoDB;
    `);
    console.log("Created invigilation_substitution_requests table.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

migrate();
