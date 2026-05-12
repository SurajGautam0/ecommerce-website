const express = require('express');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const { sendOrderConfirmation } = require('../utils/email');
const { protect, authorize, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/orders
router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  const { items, shipping, couponCode, paymentMethod = 'stripe' } = req.body;
  if (!items?.length) return res.status(400).json({ message: 'No order items.' });

  // Validate stock & calculate prices
  let subtotal = 0;
  const orderItems = [];
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) return res.status(404).json({ message: `Product not found: ${item.product}` });
    if (product.stock < item.quantity) return res.status(400).json({ message: `Insufficient stock for: ${product.title}` });
    subtotal += product.price * item.quantity;
    orderItems.push({ product: product._id, title: product.title, image: product.images[0], price: product.price, quantity: item.quantity, variant: item.variant });
  }

  const shippingCost = subtotal > 100 ? 0 : 12;
  let discount = 0;
  let usedCoupon = null;

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    if (coupon) {
      const validity = coupon.isValid(subtotal, req.user?._id);
      if (validity.valid) { discount = coupon.calcDiscount(subtotal); usedCoupon = coupon; }
    }
  }

  const tax = (subtotal - discount + shippingCost) * 0.13;
  const total = subtotal - discount + shippingCost + tax;

  const order = await Order.create({
    user: req.user?._id,
    guestEmail: !req.user ? shipping.email : undefined,
    items: orderItems,
    shipping,
    subtotal,
    shippingCost,
    tax,
    discount,
    couponCode: usedCoupon?.code,
    total,
    paymentMethod,
    statusHistory: [{ status: 'pending', note: 'Order placed' }],
  });

  // Deduct stock
  for (const item of items) {
    await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity, sold: item.quantity } });
  }

  // Mark coupon as used
  if (usedCoupon) {
    usedCoupon.usedCount += 1;
    if (req.user) usedCoupon.usedBy.push(req.user._id);
    await usedCoupon.save();
  }

  const emailAddr = req.user?.email || shipping.email;
  try { await sendOrderConfirmation(order, emailAddr); } catch { /* non-critical */ }

  res.status(201).json(order);
}));

// GET /api/orders/myorders
router.get('/myorders', protect, asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
}));

// GET /api/orders/:id
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('items.product', 'title images price');
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  if (req.user.role !== 'admin' && order.user?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Not authorized.' });
  }
  res.json(order);
}));

// GET /api/orders (admin)
router.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = status ? { status } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('user', 'name email'),
    Order.countDocuments(query),
  ]);
  res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

// PUT /api/orders/:id/status (admin)
router.put('/:id/status', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { status, note, trackingNumber } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found.' });

  order.status = status;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  order.statusHistory.push({ status, note });
  const updated = await order.save();
  res.json(updated);
}));

// GET /api/orders/admin/stats (admin)
router.get('/admin/stats', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const [totalOrders, revenue, pending, customers] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.countDocuments({ status: 'pending' }),
    require('../models/User').countDocuments({ role: 'customer' }),
  ]);
  const lowStock = await Product.countDocuments({ stock: { $lte: 5 }, isActive: true });
  res.json({ totalOrders, revenue: revenue[0]?.total || 0, pending, customers, lowStock });
}));

module.exports = router;
