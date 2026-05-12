# Suraj Commerce Hub — Full Stack Ecommerce

A production-ready ecommerce website with Node.js + Express + MongoDB backend and a refined vanilla JS frontend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Backend | Node.js, Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT (JSON Web Tokens) + bcryptjs |
| Payments | Stripe (test mode) |
| Email | Nodemailer (Gmail SMTP) |
| File Upload | Multer |

---

## Features

- ✅ User registration & login (JWT auth)
- ✅ Role-based access (Customer / Seller / Admin)
- ✅ Product catalog with search, filter, sort, pagination
- ✅ Product detail modal with image gallery
- ✅ Shopping cart with coupon codes
- ✅ Multi-step checkout (Shipping → Stripe Payment → Confirmation)
- ✅ Customer reviews & star ratings (verified purchase badge)
- ✅ Wishlist (persists across sessions)
- ✅ Order history & status tracking
- ✅ Admin dashboard (revenue, pending orders, low stock, inventory)
- ✅ Seller dashboard (per-seller revenue, products)
- ✅ Email confirmations (order, password reset, welcome)
- ✅ Image upload (Multer)
- ✅ Responsive design (mobile-first)
- ✅ Demo mode (works offline without backend)

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or MongoDB Atlas)
- Stripe account (free test keys)

### 1. Clone & install backend

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
MONGO_URI=mongodb://localhost:27017/suraj-commerce-hub
JWT_SECRET=your_secret_key_here
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_gmail_app_password
CLIENT_URL=http://127.0.0.1:5500
```

### 3. Get Stripe keys

1. Go to [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)
2. Copy **Publishable key** → paste in `frontend/assets/js/script.js` line: `const STRIPE_PK = '...'`
3. Copy **Secret key** → paste in `.env` as `STRIPE_SECRET_KEY`

### 4. Seed the database

```bash
cd backend
npm run seed
```

Default accounts:
| Role | Email | Password |
|---|---|---|
| Admin | admin@surajcommerce.com | admin123 |
| Seller | seller@surajcommerce.com | seller123 |
| Customer | customer@surajcommerce.com | customer123 |

### 5. Start backend

```bash
npm run dev
```

Server runs on `http://localhost:5000`

### 6. Open frontend

Open `frontend/index.html` in a browser (use VS Code Live Server or any static server).

> **Demo mode**: If the backend is not running, the site still works with built-in sample products and localStorage.

---

## Demo Coupon Codes

| Code | Discount |
|---|---|
| WELCOME10 | 10% off |
| SUMMER25 | 25% off (max $50) |
| SAVE20 | $20 off orders over $100 |

---

## Test Payment

Use Stripe test card:
- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits

---

## Project Structure

```
ecommerce-website/
├── backend/
│   ├── server.js
│   ├── .env.example
│   ├── package.json
│   ├── config/
│   ├── models/        (User, Product, Order, Review, Coupon)
│   ├── routes/        (auth, products, orders, reviews, payments, coupons, users, upload)
│   ├── middleware/    (auth, error handling)
│   └── utils/         (email, token, seed)
├── frontend/
│   ├── index.html
│   └── assets/
│       ├── css/style.css
│       └── js/script.js
└── README.md
```
