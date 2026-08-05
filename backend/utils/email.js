const crypto = require('crypto');
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

if (config.smtp.host && config.smtp.user) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: false,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
}

const generateToken = () => crypto.randomBytes(32).toString('hex');

const sendPasswordResetEmail = async (email, resetUrl) => {
  if (!transporter) {
    console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
    return;
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'MeetMind - Reset Your Password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}">${resetUrl}</a>
    `
  });
};

module.exports = { generateToken, sendPasswordResetEmail };
