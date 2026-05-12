# 🛍️ Suraj Commerce Hub

A modern, full-featured fashion ecommerce website built with pure HTML, CSS and JavaScript — no frameworks. Designed for Nepal and worldwide shoppers with full Nepali payment support.

🌐 **Live Demo:** [surajecommerce.vercel.app](https://surajecommerce.vercel.app)
📦 **GitHub:** [github.com/SurajGautam0/ecommerce-website](https://github.com/SurajGautam0/ecommerce-website)

---

## ✨ Features

### 🛒 Shopping Experience
- 200+ products across 13 categories — Clothes, Footwear, Jewelry, Cosmetics, Glasses, Bags, Perfumes & more
- Product quick view, image zoom & magnifier, size guide
- Wishlist, compare up to 4 products side-by-side
- Recently viewed, "You May Also Like" recommendations
- Bundle deals, gift wrap option, coupon codes
- Infinite scroll with skeleton loaders
- Voice search (Web Speech API)
- Search autocomplete with suggestions

### 💳 Payments — Nepal & International
| Method | Type |
|--------|------|
| 🟢 eSewa | QR code + wallet |
| 🟣 Khalti | QR code + wallet |
| 🔴 Nepali QR (FonePay) | Scan with any Nepali banking app |
| 🟠 IME Pay | QR code |
| 🔵 ConnectIPS | Interbank transfer |
| 🟡 Cash on Delivery | Available across Nepal |
| 💳 Stripe | International credit/debit cards |

### 👑 Admin Dashboard
- Revenue, orders, customers & low stock stats
- Full product management (add / edit / delete)
- Order management with status filters
- User management with role badges
- Analytics — category breakdown & payment charts
- Store settings with toggle switches

### 🏪 Seller Dashboard
- Earnings overview (total, monthly, pending payout, platform fee)
- Own product listings with edit/delete
- Order tracking for seller's products
- Seller profile management

### 👤 User Dashboard
- Profile management & password change
- Order history & live tracking timeline
- Wishlist grid view
- Saved shipping address
- Review history

### 🎨 UI / UX Highlights
- 🌙 Dark mode toggle
- 🔥 Animated flash sale bar with scrolling marquee
- ⏰ Deal of the Day with live countdown & auto-rotate
- 🎰 Spin & Win wheel for discount coupons
- 🤖 AI Chatbot assistant
- ⌨️ Keyboard shortcuts panel
- 👁️ Live viewers counter per product
- 📉 Price drop alert subscription
- 🎉 Confetti animation on order success
- 🖱️ Card tilt parallax effect on mouse hover

### 📱 PWA Support
- Installable as Android / iOS app from browser
- Service worker with full offline support
- Blur-up progressive image loading
- Optimized scroll with IntersectionObserver

---

## 🔐 Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| 👑 Admin | admin@surajcommerce.com | Admin@1234 |
| 🏪 Seller | seller@surajcommerce.com | Seller@1234 |

> Click either row in the login panel to auto-fill credentials.

---

## 🗂️ Project Structure

```
ecommerce-website/
├── frontend/
│   ├── index.html          # Single-page app
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker
│   └── assets/
│       ├── css/style.css   # All styles
│       ├── js/script.js    # All app logic
│       └── images/         # Product & banner images
├── backend/
│   ├── server.js           # Express API
│   ├── models/             # MongoDB models
│   ├── routes/             # REST API routes
│   └── utils/              # Email, token, seed
└── vercel.json             # Vercel deployment config
```

---

## 🚀 Run Locally

```bash
# Clone the repo
git clone https://github.com/SurajGautam0/ecommerce-website.git
cd ecommerce-website

# Open frontend — works instantly, no build needed
# Use VS Code Live Server → open frontend/index.html

# Optional: run the backend API
cd backend
npm install
cp .env.example .env    # fill in MongoDB URI, JWT secret, Stripe keys
npm run dev             # runs on http://localhost:5000
```

> **Demo mode:** The frontend works 100% offline without the backend — all products, cart, wishlist, payments and dashboards are functional using built-in demo data.

---

## 🧪 Test Credentials

**Stripe test card:**
```
Card:   4242 4242 4242 4242
Expiry: Any future date
CVC:    Any 3 digits
```

**Demo coupon codes:**
| Code | Discount |
|------|----------|
| WELCOME10 | 10% off |
| SUMMER25 | 25% off (max $50) |
| SAVE20 | $20 off orders over $100 |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript ES6+ |
| Backend | Node.js, Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Payments | Stripe, eSewa, Khalti, FonePay, IME Pay |
| PWA | Service Worker, Web App Manifest |
| Hosting | Vercel |

---

## 📦 Product Categories

`Dress & Frock` `Winter Wear` `Jackets` `T-Shirts` `Shorts & Jeans` `Hats & Caps` `Sports` `Shoes & Footwear` `Watches & Jewelry` `Cosmetics & Beauty` `Glasses & Lens` `Bags & Accessories` `Perfume & Fragrance`

---

## 👨‍💻 Author

**Suraj Gautam**
📍 Nepal
🔗 [github.com/SurajGautam0](https://github.com/SurajGautam0)

---

⭐ **Star this repo** if you found it useful!
