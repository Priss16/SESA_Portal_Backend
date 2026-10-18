const bcrypt = require("bcrypt");
const pool = require("./src/db");

const users = [
  {
    username: "principal",
    email: "principal@nec.edu.in",
    password: "Principal@123",
    role: "principal",
    departmentCode: null,
  },

  {
    username: "hod_cse",
    email: "hod.cse@nec.edu.in",
    password: "Hod@123",
    role: "hod",
    departmentCode: "CSE",
  },

  {
    username: "hod_ece",
    email: "hod.ece@nec.edu.in",
    password: "Hod@123",
    role: "hod",
    departmentCode: "ECE",
  },

  {
    username: "hod_eee",
    email: "hod.eee@nec.edu.in",
    password: "Hod@123",
    role: "hod",
    departmentCode: "EEE",
  },

  {
    username: "hod_mech",
    email: "hod.mech@nec.edu.in",
    password: "Hod@123",
    role: "hod",
    departmentCode: "MECH",
  },

  {
    username: "hod_civil",
    email: "hod.civil@nec.edu.in",
    password: "Hod@123",
    role: "hod",
    departmentCode: "CIVIL",
  },

  {
    username: "hod_it",
    email: "hod.it@nec.edu.in",
    password: "Hod@123",
    role: "hod",
    departmentCode: "IT",
  },

  {
    username: "hod_aids",
    email: "hod.aids@nec.edu.in",
    password: "Hod@123",
    role: "hod",
    departmentCode: "AIDS",
  },
];

async function seedRoles() {
  try {
    for (const account of users) {
      let departmentId = null;

      if (account.departmentCode) {
        const [departments] = await pool.query(
          `
          SELECT id
          FROM departments
          WHERE code = ?
          `,
          [account.departmentCode]
        );

        if (departments.length === 0) {
          console.log(
            `Skipping ${account.username}: department ${account.departmentCode} not found`
          );
          continue;
        }

        departmentId = departments[0].id;
      }

      const [existing] = await pool.query(
        `
        SELECT id
        FROM users
        WHERE username = ?
        `,
        [account.username]
      );

      if (existing.length > 0) {
        console.log(
          `${account.username} already exists - skipped`
        );
        continue;
      }

      const passwordHash = await bcrypt.hash(
        account.password,
        10
      );

      await pool.query(
        `
        INSERT INTO users
        (
          username,
          email,
          password_hash,
          role,
          department_id,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, 1)
        `,
        [
          account.username,
          account.email,
          passwordHash,
          account.role,
          departmentId,
        ]
      );

      console.log(
        `Created ${account.username} (${account.role})`
      );
    }

    console.log("Role seeding completed.");
    process.exit(0);
  } catch (error) {
    console.error("Role seeding failed:", error);
    process.exit(1);
  }
}

seedRoles();