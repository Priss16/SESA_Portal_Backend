const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../db");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const createSesaToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      department_id: user.department_id || null,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const [users] = await pool.query(
      `SELECT
         id,
         username,
         email,
         password_hash,
         role,
         department_id,
         is_active
       FROM users
       WHERE username = ?`,
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const token = createSesaToken(user);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        department_id: user.department_id || null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Server error during login",
      error: error.message
    });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const googleId = payload.sub;
    const email = payload.email;

    const [oauthUsers] = await pool.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.role,
         u.department_id,
         u.is_active
       FROM users u
       JOIN user_oauth_accounts oa
         ON u.id = oa.user_id
       WHERE oa.provider = 'google'
         AND oa.provider_user_id = ?`,
      [googleId]
    );

    let user;

    if (oauthUsers.length > 0) {
      user = oauthUsers[0];
    } else {
      const [existingUsers] = await pool.query(
        `SELECT
           id,
           username,
           email,
           role,
           department_id,
           is_active
         FROM users
         WHERE email = ?`,
        [email]
      );

      if (existingUsers.length > 0) {
        user = existingUsers[0];

        await pool.query(
          `INSERT INTO user_oauth_accounts
             (user_id, provider, provider_user_id, email)
           VALUES (?, 'google', ?, ?)`,
          [user.id, googleId, email]
        );
      } else {
        return res.status(401).json({
          success: false,
          message:
            "No SESA account found for this Google email. Please sign in with username/password or contact an administrator.",
        });
      }
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    const token = createSesaToken(user);

    res.json({
      success: true,
      message: "Google login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        department_id: user.department_id || null,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);

    res.status(500).json({
      success: false,
      message: "Server error during Google login",
    });
  }
};

const getMe = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, username, email, role, department_id, is_active
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: users[0] });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ success: false, message: "Server error fetching user profile" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current and new passwords are required" });
    }

    const [users] = await pool.query(
      `SELECT password_hash FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: "Incorrect current password" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users SET password_hash = ? WHERE id = ?`,
      [hashedNewPassword, req.user.id]
    );

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, message: "Server error changing password" });
  }
};

const crypto = require("crypto");

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
    if (users.length === 0) return res.json({ success: true, message: "If the email exists, a reset link will be sent." });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
      [users[0].id, tokenHash, expiresAt]
    );

    // In a real app, send email here. For now, we simulate success.
    res.json({ success: true, message: "If the email exists, a reset link will be sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: "Token and new password required" });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [tokens] = await pool.query(
      `SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );

    if (tokens.length === 0) return res.status(400).json({ success: false, message: "Invalid or expired reset token" });

    const userId = tokens[0].user_id;
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashedNewPassword, userId]);
    await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`, [tokens[0].id]);

    res.json({ success: true, message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const registerStudent = async (req, res) => {
  try {
    const { regNo, name, email, department, year, semester, password } = req.body;

    if (!regNo || !name || !department || !year || !semester || !password) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Check if user already exists
    const [existing] = await pool.query(`SELECT id FROM users WHERE username = ?`, [regNo]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Student is already registered" });
    }

    // Map department string to ID
    const [deptRows] = await pool.query(`SELECT id FROM departments WHERE code = ? LIMIT 1`, [department]);
    const department_id = deptRows.length > 0 ? deptRows[0].id : null;

    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    const [userRes] = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, department_id, is_active) VALUES (?, ?, ?, 'student', ?, 1)`,
      [regNo, email || null, hashed, department_id]
    );

    const userId = userRes.insertId;

    // Check if student record exists
    const [existingStudent] = await pool.query(`SELECT id FROM students WHERE register_number = ?`, [regNo]);
    if (existingStudent.length > 0) {
      await pool.query(
        `UPDATE students SET name = ?, email = ?, department_id = ?, year = ?, semester = ? WHERE register_number = ?`,
        [name, email || null, department_id, year, semester, regNo]
      );
    } else {
      await pool.query(
        `INSERT INTO students (register_number, name, email, department_id, year, semester) VALUES (?, ?, ?, ?, ?, ?)`,
        [regNo, name, email || null, department_id, year, semester]
      );
    }

    // Auto login
    const user = {
      id: userId,
      username: regNo,
      role: 'student',
      department_id,
      email
    };
    const token = createSesaToken(user);
    
    res.json({
      success: true,
      message: "Registration successful",
      token,
      user
    });

  } catch (err) {
    console.error("Register student error:", err);
    res.status(500).json({ success: false, message: "Server error during registration" });
  }
};

module.exports = {
  login,
  googleLogin,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  registerStudent
};