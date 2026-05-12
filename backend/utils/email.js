const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Suraj Commerce Hub <noreply@surajcommerce.com>',
    to, subject, html,
  });
};

exports.sendOrderConfirmation = async (order, email) => {
  const itemsHtml = order.items.map(i =>
    `<tr><td style="padding:8px;border-bottom:1px solid #f0e8dc">${i.title}</td><td style="padding:8px;border-bottom:1px solid #f0e8dc;text-align:center">${i.quantity}</td><td style="padding:8px;border-bottom:1px solid #f0e8dc;text-align:right">$${(i.price * i.quantity).toFixed(2)}</td></tr>`
  ).join('');

  await sendEmail({
    to: email,
    subject: `Order Confirmed! ${order.orderNumber} - Suraj Commerce Hub`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fffaf3">
        <div style="background:#bc6c25;padding:30px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px">Order Confirmed!</h1>
          <p style="color:#ffe0c0;margin:8px 0 0">Order #${order.orderNumber}</p>
        </div>
        <div style="padding:30px">
          <p>Hi ${order.shipping.fullName}, thank you for your order!</p>
          <table width="100%" style="border-collapse:collapse;margin:20px 0">
            <thead><tr style="background:#f5efe6"><th style="padding:10px;text-align:left">Item</th><th style="padding:10px;text-align:center">Qty</th><th style="padding:10px;text-align:right">Price</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div style="text-align:right;padding:10px 0;border-top:2px solid #bc6c25">
            <p>Subtotal: <strong>$${order.subtotal.toFixed(2)}</strong></p>
            <p>Shipping: <strong>$${order.shippingCost.toFixed(2)}</strong></p>
            ${order.discount > 0 ? `<p>Discount: <strong>-$${order.discount.toFixed(2)}</strong></p>` : ''}
            <p>Tax (13%): <strong>$${order.tax.toFixed(2)}</strong></p>
            <h3 style="color:#bc6c25">Total: $${order.total.toFixed(2)}</h3>
          </div>
          <p style="color:#888;font-size:13px">We'll send you a tracking number once your order ships.</p>
        </div>
        <div style="background:#f5efe6;padding:20px;text-align:center;color:#888;font-size:12px">
          © ${new Date().getFullYear()} Suraj Commerce Hub. All rights reserved.
        </div>
      </div>`,
  });
};

exports.sendPasswordReset = async (email, name, resetUrl) => {
  await sendEmail({
    to: email,
    subject: 'Password Reset - Suraj Commerce Hub',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fffaf3">
        <div style="background:#bc6c25;padding:30px;text-align:center">
          <h1 style="color:#fff;margin:0">Reset Your Password</h1>
        </div>
        <div style="padding:30px">
          <p>Hi ${name},</p>
          <p>You requested a password reset. Click the button below to set a new password. This link expires in 1 hour.</p>
          <div style="text-align:center;margin:30px 0">
            <a href="${resetUrl}" style="background:#bc6c25;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Reset Password</a>
          </div>
          <p style="color:#888;font-size:13px">If you didn't request this, ignore this email. Your password won't change.</p>
        </div>
      </div>`,
  });
};

exports.sendWelcome = async (email, name) => {
  await sendEmail({
    to: email,
    subject: 'Welcome to Suraj Commerce Hub!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fffaf3">
        <div style="background:#bc6c25;padding:30px;text-align:center">
          <h1 style="color:#fff;margin:0">Welcome, ${name}!</h1>
        </div>
        <div style="padding:30px;text-align:center">
          <p>Thank you for joining Suraj Commerce Hub. Explore thousands of products and enjoy a seamless shopping experience.</p>
          <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}" style="background:#bc6c25;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">Start Shopping</a>
        </div>
      </div>`,
  });
};
