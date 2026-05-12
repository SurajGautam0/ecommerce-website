const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name: String,
  options: [String],
});

const productSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ['Dress & Frock', 'Winter Wear', 'Glasses & Lens', 'Shorts & Jeans',
           'T-Shirts', 'Jackets', 'Watches & Jewelry', 'Hats & Caps',
           'Bags & Accessories', 'Shoes & Footwear', 'Cosmetics', 'Perfume & Fragrance', 'Sports'],
  },
  images: [{ type: String }],
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number },
  stock: { type: Number, required: true, default: 0, min: 0 },
  sku: { type: String, unique: true, sparse: true },
  sold: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  numReviews: { type: Number, default: 0 },
  tags: [String],
  variants: [variantSchema],
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: String,
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  weight: Number,
  dimensions: { length: Number, width: Number, height: Number },
}, { timestamps: true });

// Auto-generate slug
productSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  next();
});

// Text search index
productSchema.index({ title: 'text', description: 'text', tags: 'text', category: 'text' });

module.exports = mongoose.model('Product', productSchema);
