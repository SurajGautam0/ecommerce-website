const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  userAvatar: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  images: [String],
  isVerifiedPurchase: { type: Boolean, default: false },
  helpfulVotes: { type: Number, default: 0 },
  votedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isApproved: { type: Boolean, default: true },
}, { timestamps: true });

// One review per product per user
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// Update product rating after save/delete
reviewSchema.statics.calcAverageRating = async function (productId) {
  const stats = await this.aggregate([
    { $match: { product: productId, isApproved: true } },
    { $group: { _id: '$product', avgRating: { $avg: '$rating' }, numReviews: { $sum: 1 } } },
  ]);
  const Product = require('./Product');
  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, { rating: Math.round(stats[0].avgRating * 10) / 10, numReviews: stats[0].numReviews });
  } else {
    await Product.findByIdAndUpdate(productId, { rating: 0, numReviews: 0 });
  }
};

reviewSchema.post('save', function () { this.constructor.calcAverageRating(this.product); });
reviewSchema.post('deleteOne', { document: true }, function () { this.constructor.calcAverageRating(this.product); });

module.exports = mongoose.model('Review', reviewSchema);
