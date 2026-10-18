const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Create a reusable transporter using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // e.g. your-email@gmail.com
    pass: process.env.SMTP_PASS, // e.g. your-app-password
  },
});

/**
 * Sends an email notification.
 * @param {string} to - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} text - The plain text body of the email.
 * @param {string} [html] - The HTML body of the email (optional).
 */
const sendNotificationEmail = async (to, subject, text, html = '', attachments = []) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('SMTP credentials not configured. Email not sent.');
      return false;
    }

    const info = await transporter.sendMail({
      from: `"SESA Portal" <${process.env.SMTP_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html: html || text, // html body
      attachments,
    });

    console.log('Message sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

module.exports = {
  sendNotificationEmail,
};
