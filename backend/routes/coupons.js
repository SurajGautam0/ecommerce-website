const express = require('express');
const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');
const { protect, authorize, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/coupons/validate
router.post('/validate', optionalAuth, asyncHandler(async (req, res) => {
  const { code, orderAmount } = req.body;
  const coupon = await Coupon.findOne({ code: code?.toUpperCase() });
  if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });

  const validity = coupon.isValid(orderAmount || 0, req.user?._id);
  if (!validity.valid) return res.status(400).json({ message: validity.message });

  const discount = coupon.calcDiscount(orderAmount || 0);
  res.json({ valid: true, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description }, discount });
}));

// GET /api/coupons (admin)
router.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json(coupons);
}));

// POST /api/coupons (admin)
router.post('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json(coupon);
}));

// PUT /api/coupons/:id (admin)
router.put('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });
  res.json(coupon);
}));

// DELETE /api/coupons/:id (admin)
router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ message: 'Coupon deleted.' });
}));

module.exports = router;
