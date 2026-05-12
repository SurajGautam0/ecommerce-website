const express = require('express');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { sendPasswordReset, sendWelcome } = require('../utils/email');
const { protect } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'All fields are required.' });
  if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already registered.' });

  const user = await User.create({ name, email, password, role: role === 'seller' ? 'seller' : 'customer' });
  try { await sendWelcome(email, name); } catch { /* non-critical */ }

  res.status(201).json({
    _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar,
    token: generateToken(user._id),
  });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
  if (!user.isActive) return res.status(403).json({ message: 'Account has been deactivated.' });

  res.json({
    _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar,
    token: generateToken(user._id),
  });
}));

// GET /api/auth/me
router.get('/me', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('wishlist', 'title price images rating');
  res.json(user);
}));

// PUT /api/auth/profile
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  const { name, phone, avatar, currentPassword, newPassword } = req.body;

  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (avatar) user.avatar = avatar;

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ message: 'Current password required.' });
    if (!(await user.matchPassword(currentPassword))) return res.status(401).json({ message: 'Current password is incorrect.' });
    user.password = newPassword;
  }

  const updated = await user.save();
  res.json({ _id: updated._id, name: updated.name, email: updated.email, role: updated.role, avatar: updated.avatar, token: generateToken(updated._id) });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(404).json({ message: 'No account with that email.' });

  const token = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  user.resetPasswordExpire = Date.now() + 3600000; // 1 hour
  await user.save();

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  try {
    await sendPasswordReset(user.email, user.name, resetUrl);
    res.json({ message: 'Password reset email sent.' });
  } catch {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    res.status(500).json({ message: 'Email could not be sent.' });
  }
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.body.token).digest('hex');
  const user = await User.findOne({ resetPasswordToken: hashed, resetPasswordExpire: { $gt: Date.now() } });
  if (!user) return res.status(400).json({ message: 'Token is invalid or expired.' });

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  res.json({ message: 'Password reset successful.', token: generateToken(user._id) });
}));

// PUT /api/auth/address
router.put('/address', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const { action, addressId, address } = req.body;

  if (action === 'add') {
    if (address.isDefault) user.addresses.forEach(a => a.isDefault = false);
    user.addresses.push(address);
  } else if (action === 'remove') {
    user.addresses = user.addresses.filter(a => a._id.toString() !== addressId);
  } else if (action === 'setDefault') {
    user.addresses.forEach(a => a.isDefault = a._id.toString() === addressId);
  }

  await user.save();
  res.json(user.addresses);
}));

module.exports = router;
