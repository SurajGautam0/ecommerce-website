const express = require('express');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/users (admin)
router.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, search } = req.query;
  const query = {};
  if (role) query.role = role;
  if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    User.countDocuments(query),
  ]);
  res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

// PUT /api/users/:id/status (admin)
router.put('/:id/status', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true }).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(user);
}));

// PUT /api/users/:id/role (admin)
router.put('/:id/role', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(user);
}));

// GET /api/users/seller/dashboard
router.get('/seller/dashboard', protect, authorize('seller', 'admin'), asyncHandler(async (req, res) => {
  const sellerId = req.user._id;
  const [products, orders] = await Promise.all([
    Product.find({ seller: sellerId, isActive: true }),
    Order.find({ 'items.product': { $in: (await Product.find({ seller: sellerId }, '_id')).map(p => p._id) }, paymentStatus: 'paid' }),
  ]);

  const revenue = orders.reduce((sum, o) => {
    const sellerItems = o.items.filter(i => products.some(p => p._id.equals(i.product)));
    return sum + sellerItems.reduce((s, i) => s + i.price * i.quantity, 0);
  }, 0);

  const lowStock = products.filter(p => p.stock <= 5);
  res.json({ revenue, totalProducts: products.length, totalOrders: orders.length, lowStock });
}));

module.exports = router;
