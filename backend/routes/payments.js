const express = require('express');
const asyncHandler = require('express-async-handler');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/payments/create-intent
router.post('/create-intent', optionalAuth, asyncHandler(async (req, res) => {
  const { amount, currency = 'cad', orderId } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Valid amount required.' });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // cents
    currency,
    metadata: { orderId: orderId || '', userId: req.user?._id?.toString() || 'guest' },
    automatic_payment_methods: { enabled: true },
  });

  res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
}));

// POST /api/payments/confirm
router.post('/confirm', optionalAuth, asyncHandler(async (req, res) => {
  const { orderId, paymentIntentId } = req.body;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    return res.status(400).json({ message: 'Payment not yet successful.' });
  }

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: 'Order not found.' });

  order.paymentStatus = 'paid';
  order.status = 'processing';
  order.stripePaymentIntentId = paymentIntentId;
  order.statusHistory.push({ status: 'processing', note: 'Payment confirmed via Stripe' });
  await order.save();

  res.json({ success: true, order });
}));

// POST /api/payments/webhook (raw body required - handled in server.js)
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    if (pi.metadata.orderId) {
      await Order.findByIdAndUpdate(pi.metadata.orderId, {
        paymentStatus: 'paid', status: 'processing',
        stripePaymentIntentId: pi.id,
        $push: { statusHistory: { status: 'processing', note: 'Payment confirmed via webhook' } },
      });
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const order = await Order.findOne({ stripePaymentIntentId: charge.payment_intent });
    if (order) { order.paymentStatus = 'refunded'; order.status = 'refunded'; await order.save(); }
  }

  res.json({ received: true });
});

// POST /api/payments/refund (admin)
router.post('/refund', protect, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only.' });
  const { orderId, amount } = req.body;
  const order = await Order.findById(orderId);
  if (!order?.stripePaymentIntentId) return res.status(400).json({ message: 'No payment to refund.' });

  const refundParams = { payment_intent: order.stripePaymentIntentId };
  if (amount) refundParams.amount = Math.round(amount * 100);

  const refund = await stripe.refunds.create(refundParams);
  order.paymentStatus = 'refunded';
  order.status = 'refunded';
  order.statusHistory.push({ status: 'refunded', note: `Refund issued: ${refund.id}` });
  await order.save();
  res.json({ success: true, refund });
}));

module.exports = router;
