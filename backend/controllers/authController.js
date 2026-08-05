const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const User = require('../models/User');
const config = require('../config');
const validate = require('../middleware/validate');
const { generateToken, sendPasswordResetEmail } = require('../utils/email');

const signToken = (id) => jwt.sign({ id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

exports.register = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate,
  async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const user = await User.create({ name, email, password });
      const token = signToken(user._id);

      res.status(201).json({
        success: true,
        token,
        user: user.toPublicJSON()
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.login = [
  body('email').isEmail(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select('+password');
      if (!user || !(await user.comparePassword(req.body.password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      res.json({
        success: true,
        token: signToken(user._id),
        user: user.toPublicJSON()
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.forgotPassword = [
  body('email').isEmail(),
  validate,
  async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email });
      if (!user) {
        return res.json({ success: true, message: 'If that email exists, a reset link was sent' });
      }

      const resetToken = generateToken();
      user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.resetPasswordExpires = Date.now() + 3600000;
      await user.save({ validateBeforeSave: false });

      const resetUrl = `${config.frontendUrl}/reset-password.html?token=${resetToken}`;
      await sendPasswordResetEmail(user.email, resetUrl);

      res.json({ success: true, message: 'If that email exists, a reset link was sent' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.resetPassword = [
  body('token').notEmpty(),
  body('password').isLength({ min: 6 }),
  validate,
  async (req, res) => {
    try {
      const hashed = crypto.createHash('sha256').update(req.body.token).digest('hex');
      const user = await User.findOne({
        resetPasswordToken: hashed,
        resetPasswordExpires: { $gt: Date.now() }
      }).select('+resetPasswordToken +resetPasswordExpires');

      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired token' });
      }

      user.password = req.body.password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      res.json({ success: true, message: 'Password reset successful' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.getProfile = async (req, res) => {
  res.json({ success: true, user: req.user.toPublicJSON() });
};

exports.updateProfile = [
  body('name').optional().trim().notEmpty(),
  validate,
  async (req, res) => {
    try {
      if (req.body.name) req.user.name = req.body.name;
      await req.user.save();
      res.json({ success: true, user: req.user.toPublicJSON() });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    req.user.profilePicture = `/uploads/profiles/${req.file.filename}`;
    await req.user.save();
    res.json({ success: true, user: req.user.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.logout = async (_req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};
