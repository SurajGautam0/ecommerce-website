const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: String,
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount: Number,
  usageLimit: { type: Number, default: null },
  usedCount: { type: Number, default: 0 },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  applicableCategories: [String],
}, { timestamps: true });

couponSchema.methods.isValid = function (orderAmount, userId) {
  const now = new Date();
  if (!this.isActive) return { valid: false, message: 'Coupon is inactive.' };
  if (now < this.validFrom || now > this.validUntil) return { valid: false, message: 'Coupon has expired.' };
  if (this.usageLimit && this.usedCount >= this.usageLimit) return { valid: false, message: 'Coupon usage limit reached.' };
  if (orderAmount < this.minOrderAmount) return { valid: false, message: `Minimum order amount is $${this.minOrderAmount}.` };
  if (userId && this.usedBy.includes(userId)) return { valid: false, message: 'You have already used this coupon.' };
  return { valid: true };
};

couponSchema.methods.calcDiscount = function (orderAmount) {
  if (this.type === 'percentage') {
    const discount = (orderAmount * this.value) / 100;
    return this.maxDiscount ? Math.min(discount, this.maxDiscount) : discount;
  }
  return Math.min(this.value, orderAmount);
};

module.exports = mongoose.model('Coupon', couponSchema);
