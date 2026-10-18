const bcrypt = require("bcrypt");
const pool = require("./src/db");

async function createAdmin() {
  try {
    const username = "admin";
    const email = "admin@sesa.com";
    const password = "Admin@123";

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [username, email, passwordHash, "admin"]
    );

    console.log("Admin user created successfully.");
    console.log("Username:", username);
    console.log("Password:", password);

    await pool.end();
  } catch (error) {
    console.error("Error creating admin:", error);
    await pool.end();
  }
}

createAdmin();