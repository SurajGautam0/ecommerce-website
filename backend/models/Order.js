const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: String,
  image: String,
  price: Number,
  quantity: { type: Number, required: true, min: 1 },
  variant: { name: String, option: String },
});

const shippingSchema = new mongoose.Schema({
  fullName: String,
  email: String,
  phone: String,
  street: String,
  city: String,
  state: String,
  postalCode: String,
  country: { type: String, default: 'Canada' },
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  guestEmail: String,
  items: [orderItemSchema],
  shipping: shippingSchema,
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, default: 12 },
  tax: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  couponCode: String,
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'packing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
  },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
  paymentMethod: { type: String, default: 'stripe' },
  stripePaymentIntentId: String,
  stripeChargeId: String,
  trackingNumber: String,
  notes: String,
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String,
  }],
}, { timestamps: true });

// Auto-generate order number
orderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD-${String(count + 1001).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
