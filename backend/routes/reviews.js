const express = require('express');
const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/reviews/product/:productId
router.get('/product/:productId', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, sort = 'newest' } = req.query;
  const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, highest: { rating: -1 }, lowest: { rating: 1 }, helpful: { helpfulVotes: -1 } };
  const reviews = await Review.find({ product: req.params.productId, isApproved: true })
    .sort(sortMap[sort] || sortMap.newest)
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  const total = await Review.countDocuments({ product: req.params.productId, isApproved: true });
  const ratingDist = await Review.aggregate([
    { $match: { product: require('mongoose').Types.ObjectId.createFromHexString(req.params.productId), isApproved: true } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);
  res.json({ reviews, total, ratingDist });
}));

// POST /api/reviews
router.post('/', protect, asyncHandler(async (req, res) => {
  const { product, rating, title, body } = req.body;
  if (!product || !rating || !title || !body) return res.status(400).json({ message: 'All fields required.' });

  // Check verified purchase
  const order = await Order.findOne({ user: req.user._id, 'items.product': product, paymentStatus: 'paid' });

  const review = await Review.create({
    product, user: req.user._id, userName: req.user.name, userAvatar: req.user.avatar,
    rating, title, body, isVerifiedPurchase: !!order,
  });
  res.status(201).json(review);
}));

// PUT /api/reviews/:id/helpful
router.put('/:id/helpful', protect, asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Review not found.' });
  if (review.votedBy.includes(req.user._id)) return res.status(400).json({ message: 'Already voted.' });
  review.helpfulVotes += 1;
  review.votedBy.push(req.user._id);
  await review.save();
  res.json({ helpfulVotes: review.helpfulVotes });
}));

// DELETE /api/reviews/:id
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Review not found.' });
  if (req.user.role !== 'admin' && review.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Not authorized.' });
  }
  await review.deleteOne();
  res.json({ message: 'Review removed.' });
}));

module.exports = router;
