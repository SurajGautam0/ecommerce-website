const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { protect, authorize, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/products
router.get('/', asyncHandler(async (req, res) => {
  const { search, category, minPrice, maxPrice, sort, page = 1, limit = 12, featured, seller } = req.query;
  const query = { isActive: true };

  if (search) query.$text = { $search: search };
  if (category) query.category = category;
  if (featured === 'true') query.isFeatured = true;
  if (seller) query.seller = seller;
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  const sortMap = { price_asc: { price: 1 }, price_desc: { price: -1 }, rating: { rating: -1 }, newest: { createdAt: -1 }, featured: { isFeatured: -1, createdAt: -1 } };
  const sortObj = sortMap[sort] || sortMap.featured;

  const skip = (Number(page) - 1) * Number(limit);
  const [products, total] = await Promise.all([
    Product.find(query).sort(sortObj).skip(skip).limit(Number(limit)).populate('seller', 'name sellerInfo.shopName'),
    Product.countDocuments(query),
  ]);

  res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

// GET /api/products/categories
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  res.json(categories);
}));

// GET /api/products/:id
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('seller', 'name sellerInfo avatar createdAt');
  if (!product || !product.isActive) return res.status(404).json({ message: 'Product not found.' });
  res.json(product);
}));

// POST /api/products
router.post('/', protect, authorize('seller', 'admin'), asyncHandler(async (req, res) => {
  const product = await Product.create({ ...req.body, seller: req.user._id, sellerName: req.user.sellerInfo?.shopName || req.user.name });
  res.status(201).json(product);
}));

// PUT /api/products/:id
router.put('/:id', protect, authorize('seller', 'admin'), asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  if (req.user.role !== 'admin' && product.seller.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Not authorized to edit this product.' });
  }
  const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  res.json(updated);
}));

// DELETE /api/products/:id
router.delete('/:id', protect, authorize('seller', 'admin'), asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  if (req.user.role !== 'admin' && product.seller.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Not authorized.' });
  }
  await Product.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ message: 'Product removed.' });
}));

// PUT /api/products/:id/wishlist
router.put('/:id/wishlist', protect, asyncHandler(async (req, res) => {
  const user = await require('../models/User').findById(req.user._id);
  const productId = req.params.id;
  const idx = user.wishlist.indexOf(productId);
  if (idx === -1) user.wishlist.push(productId);
  else user.wishlist.splice(idx, 1);
  await user.save();
  res.json({ wishlist: user.wishlist, added: idx === -1 });
}));

module.exports = router;
