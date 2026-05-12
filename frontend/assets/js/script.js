'use strict';

/* ============================================================
   SURAJ COMMERCE HUB — Frontend Application
   Connects to Node.js + Express + MongoDB backend
   Falls back to demo mode if backend is unavailable
   ============================================================ */

const API = 'http://localhost:5000/api';
const STRIPE_PK = 'pk_test_51OxYourStripePublishableKeyHere'; // Replace with your Stripe publishable key

let stripe = null;
let cardElement = null;
let currentOrderId = null;

/* ============================================================
   STATE
   ============================================================ */
const state = {
  user: JSON.parse(localStorage.getItem('sch-user') || 'null'),
  token: localStorage.getItem('sch-token') || null,
  cart: JSON.parse(localStorage.getItem('sch-cart') || '[]'),
  wishlist: JSON.parse(localStorage.getItem('sch-wishlist') || '[]'),
  recentlyViewed: JSON.parse(localStorage.getItem('sch-rv') || '[]'),
  compareList: [],
  products: [],
  currentProduct: null,
  filters: { category: '', search: '', sort: 'featured', minPrice: '', maxPrice: '', rating: 0, inStockOnly: false },
  pagination: { page: 1, pages: 1, total: 0 },
  coupon: null,
  heroInterval: null,
  currentSlide: 0,
  shippingInfo: null,
  spinUsed: localStorage.getItem('sch-spin-used') === '1',
};

/* ============================================================
   CURRENCY
   ============================================================ */
const EXCHANGE_RATES = { USD: 1, NPR: 133, CAD: 1.36, EUR: 0.92 };
const CURRENCY_SYMBOLS = { USD: '$', NPR: 'रू', CAD: 'C$', EUR: '€' };

function getCurrency() { return state.currency || 'USD'; }
function getSymbol() { return CURRENCY_SYMBOLS[getCurrency()] || '$'; }

function convertPrice(usdAmount) {
  return usdAmount * (EXCHANGE_RATES[getCurrency()] || 1);
}

function formatPrice(usdAmount) {
  const c = getCurrency();
  const converted = convertPrice(usdAmount);
  const symbol = getSymbol();
  if (c === 'NPR') return `${symbol} ${Math.round(converted).toLocaleString()}`;
  return `${symbol}${converted.toFixed(2)}`;
}

function initCurrencySelector() {
  const sel = document.getElementById('currency-select');
  if (!sel) return;

  // Restore saved currency
  const saved = localStorage.getItem('sch-currency') || 'USD';
  state.currency = saved;
  sel.value = saved;
  applyCurrencyUI(saved);

  sel.addEventListener('change', () => {
    state.currency = sel.value;
    localStorage.setItem('sch-currency', sel.value);
    applyCurrencyUI(sel.value);
    // Re-render everything with new prices
    renderProducts(state.products);
    renderCartItems();
    renderShowcaseLists();
  });
}

function applyCurrencyUI(currency) {
  const isNPR = currency === 'NPR';

  // Topbar promo text
  const promo = document.querySelector('.topbar-promo');
  if (promo) {
    promo.textContent = isNPR
      ? 'नेपालभर FREE DELIVERY · रू 2,000 भन्दा माथिको अर्डरमा'
      : 'FREE SHIPPING THIS WEEK ORDER OVER - $55';
  }

  // Checkout: toggle USD vs NPR address fields
  document.querySelectorAll('.usd-field').forEach(el => el.classList.toggle('hidden', isNPR));
  document.querySelectorAll('.npr-field').forEach(el => el.classList.toggle('hidden', !isNPR));

  // Checkout: toggle payment sections
  const usdPay = document.getElementById('usd-payment-section');
  const nprPay = document.getElementById('npr-payment-section');
  if (usdPay) usdPay.classList.toggle('hidden', isNPR);
  if (nprPay) nprPay.classList.toggle('hidden', !isNPR);

  // Update deal section price
  const dealPrice = document.getElementById('deal-price');
  const dealOrig = document.getElementById('deal-original');
  if (dealPrice) dealPrice.textContent = formatPrice(150);
  if (dealOrig) dealOrig.textContent = formatPrice(200);

  // Update NPR payment amount fields
  updateNPRAmounts();
}

function updateNPRAmounts() {
  const { total } = calcCartTotals();
  const formatted = formatPrice(total);
  const nprAmt = 'रू ' + Math.round(total * 133).toLocaleString('ne-NP');
  ['esewa-amount', 'khalti-amount', 'cips-amount', 'imepay-amount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = nprAmt;
  });
  // Update QR display amount
  const qrAmt = document.getElementById('qr-amt-display');
  if (qrAmt) qrAmt.textContent = nprAmt;
}

/* Draw a simple QR-like pattern on a canvas */
function drawQR(canvasId, color = '#000', label = '') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cell = size / 21;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);

  // Deterministic pattern seeded by label string
  const seed = label.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  function rand(x, y) {
    const n = Math.sin(seed * 127.1 + x * 311.7 + y * 74.7) * 43758.5453;
    return n - Math.floor(n) > 0.45;
  }

  ctx.fillStyle = color;
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      // Finder patterns (top-left, top-right, bottom-left)
      const inFinder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      let fill = inFinder ? drawFinderCell(x, y) : rand(x, y);
      if (fill) ctx.fillRect(x * cell, y * cell, cell - 0.5, cell - 0.5);
    }
  }
  // Draw finder squares properly
  [[0,0],[14,0],[0,14]].forEach(([fx, fy]) => {
    ctx.strokeStyle = color; ctx.lineWidth = cell;
    ctx.strokeRect(fx * cell + cell * 0.5, fy * cell + cell * 0.5, 6 * cell, 6 * cell);
    ctx.fillStyle = color;
    ctx.fillRect((fx + 2) * cell, (fy + 2) * cell, 3 * cell, 3 * cell);
  });
  // Center logo for Nepali QR
  if (label === 'nepali') {
    ctx.fillStyle = '#fff';
    const cx = size / 2, cs = cell * 3;
    ctx.fillRect(cx - cs / 2, cx - cs / 2, cs, cs);
    ctx.fillStyle = '#e2231a';
    ctx.font = `bold ${cell * 1.4}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR', cx, cx);
  }
}

function drawFinderCell(x, y) {
  const mx = x % 14, my = y % 14;
  if (mx === 0 || mx === 6 || my === 0 || my === 6) return true;
  if (mx >= 2 && mx <= 4 && my >= 2 && my <= 4) return true;
  return false;
}

function initNepaliPaymentQR() {
  drawQR('esewa-qr', '#60bb46', 'esewa');
  drawQR('khalti-qr', '#5c2d91', 'khalti');
  drawQR('nepali-qr', '#e2231a', 'nepali');
  drawQR('imepay-qr', '#f7941d', 'imepay');

  // QR download button
  const dlBtn = document.getElementById('qr-download-btn');
  if (dlBtn) {
    dlBtn.onclick = () => {
      const canvas = document.getElementById('nepali-qr');
      if (!canvas) return;
      const a = document.createElement('a');
      a.download = 'suraj-commerce-nepali-qr.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
  }
}

/* ============================================================
   API HELPERS
   ============================================================ */
async function apiRequest(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  try {
    const res = await fetch(`${API}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  } catch (err) {
    if (err.name === 'TypeError') throw new Error('Cannot connect to server. Running in demo mode.');
    throw err;
  }
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function toast(message, type = 'default', duration = 4000) {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', default: 'fa-bell' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type] || icons.default}"></i><span>${message}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(el);
  setTimeout(() => { el.style.animation = 'none'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
}

/* ============================================================
   PERSISTENCE
   ============================================================ */
function saveLocal() {
  localStorage.setItem('sch-cart', JSON.stringify(state.cart));
  localStorage.setItem('sch-wishlist', JSON.stringify(state.wishlist));
  if (state.user) localStorage.setItem('sch-user', JSON.stringify(state.user));
  if (state.token) localStorage.setItem('sch-token', state.token);
}

function clearAuth() {
  state.user = null; state.token = null;
  localStorage.removeItem('sch-user'); localStorage.removeItem('sch-token');
}

/* ============================================================
   HERO SLIDER
   ============================================================ */
function initHero() {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hdot');
  if (!slides.length) return;

  function goTo(i) {
    slides[state.currentSlide].classList.remove('active');
    dots[state.currentSlide]?.classList.remove('active');
    state.currentSlide = (i + slides.length) % slides.length;
    slides[state.currentSlide].classList.add('active');
    dots[state.currentSlide]?.classList.add('active');
  }

  document.querySelector('.hero-next')?.addEventListener('click', () => goTo(state.currentSlide + 1));
  document.querySelector('.hero-prev')?.addEventListener('click', () => goTo(state.currentSlide - 1));
  dots.forEach(d => d.addEventListener('click', () => goTo(parseInt(d.dataset.slide))));
  state.heroInterval = setInterval(() => goTo(state.currentSlide + 1), 5000);
}

/* ============================================================
   DEAL COUNTDOWN TIMER
   ============================================================ */
function initDealOfDay() {
  const pad = n => String(n).padStart(2, '0');
  const $ = id => document.getElementById(id);

  // Pull deal products: featured items with a discount, rotate daily
  function getDealProducts() {
    const all = getDemoProducts();
    const deals = all.filter(p => p.originalPrice && p.originalPrice > p.price && p.images && p.images[0]);
    // Shuffle deterministically by today's date so deals rotate each day
    const seed = new Date().toDateString();
    deals.sort((a, b) => (a._id + seed).localeCompare(b._id + seed));
    return deals.slice(0, 6);
  }

  let deals = [];
  let current = 0;
  let countdownInterval = null;

  function starsHTML(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '<span style="color:var(--pink)">' + '★'.repeat(full) + (half ? '½' : '') + '</span>' +
           '<span style="color:var(--border)">' + '★'.repeat(empty) + '</span>' +
           ` <small style="color:var(--text-3);font-size:11px">(${deals[current]?.numReviews || 0})</small>`;
  }

  function renderDeal(index) {
    if (!deals.length) return;
    const p = deals[index];
    const card = $('deal-card');
    if (card) card.classList.add('fading');
    setTimeout(() => {
      const discount = p.originalPrice ? Math.round(100 - (p.price / p.originalPrice) * 100) : 0;
      const sold = p.numReviews ? Math.min(p.numReviews * 2, 980) : Math.floor(Math.random() * 200 + 50);
      const total = sold + p.stock;
      const pct = Math.round((sold / total) * 100);

      if ($('deal-img')) { $('deal-img').src = p.images[0]; $('deal-img').alt = p.title; }
      if ($('deal-badge')) $('deal-badge').textContent = `-${discount}%`;
      if ($('deal-cat-tag')) $('deal-cat-tag').textContent = p.category;
      if ($('deal-stars')) $('deal-stars').innerHTML = starsHTML(p.rating || 4.5);
      if ($('deal-title')) $('deal-title').textContent = p.title;
      if ($('deal-desc')) $('deal-desc').textContent = p.description || `Premium ${p.category} product. High quality, great value. Limited time offer.`;
      if ($('deal-price')) $('deal-price').textContent = formatPrice(p.price);
      if ($('deal-original')) $('deal-original').textContent = p.originalPrice ? formatPrice(p.originalPrice) : '';
      if ($('deal-save-tag')) $('deal-save-tag').textContent = p.originalPrice ? `Save ${formatPrice(p.originalPrice - p.price)}` : '';
      if ($('deal-sold')) $('deal-sold').textContent = sold;
      if ($('deal-available')) $('deal-available').textContent = p.stock;
      if ($('deal-bar')) { setTimeout(() => { if ($('deal-bar')) $('deal-bar').style.width = pct + '%'; }, 100); }
      if ($('deal-counter')) $('deal-counter').textContent = `${index + 1} / ${deals.length}`;

      // Wishlist button state
      const wBtn = $('deal-wishlist-btn');
      if (wBtn) {
        const inWL = state.wishlist.some(w => w._id === p._id);
        wBtn.classList.toggle('active', inWL);
        wBtn.innerHTML = inWL ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
        wBtn.onclick = () => { app.toggleWishlist(p._id); renderDeal(current); };
      }

      // Cart button
      const cartBtn = $('deal-add-cart');
      if (cartBtn) {
        cartBtn.onclick = () => { app.addToCart(p._id); cartBtn.textContent = '✓ ADDED!'; setTimeout(() => { cartBtn.innerHTML = '<i class="fas fa-cart-plus"></i> ADD TO CART'; }, 1500); };
      }

      // Quick view
      const viewBtn = $('deal-view-btn');
      if (viewBtn) viewBtn.onclick = () => app.openProductModal(p._id);

      // Strip highlight
      document.querySelectorAll('.deal-strip-item').forEach((el, i) => el.classList.toggle('active', i === index));

      if (card) card.classList.remove('fading');
    }, 150);
  }

  function renderStrip() {
    const strip = $('deal-strip');
    if (!strip || !deals.length) return;
    strip.innerHTML = deals.slice(0, 3).map((p, i) => {
      const disc = p.originalPrice ? Math.round(100 - (p.price / p.originalPrice) * 100) : 0;
      return `<div class="deal-strip-item${i === 0 ? ' active' : ''}" onclick="window._dealGoTo(${i})">
        <img class="deal-strip-img" src="${p.images[0]}" alt="${p.title}" loading="lazy"/>
        <div class="deal-strip-info">
          <div class="deal-strip-name">${p.title}</div>
          <div class="deal-strip-prices">
            <span class="deal-strip-price">${formatPrice(p.price)}</span>
            ${p.originalPrice ? `<span class="deal-strip-orig">${formatPrice(p.originalPrice)}</span>` : ''}
            ${disc ? `<span class="deal-badge" style="position:static;font-size:9px;padding:1px 5px">-${disc}%</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  window._dealGoTo = function(i) {
    current = i;
    renderDeal(current);
    resetCountdown();
  };

  function resetCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    // Each deal expires at midnight tonight
    const target = new Date();
    target.setDate(target.getDate() + (current === 0 ? 1 : current === 1 ? 2 : 3));
    target.setHours(23, 59, 59, 0);

    function tick() {
      const diff = Math.max(0, target - new Date());
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000) / 60000);
      const secs  = Math.floor((diff % 60000) / 1000);
      if ($('cd-days'))  $('cd-days').textContent  = pad(days);
      if ($('cd-hours')) $('cd-hours').textContent = pad(hours);
      if ($('cd-mins'))  $('cd-mins').textContent  = pad(mins);
      if ($('cd-secs'))  $('cd-secs').textContent  = pad(secs);
    }
    tick();
    countdownInterval = setInterval(tick, 1000);
  }

  // Nav buttons
  const prevBtn = $('deal-prev');
  const nextBtn = $('deal-next');
  if (prevBtn) prevBtn.onclick = () => { current = (current - 1 + deals.length) % deals.length; renderDeal(current); resetCountdown(); };
  if (nextBtn) nextBtn.onclick = () => { current = (current + 1) % deals.length; renderDeal(current); resetCountdown(); };

  // Auto-rotate every 8s
  let autoTimer = setInterval(() => {
    current = (current + 1) % deals.length;
    renderDeal(current);
  }, 8000);
  // Pause on hover
  const section = document.querySelector('.deal-section');
  if (section) {
    section.addEventListener('mouseenter', () => clearInterval(autoTimer));
    section.addEventListener('mouseleave', () => {
      autoTimer = setInterval(() => { current = (current + 1) % deals.length; renderDeal(current); }, 8000);
    });
  }

  // Init after products are available
  function tryInit() {
    const all = getDemoProducts();
    if (all.length) {
      deals = getDealProducts();
      renderStrip();
      renderDeal(0);
      resetCountdown();
    } else {
      setTimeout(tryInit, 500);
    }
  }
  // Give products time to load from API or demo
  setTimeout(tryInit, 600);
}

function initCountdown() { /* replaced by initDealOfDay */ }

/* ============================================================
   LIVE NOTIFICATION
   ============================================================ */
function initLiveNotif() {
  const products = ['Rose Gold Earrings', 'Floral Dress', 'Leather Jacket', 'Running Sneakers', 'Chronograph Watch', 'Yoga Leggings'];
  const cities = ['New York', 'London', 'Paris', 'Toronto', 'Sydney', 'Dubai'];
  const times = ['2 minutes ago', '5 minutes ago', '10 minutes ago', '15 minutes ago'];

  setTimeout(() => {
    const notif = document.getElementById('live-notif');
    if (!notif) return;
    const p = products[Math.floor(Math.random() * products.length)];
    const c = cities[Math.floor(Math.random() * cities.length)];
    const t = times[Math.floor(Math.random() * times.length)];
    document.getElementById('live-notif-product').textContent = p;
    document.getElementById('live-notif-time').textContent = `${c} · ${t}`;
    notif.style.display = 'flex';
    setTimeout(() => { notif.style.display = 'none'; }, 8000);
  }, 3000);
}

/* ============================================================
   NEWSLETTER MODAL
   ============================================================ */
function initNewsletterModal() {
  if (localStorage.getItem('sch-nl-shown')) return;
  setTimeout(() => {
    openModal('newsletter-modal');
    localStorage.setItem('sch-nl-shown', '1');
  }, 6000);
}

/* ============================================================
   PRODUCTS
   ============================================================ */
async function fetchProducts() {
  const { category, search, sort, minPrice, maxPrice } = state.filters;
  const { page } = state.pagination;

  showSkeleton(true);
  document.getElementById('empty-state').classList.add('hidden');

  try {
    const params = new URLSearchParams({ page, limit: 12, sort });
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);

    const data = await Promise.race([
      apiRequest(`/products?${params}`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    let products = data.products || [];
    const { rating, inStockOnly } = state.filters;
    if (rating > 0) products = products.filter(p => p.rating >= rating);
    if (inStockOnly) products = products.filter(p => p.stock > 0);

    if (!products.length) {
      renderDemoProducts();
    } else {
      state.products = products;
      state.pagination = { page: data.page, pages: data.pages, total: data.total };
      renderProducts(products);
      renderPagination();
      const rc = document.getElementById('results-count');
      if (rc) rc.textContent = `${data.total} product${data.total !== 1 ? 's' : ''} found`;
    }
  } catch {
    renderDemoProducts();
  } finally {
    showSkeleton(false);
    // Safety net: if grid is still empty after everything, show demo products
    const grid = document.getElementById('product-grid');
    if (grid && !grid.children.length) renderDemoProducts();
  }
}

function renderDemoProducts() {
  const demos = getDemoProducts().filter(p => {
    const { category, search, rating, inStockOnly } = state.filters;
    if (category && p.category !== category) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (rating > 0 && p.rating < rating) return false;
    if (inStockOnly && p.stock === 0) return false;
    return true;
  });
  state.products = demos;
  renderProducts(demos);
  const rc = document.getElementById('results-count');
  if (rc) rc.textContent = `${demos.length} product${demos.length !== 1 ? 's' : ''} found`;
}

function getLuxuryPerfumes() {
  // Pool of 25 high-quality perfume images from Unsplash
  const imgs = [
    'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&q=80',
    'https://images.unsplash.com/photo-1594913947050-d8c8a73b5b67?w=500&q=80',
    'https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=500&q=80',
    'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=500&q=80',
    'https://images.unsplash.com/photo-1590736969596-4b9571a1d7f6?w=500&q=80',
    'https://images.unsplash.com/photo-1593256373560-3f2a7ebb7b4f?w=500&q=80',
    'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=500&q=80',
    'https://images.unsplash.com/photo-1541643600914-78b084683702?w=500&q=80',
    'https://images.unsplash.com/photo-1619994403073-2cec844b8e63?w=500&q=80',
    'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=500&q=80',
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=500&q=80',
    'https://images.unsplash.com/photo-1528740561666-dc2479dc08ab?w=500&q=80',
    'https://images.unsplash.com/photo-1575402664876-9df0428f553d?w=500&q=80',
    'https://images.unsplash.com/photo-1586495777744-4e6232bf2278?w=500&q=80',
    'https://images.unsplash.com/photo-1567721913486-6585f069b3e3?w=500&q=80',
    'https://images.unsplash.com/photo-1549971021-32bef87fd7f8?w=500&q=80',
    'https://images.unsplash.com/photo-1518623001395-125242310d0c?w=500&q=80',
    'https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=500&q=80',
    'https://images.unsplash.com/photo-1547997215-0c5e73c4c5a0?w=500&q=80',
    'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=500&q=80',
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=500&q=80',
    'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=500&q=80',
    'https://images.unsplash.com/photo-1557170334-a9632e77c6e4?w=500&q=80',
    'https://images.unsplash.com/photo-1505944357431-27579db47558?w=500&q=80',
    'https://images.unsplash.com/photo-1609587312208-cea54be969e7?w=500&q=80',
  ];
  const img = i => [imgs[i % imgs.length]];
  const SB = 'Suraj Boutique', UT = 'Urban Threads', LE = 'Le Luxe Paris', NR = 'Noir Maison';

  return [
    // ── CHANEL ──────────────────────────────────────────────
    { _id:'pf001', title:'Chanel No. 5 EDP', category:'Perfume & Fragrance', price:189.99, originalPrice:220.00, stock:12, rating:4.9, numReviews:3120, isFeatured:true, description:'The world\'s most iconic fragrance. Timeless floral aldehyde with ylang-ylang, rose absolute, jasmine, civet and vetiver. 100ml EDP.', images:img(0), sellerName:SB },
    { _id:'pf002', title:'Chanel Coco Mademoiselle EDP', category:'Perfume & Fragrance', price:169.99, originalPrice:198.00, stock:18, rating:4.9, numReviews:2876, isFeatured:true, description:'An audacious, free-spirited fragrance. Brilliant top note of orange, heart of rose and jasmine, sensual base of patchouli and vetiver. 100ml EDP.', images:img(1), sellerName:SB },
    { _id:'pf003', title:'Chanel Chance EDP', category:'Perfume & Fragrance', price:155.00, originalPrice:182.00, stock:20, rating:4.8, numReviews:1945, description:'A round, voluptuous fragrance that combines fresh and soft. Pink pepper, jasmine, white musk, patchouli. 100ml EDP.', images:img(2), sellerName:SB },
    { _id:'pf004', title:'Chanel Bleu de Chanel EDP', category:'Perfume & Fragrance', price:175.00, originalPrice:200.00, stock:14, rating:4.9, numReviews:2234, isFeatured:true, description:'A woody, aromatic fragrance for the man who defies convention. Citrus, labdanum, sandalwood and cedar. 100ml EDP.', images:img(3), sellerName:SB },
    { _id:'pf005', title:'Chanel Allure Homme Sport EDT', category:'Perfume & Fragrance', price:142.00, originalPrice:165.00, stock:22, rating:4.7, numReviews:1678, description:'An energizing, elegant masculine scent. Sea notes, mandarin, pepper and cedar create an irresistible freshness. 100ml EDT.', images:img(4), sellerName:UT },
    { _id:'pf006', title:'Chanel No. 19 EDP', category:'Perfume & Fragrance', price:178.00, originalPrice:205.00, stock:9, rating:4.8, numReviews:987, description:'A bold, powerful fragrance. Galbanum, iris, rose and vetiver combine for a green, powdery sophistication. 100ml EDP.', images:img(5), sellerName:SB },
    { _id:'pf007', title:'Chanel Gabrielle EDP', category:'Perfume & Fragrance', price:162.00, originalPrice:190.00, stock:16, rating:4.7, numReviews:1123, description:'A radiant floral fragrance — tuberose, ylang-ylang, jasmine and orange blossom in a luminous, joyful accord. 100ml EDP.', images:img(6), sellerName:SB },

    // ── DIOR ────────────────────────────────────────────────
    { _id:'pf008', title:'Dior Sauvage EDP', category:'Perfume & Fragrance', price:149.99, originalPrice:175.00, stock:18, rating:4.9, numReviews:2780, isFeatured:true, description:'Bold, noble and wild. Bergamot from Calabria, a pepper-spiced heart, and a powerful base of ambroxan. 100ml EDP.', images:img(7), sellerName:UT },
    { _id:'pf009', title:'Dior Miss Dior EDP', category:'Perfume & Fragrance', price:158.00, originalPrice:185.00, stock:15, rating:4.8, numReviews:2145, isFeatured:true, description:'An ode to love. Grasse rose, peony, lily of the valley and a base of white musk for a tender, romantic signature. 100ml EDP.', images:img(8), sellerName:SB },
    { _id:'pf010', title:'Dior J\'adore EDP', category:'Perfume & Fragrance', price:165.00, originalPrice:192.00, stock:13, rating:4.8, numReviews:2456, description:'The very essence of femininity. Ylang-ylang, rose Granville, Damascus rose and jasmine sambac in a floral masterpiece. 100ml EDP.', images:img(9), sellerName:SB },
    { _id:'pf011', title:'Dior Fahrenheit EDT', category:'Perfume & Fragrance', price:128.00, originalPrice:150.00, stock:20, rating:4.7, numReviews:1567, description:'A legendary masculine fragrance. Honeysuckle, hawthorn, leather and vetiver in a daring, unforgettable composition. 100ml EDT.', images:img(10), sellerName:UT },
    { _id:'pf012', title:'Dior Hypnotic Poison EDT', category:'Perfume & Fragrance', price:138.00, originalPrice:162.00, stock:17, rating:4.7, numReviews:1234, description:'An intoxicating oriental. Bitter almond, jasmine, caraway, sandalwood and vanilla weave a spell of pure seduction. 100ml EDT.', images:img(11), sellerName:SB },
    { _id:'pf013', title:'Dior Homme Parfum', category:'Perfume & Fragrance', price:172.00, originalPrice:198.00, stock:11, rating:4.8, numReviews:987, description:'The most intense expression of Dior Homme. Iris, lavender, leather and heliotrope in a powerful, sensual masculinity. 100ml Parfum.', images:img(12), sellerName:UT },
    { _id:'pf014', title:'Dior Joy EDP', category:'Perfume & Fragrance', price:152.00, originalPrice:178.00, stock:19, rating:4.6, numReviews:876, description:'A sparkling, joyful fragrance. Bergamot, rose centifolia, jasmine grasse and white musk in a luminous, radiant bouquet. 90ml EDP.', images:img(13), sellerName:SB },

    // ── TOM FORD ─────────────────────────────────────────────
    { _id:'pf015', title:'Tom Ford Black Orchid EDP', category:'Perfume & Fragrance', price:219.99, originalPrice:260.00, stock:8, rating:4.8, numReviews:1560, isFeatured:true, description:'Luxurious and sensual — black orchid, dark chocolate, black truffle, bergamot and incense. The pinnacle of luxury. 100ml EDP.', images:img(14), sellerName:SB },
    { _id:'pf016', title:'Tom Ford Oud Wood EDP', category:'Perfume & Fragrance', price:289.99, originalPrice:340.00, stock:7, rating:4.9, numReviews:1234, isFeatured:true, description:'Rare oud wood, rosewood and cardamom with a warm sandalwood and vetiver base. An exotic, sophisticated masterpiece. 100ml EDP.', images:img(15), sellerName:SB },
    { _id:'pf017', title:'Tom Ford Tobacco Vanille EDP', category:'Perfume & Fragrance', price:299.99, originalPrice:355.00, stock:6, rating:4.9, numReviews:1098, isFeatured:true, description:'An opulent tobacco flower and vanilla accord with sweet wood sap and aromatic spices. Pure luxury. 100ml EDP.', images:img(16), sellerName:SB },
    { _id:'pf018', title:'Tom Ford Neroli Portofino EDP', category:'Perfume & Fragrance', price:259.99, originalPrice:310.00, stock:10, rating:4.8, numReviews:876, description:'The Italian Riviera in a bottle. Bergamot, mandarin, neroli, amber, rosewood and musk. 100ml EDP.', images:img(17), sellerName:LE },
    { _id:'pf019', title:'Tom Ford Tuscan Leather EDP', category:'Perfume & Fragrance', price:279.99, originalPrice:330.00, stock:8, rating:4.8, numReviews:765, description:'Rich leather blended with saffron, raspberry, thyme and jasmine. Intense, full-bodied and utterly sophisticated. 100ml EDP.', images:img(18), sellerName:SB },
    { _id:'pf020', title:'Tom Ford Rose Prick EDP', category:'Perfume & Fragrance', price:319.99, originalPrice:375.00, stock:5, rating:4.9, numReviews:654, description:'The most beautiful rose in the world. Turkish rose, Taif rose, rose bud with patchouli, oud, and castoreum. 50ml EDP.', images:img(19), sellerName:LE },
    { _id:'pf021', title:'Tom Ford Soleil Blanc EDP', category:'Perfume & Fragrance', price:249.99, originalPrice:295.00, stock:9, rating:4.7, numReviews:698, description:'The essence of sun-drenched luxury. Cardamom, bergamot, coconut water, heliotrope and benzoin. 100ml EDP.', images:img(20), sellerName:SB },
    { _id:'pf022', title:'Tom Ford Lost Cherry EDP', category:'Perfume & Fragrance', price:329.99, originalPrice:385.00, stock:4, rating:4.9, numReviews:543, isFeatured:true, description:'A heady, intoxicating cherry accord with bitter almond, Turkish rose, clove bud and sandalwood. Addictively luxurious. 50ml EDP.', images:img(21), sellerName:LE },

    // ── CREED ────────────────────────────────────────────────
    { _id:'pf023', title:'Creed Aventus EDP', category:'Perfume & Fragrance', price:399.99, originalPrice:450.00, stock:5, rating:5.0, numReviews:980, isFeatured:true, description:'The king of fragrances. Pineapple, blackcurrant, bergamot, apple with oakmoss, ambergris, musk and sandalwood. 100ml EDP.', images:img(22), sellerName:SB },
    { _id:'pf024', title:'Creed Green Irish Tweed EDP', category:'Perfume & Fragrance', price:379.99, originalPrice:430.00, stock:6, rating:4.9, numReviews:756, isFeatured:true, description:'Fresh and masculine — iris, verbena, sandalwood, ambergris, oakmoss. The fragrance that defined elegance. 100ml EDP.', images:img(23), sellerName:SB },
    { _id:'pf025', title:'Creed Silver Mountain Water EDP', category:'Perfume & Fragrance', price:359.99, originalPrice:410.00, stock:7, rating:4.8, numReviews:634, description:'Inspired by Swiss mountain streams. Black currant, grapefruit, bergamot with green tea, neroli and musk. 100ml EDP.', images:img(24), sellerName:LE },
    { _id:'pf026', title:'Creed Millesime Imperial EDP', category:'Perfume & Fragrance', price:389.99, originalPrice:440.00, stock:5, rating:4.9, numReviews:567, description:'An imperial marine fragrance. Sicilian mandarin, iris, musk, ambergris and sea notes in an oceanic symphony. 100ml EDP.', images:img(0), sellerName:SB },
    { _id:'pf027', title:'Creed Royal Oud EDP', category:'Perfume & Fragrance', price:419.99, originalPrice:480.00, stock:4, rating:4.9, numReviews:489, isFeatured:true, description:'A royal blend of pink pepper, grapefruit, bergamot, oud wood, cedar and sandalwood. Fit for royalty. 100ml EDP.', images:img(1), sellerName:LE },
    { _id:'pf028', title:'Creed Love in White EDP', category:'Perfume & Fragrance', price:369.99, originalPrice:420.00, stock:8, rating:4.7, numReviews:423, description:'A soft, luminous floral. Padouk wood, iris, white flowers, rice husk, ambergris and musk. Feminine perfection. 100ml EDP.', images:img(2), sellerName:SB },

    // ── JO MALONE ────────────────────────────────────────────
    { _id:'pf029', title:'Jo Malone Peony & Blush Suede', category:'Perfume & Fragrance', price:165.00, originalPrice:190.00, stock:10, rating:4.9, numReviews:1420, isFeatured:true, description:'Peony with powdery red rose petals, softened with apple and a hint of suede. Utterly feminine. 100ml Cologne.', images:img(3), sellerName:SB },
    { _id:'pf030', title:'Jo Malone Wood Sage & Sea Salt', category:'Perfume & Fragrance', price:148.00, originalPrice:172.00, stock:14, rating:4.8, numReviews:1234, description:'The raw beauty of nature — ambrette seed, clary sage, sea salt and driftwood. Effortlessly elegant. 100ml Cologne.', images:img(4), sellerName:UT },
    { _id:'pf031', title:'Jo Malone English Pear & Freesia', category:'Perfume & Fragrance', price:152.00, originalPrice:178.00, stock:16, rating:4.8, numReviews:1567, description:'Voluptuous Williams pear with white freesia, amber, patchouli and woods. The scent of an English country garden. 100ml Cologne.', images:img(5), sellerName:SB },
    { _id:'pf032', title:'Jo Malone Lime Basil & Mandarin', category:'Perfume & Fragrance', price:145.00, originalPrice:168.00, stock:18, rating:4.7, numReviews:1123, description:'A surprisingly sensual blend. Peppery basil, white thyme and hedione alongside aromatic lime. A modern classic. 100ml Cologne.', images:img(6), sellerName:UT },
    { _id:'pf033', title:'Jo Malone Orange Blossom', category:'Perfume & Fragrance', price:148.00, originalPrice:175.00, stock:12, rating:4.8, numReviews:987, description:'The joyful bloom of orange blossom and clementine flower, lifted with water lily and sheer vetiver. 100ml Cologne.', images:img(7), sellerName:SB },
    { _id:'pf034', title:'Jo Malone Blackberry & Bay', category:'Perfume & Fragrance', price:150.00, originalPrice:176.00, stock:11, rating:4.7, numReviews:876, description:'Ripe, wild blackberries crushed with bay laurel leaves over a base of cedarwood and vetiver. Rich and natural. 100ml Cologne.', images:img(8), sellerName:UT },
    { _id:'pf035', title:'Jo Malone Myrrh & Tonka', category:'Perfume & Fragrance', price:158.00, originalPrice:185.00, stock:9, rating:4.9, numReviews:765, isFeatured:true, description:'Enveloping warmth — myrrh resin, almond and tonka bean with soft musk. An intense, intimate fragrance. 100ml Cologne Intense.', images:img(9), sellerName:LE },

    // ── HERMÈS ───────────────────────────────────────────────
    { _id:'pf036', title:'Hermès Terre d\'Hermès EDP', category:'Perfume & Fragrance', price:178.00, originalPrice:205.00, stock:13, rating:4.9, numReviews:1876, isFeatured:true, description:'Earth, sky and humanity. Grapefruit, orange, flint, pepper, cedar and benzoin in a profoundly poetic fragrance. 100ml EDP.', images:img(10), sellerName:UT },
    { _id:'pf037', title:'Hermès Twilly d\'Hermès EDP', category:'Perfume & Fragrance', price:162.00, originalPrice:190.00, stock:15, rating:4.7, numReviews:1234, description:'Young, free and joyful — ginger, tuberose and sandalwood. An irresistible, playful femininity. 85ml EDP.', images:img(11), sellerName:SB },
    { _id:'pf038', title:'Hermès Jour d\'Hermès EDP', category:'Perfume & Fragrance', price:168.00, originalPrice:196.00, stock:14, rating:4.7, numReviews:987, description:'The radiance of a woman awakening. Geranium, gardenia, tuberose, white musk and vetiver. Luminous and feminine. 85ml EDP.', images:img(12), sellerName:SB },
    { _id:'pf039', title:'Hermès Un Jardin sur le Nil', category:'Perfume & Fragrance', price:155.00, originalPrice:180.00, stock:17, rating:4.6, numReviews:876, description:'A green oasis along the Nile. Green mango, sycamore, lotus and grapefruit in an exotic garden dream. 100ml EDT.', images:img(13), sellerName:UT },
    { _id:'pf040', title:'Hermès Eau des Merveilles EDT', category:'Perfume & Fragrance', price:148.00, originalPrice:172.00, stock:19, rating:4.6, numReviews:765, description:'Between the sky and the earth — orange, wood, ambergris and salt. A fragrance as mysterious as a meteor. 100ml EDT.', images:img(14), sellerName:SB },

    // ── YSL ──────────────────────────────────────────────────
    { _id:'pf041', title:'YSL Libre EDP', category:'Perfume & Fragrance', price:139.99, originalPrice:165.00, stock:15, rating:4.8, numReviews:1870, isFeatured:true, description:'Freedom embodied. Lavender from Provence meets Moroccan orange blossom absolute in a bold floral fougère. 90ml EDP.', images:img(15), sellerName:SB },
    { _id:'pf042', title:'YSL Black Opium EDP', category:'Perfume & Fragrance', price:132.00, originalPrice:158.00, stock:22, rating:4.8, numReviews:2345, isFeatured:true, description:'Addictive and glamorous. Coffee, white flowers and vanilla create the ultimate feminine rock fragrance. 90ml EDP.', images:img(16), sellerName:UT },
    { _id:'pf043', title:'YSL Mon Paris EDP', category:'Perfume & Fragrance', price:128.00, originalPrice:152.00, stock:18, rating:4.7, numReviews:1567, description:'Passionate love in a bottle. Strawberry, peony, white musk and patchouli. A whirlwind romance. 90ml EDP.', images:img(17), sellerName:SB },
    { _id:'pf044', title:'YSL Y EDP', category:'Perfume & Fragrance', price:122.00, originalPrice:145.00, stock:20, rating:4.7, numReviews:1234, description:'The fragrance of a new generation of men. Apple, ginger, bergamot, geranium, tonka bean and woody notes. 100ml EDP.', images:img(18), sellerName:UT },
    { _id:'pf045', title:'YSL Opium EDP', category:'Perfume & Fragrance', price:145.00, originalPrice:170.00, stock:12, rating:4.8, numReviews:1098, description:'A legendary oriental. Mandarin, jasmine, rose, coriander, clove, amber, vetiver and benzoin. 90ml EDP.', images:img(19), sellerName:SB },

    // ── GUCCI ─────────────────────────────────────────────────
    { _id:'pf046', title:'Gucci Bloom EDP', category:'Perfume & Fragrance', price:129.99, originalPrice:155.00, stock:19, rating:4.7, numReviews:2240, isFeatured:true, description:'A living white floral. Tuberose, jasmine and Rangoon creeper bloom together in lush abundance. 100ml EDP.', images:img(20), sellerName:UT },
    { _id:'pf047', title:'Gucci Guilty EDP', category:'Perfume & Fragrance', price:118.00, originalPrice:140.00, stock:24, rating:4.6, numReviews:1876, description:'Dare to be guilty. Pink pepper, mandarin and peach with lilac, geranium, patchouli and amber. 90ml EDP.', images:img(21), sellerName:SB },
    { _id:'pf048', title:'Gucci Flora Gorgeous Gardenia', category:'Perfume & Fragrance', price:122.00, originalPrice:145.00, stock:20, rating:4.7, numReviews:1456, description:'Pure floral intoxication. Gardenia, frangipani, pear blossom and patchouli in a joyfully feminine accord. 100ml EDP.', images:img(22), sellerName:UT },
    { _id:'pf049', title:'Gucci Mémoire d\'une Odeur EDP', category:'Perfume & Fragrance', price:135.00, originalPrice:160.00, stock:16, rating:4.7, numReviews:987, description:'A universal, timeless fragrance. Roman chamomile, Indian coral jasmine, musk, sandalwood and cedarwood. Unisex. 100ml EDP.', images:img(23), sellerName:LE },

    // ── VERSACE ───────────────────────────────────────────────
    { _id:'pf050', title:'Versace Eros EDP', category:'Perfume & Fragrance', price:119.99, originalPrice:145.00, stock:22, rating:4.7, numReviews:2030, description:'Mint leaves, Italian lemon zest, green apple, tonka bean, ambroxan and Madagascar vanilla. A Titan of fragrance. 100ml EDP.', images:img(24), sellerName:UT },
    { _id:'pf051', title:'Versace Dylan Blue EDP', category:'Perfume & Fragrance', price:112.00, originalPrice:135.00, stock:25, rating:4.6, numReviews:1678, description:'The essence of a modern man. Fig leaf, violet leaf, patchouli, incense and musk in a deep aquatic accord. 100ml EDP.', images:img(0), sellerName:UT },
    { _id:'pf052', title:'Versace Crystal Noir EDP', category:'Perfume & Fragrance', price:109.99, originalPrice:132.00, stock:20, rating:4.6, numReviews:1234, description:'Mysterious and seductive. Ginger, pepper, coconut, peony, gardenia, sandalwood and musk. 90ml EDP.', images:img(1), sellerName:SB },
    { _id:'pf053', title:'Versace Bright Crystal EDT', category:'Perfume & Fragrance', price:104.99, originalPrice:125.00, stock:28, rating:4.5, numReviews:1987, description:'Luminous and fresh. Pomegranate, yuzu, lotus, peony, magnolia, amber, musk and mahogany. 90ml EDT.', images:img(2), sellerName:UT },
    { _id:'pf054', title:'Versace Yellow Diamond EDT', category:'Perfume & Fragrance', price:108.00, originalPrice:130.00, stock:22, rating:4.5, numReviews:1456, description:'Vibrant and sparkling. Pear, amalfi lemon, freesia, nymphaea, mimosa, amber, guaiac wood and musk. 90ml EDT.', images:img(3), sellerName:SB },

    // ── GIORGIO ARMANI ────────────────────────────────────────
    { _id:'pf055', title:'Armani Acqua di Gio Profumo', category:'Perfume & Fragrance', price:134.99, originalPrice:160.00, stock:16, rating:4.8, numReviews:1980, isFeatured:true, description:'Marine notes, bergamot, sage and incense over a base of patchouli, labdanum and musk. The ultimate aquatic. 75ml EDP.', images:img(4), sellerName:UT },
    { _id:'pf056', title:'Armani Si EDP', category:'Perfume & Fragrance', price:128.00, originalPrice:152.00, stock:18, rating:4.8, numReviews:1765, isFeatured:true, description:'A modern, sophisticated femininity. Black currant, rose centifolia, freesia and chypre woody musk. 100ml EDP.', images:img(5), sellerName:SB },
    { _id:'pf057', title:'Armani Code Profumo', category:'Perfume & Fragrance', price:122.00, originalPrice:145.00, stock:20, rating:4.7, numReviews:1456, description:'The code of seduction. Green cardamom, tonka bean, cacao, tobacco flower and leather. 60ml EDP.', images:img(6), sellerName:UT },
    { _id:'pf058', title:'Armani Privé Rose d\'Arabie', category:'Perfume & Fragrance', price:265.00, originalPrice:310.00, stock:7, rating:4.9, numReviews:456, description:'A rare, opulent rose from the Arabian Peninsula. Rose, oud and woody musk in a royal floral oriental. 100ml EDP.', images:img(7), sellerName:LE },

    // ── PACO RABANNE ──────────────────────────────────────────
    { _id:'pf059', title:'Paco Rabanne 1 Million EDT', category:'Perfume & Fragrance', price:109.99, originalPrice:130.00, stock:24, rating:4.6, numReviews:2890, description:'Blood mandarin, cinnamon, leather, amber and patchouli. A bold, seductive masculine that demands attention. 100ml EDT.', images:img(8), sellerName:UT },
    { _id:'pf060', title:'Paco Rabanne Lady Million EDP', category:'Perfume & Fragrance', price:112.00, originalPrice:135.00, stock:22, rating:4.6, numReviews:2234, description:'Neroli, raspberry, jasmine, tuberose, orange blossom, patchouli and honey. Bold, glamorous, intoxicating. 80ml EDP.', images:img(9), sellerName:SB },
    { _id:'pf061', title:'Paco Rabanne Olympea EDP', category:'Perfume & Fragrance', price:118.00, originalPrice:140.00, stock:18, rating:4.7, numReviews:1678, description:'The goddess of modernity. Fresh fig, green water, black vanilla and cashmere wood. Powerful, warm and magnetic. 80ml EDP.', images:img(10), sellerName:UT },
    { _id:'pf062', title:'Paco Rabanne Invictus Intense', category:'Perfume & Fragrance', price:108.00, originalPrice:128.00, stock:26, rating:4.6, numReviews:1987, description:'A champion\'s fragrance. Grapefruit, bay laurel, intense guaiac wood and patchouli. Victorious and powerful. 100ml EDT.', images:img(11), sellerName:UT },

    // ── VIKTOR & ROLF ─────────────────────────────────────────
    { _id:'pf063', title:'Viktor & Rolf Flowerbomb EDP', category:'Perfume & Fragrance', price:159.99, originalPrice:185.00, stock:11, rating:4.8, numReviews:1730, isFeatured:true, description:'A floral explosion. Jasmine, rose, freesia, orchid and patchouli create an intoxicating floral grenade. 100ml EDP.', images:img(12), sellerName:SB },
    { _id:'pf064', title:'Viktor & Rolf Spicebomb EDP', category:'Perfume & Fragrance', price:148.00, originalPrice:172.00, stock:14, rating:4.7, numReviews:1234, description:'An explosive masculine oriental. Bergamot, grapefruit, saffron, leather, vetiver and tobacco. 90ml EDP.', images:img(13), sellerName:UT },
    { _id:'pf065', title:'Viktor & Rolf Good Fortune EDP', category:'Perfume & Fragrance', price:155.00, originalPrice:180.00, stock:13, rating:4.7, numReviews:876, description:'Lucky, bold and joyful. Midnight flower, magnolia, patchouli and musk. A fragrance of destiny. 90ml EDP.', images:img(14), sellerName:SB },

    // ── BYREDO ────────────────────────────────────────────────
    { _id:'pf066', title:'Byredo Gypsy Water EDP', category:'Perfume & Fragrance', price:245.00, originalPrice:285.00, stock:8, rating:4.9, numReviews:987, isFeatured:true, description:'The freedom of the open road. Bergamot, lemon, pepper, juniper berries, incense, pine needles, orris and sandalwood. 100ml EDP.', images:img(15), sellerName:LE },
    { _id:'pf067', title:'Byredo Mojave Ghost EDP', category:'Perfume & Fragrance', price:238.00, originalPrice:278.00, stock:9, rating:4.8, numReviews:876, description:'The scent of a rare, nameless flower surviving in the Mojave desert. Ambrette, sapodilla, violet, sandalwood. 100ml EDP.', images:img(16), sellerName:LE },
    { _id:'pf068', title:'Byredo Bal d\'Afrique EDP', category:'Perfume & Fragrance', price:242.00, originalPrice:282.00, stock:7, rating:4.8, numReviews:765, description:'An homage to Africa. Bergamot, African marigold, violet, neroli, musks and vetiver. Vibrant and earthy. 100ml EDP.', images:img(17), sellerName:LE },
    { _id:'pf069', title:'Byredo Bibliothèque EDP', category:'Perfume & Fragrance', price:252.00, originalPrice:295.00, stock:6, rating:4.9, numReviews:654, description:'The scent of old libraries. Plum, peach, violet, peony, beeswax, vanilla and white wood. Intellectual luxury. 100ml EDP.', images:img(18), sellerName:LE },
    { _id:'pf070', title:'Byredo Blanche EDP', category:'Perfume & Fragrance', price:235.00, originalPrice:275.00, stock:10, rating:4.7, numReviews:698, description:'Pure and luminous. Pink pepper, bergamot, aldehyde, neroli, peony, rose and sandalwood. 100ml EDP.', images:img(19), sellerName:LE },

    // ── LE LABO ───────────────────────────────────────────────
    { _id:'pf071', title:'Le Labo Santal 33 EDP', category:'Perfume & Fragrance', price:298.00, originalPrice:350.00, stock:6, rating:5.0, numReviews:1234, isFeatured:true, description:'The most iconic niche perfume of our time. Cardamom, iris, violet, cedarwood, sandalwood, leather and musk. 100ml EDP.', images:img(20), sellerName:LE },
    { _id:'pf072', title:'Le Labo Rose 31 EDP', category:'Perfume & Fragrance', price:278.00, originalPrice:328.00, stock:8, rating:4.9, numReviews:876, description:'Rose deconstructed and rebuilt for everyone. Turkish rose with cumin, cedar, musk and amber. Unisex. 100ml EDP.', images:img(21), sellerName:LE },
    { _id:'pf073', title:'Le Labo Another 13 EDP', category:'Perfume & Fragrance', price:268.00, originalPrice:315.00, stock:9, rating:4.8, numReviews:765, description:'An almost skin-like fragrance. Ambroxan, moss, jasmine, musk and ISO E Super. Intimate and addictive. 100ml EDP.', images:img(22), sellerName:LE },
    { _id:'pf074', title:'Le Labo Bergamote 22 EDP', category:'Perfume & Fragrance', price:258.00, originalPrice:302.00, stock:11, rating:4.7, numReviews:654, description:'A fresh, citrus explosion — bergamot, neroli, petitgrain, musk and vetiver. Clean yet complex. 100ml EDP.', images:img(23), sellerName:LE },
    { _id:'pf075', title:'Le Labo Thé Noir 29 EDP', category:'Perfume & Fragrance', price:272.00, originalPrice:320.00, stock:7, rating:4.8, numReviews:567, description:'Smoked black tea, fig, laurel and musk. A singular tea fragrance with depth, smoke and mystery. 100ml EDP.', images:img(24), sellerName:LE },

    // ── MAISON MARGIELA REPLICA ───────────────────────────────
    { _id:'pf076', title:'Replica Beach Walk EDT', category:'Perfume & Fragrance', price:185.00, originalPrice:215.00, stock:14, rating:4.8, numReviews:1456, isFeatured:true, description:'Summer mornings on the beach. Bergamot, lemon, coconut milk, heliotrope and white musk. Pure vacation. 100ml EDT.', images:img(0), sellerName:NR },
    { _id:'pf077', title:'Replica By the Fireplace EDT', category:'Perfume & Fragrance', price:185.00, originalPrice:215.00, stock:13, rating:4.9, numReviews:1678, isFeatured:true, description:'Chestnut, pink pepper, orange blossom, guaiac wood, vanilla and cashmeran. The warmth of winter evenings. 100ml EDT.', images:img(1), sellerName:NR },
    { _id:'pf078', title:'Replica Flower Market EDT', category:'Perfume & Fragrance', price:185.00, originalPrice:215.00, stock:16, rating:4.7, numReviews:1234, description:'A morning in a Parisian flower market. Peony, violet leaf, rose, lily and sandalwood. Fresh floral bliss. 100ml EDT.', images:img(2), sellerName:NR },
    { _id:'pf079', title:'Replica Jazz Club EDT', category:'Perfume & Fragrance', price:185.00, originalPrice:215.00, stock:12, rating:4.8, numReviews:1098, description:'Rum, tobacco leaves, vetiver, pink pepper and vanilla musk. The smoky ambience of a late-night jazz club. 100ml EDT.', images:img(3), sellerName:NR },
    { _id:'pf080', title:'Replica Sailing Day EDT', category:'Perfume & Fragrance', price:185.00, originalPrice:215.00, stock:15, rating:4.6, numReviews:876, description:'Sea breeze, bergamot, petitgrain, marine accord and white cedar. The freedom of open water. 100ml EDT.', images:img(4), sellerName:NR },

    // ── DIPTYQUE ──────────────────────────────────────────────
    { _id:'pf081', title:'Diptyque Philosykos EDT', category:'Perfume & Fragrance', price:195.00, originalPrice:225.00, stock:10, rating:4.8, numReviews:1123, isFeatured:true, description:'A fig tree from roots to fruit. Fig leaf, fig wood, white cedar and creamy fig. Nature bottled. 100ml EDT.', images:img(5), sellerName:LE },
    { _id:'pf082', title:'Diptyque Tam Dao EDT', category:'Perfume & Fragrance', price:192.00, originalPrice:222.00, stock:11, rating:4.8, numReviews:987, description:'Sandalwood from the Indian forest. Sandalwood, rosewood, cypress, myrtle and white musk. Meditative. 100ml EDT.', images:img(6), sellerName:LE },
    { _id:'pf083', title:'Diptyque Do Son EDT', category:'Perfume & Fragrance', price:190.00, originalPrice:220.00, stock:13, rating:4.7, numReviews:876, description:'A Vietnamese bay at sunset. Tuberose, orange blossom, musk, rose and white cedar. Dreamy and tropical. 100ml EDT.', images:img(7), sellerName:LE },
    { _id:'pf084', title:'Diptyque Eau Rose EDP', category:'Perfume & Fragrance', price:188.00, originalPrice:218.00, stock:14, rating:4.7, numReviews:765, description:'Pure rose in its most natural expression. Lychee, rose bud, rose essence, musk and white woods. 100ml EDP.', images:img(8), sellerName:LE },

    // ── AMOUAGE ───────────────────────────────────────────────
    { _id:'pf085', title:'Amouage Interlude Man EDP', category:'Perfume & Fragrance', price:349.99, originalPrice:400.00, stock:5, rating:4.9, numReviews:654, isFeatured:true, description:'A complex, majestic oriental. Oregano, bergamot, agar wood, amber, incense, cistus and musk. Truly extraordinary. 100ml EDP.', images:img(9), sellerName:LE },
    { _id:'pf086', title:'Amouage Reflection Woman EDP', category:'Perfume & Fragrance', price:339.99, originalPrice:390.00, stock:6, rating:4.9, numReviews:567, description:'Radiant and pure. Neroli, rose absolute, ylang-ylang, jasmine, lily and sandalwood. Transcendent femininity. 100ml EDP.', images:img(10), sellerName:LE },
    { _id:'pf087', title:'Amouage Gold Woman EDP', category:'Perfume & Fragrance', price:359.99, originalPrice:415.00, stock:4, rating:5.0, numReviews:489, isFeatured:true, description:'The pinnacle of oriental luxury. Frankincense, myrrh, civet, musk, labdanum and woods. A fragrance for eternity. 100ml EDP.', images:img(11), sellerName:LE },

    // ── BVLGARI ───────────────────────────────────────────────
    { _id:'pf088', title:'Bvlgari Man in Black EDP', category:'Perfume & Fragrance', price:128.00, originalPrice:152.00, stock:18, rating:4.7, numReviews:1456, isFeatured:true, description:'Rum absolute, tobacco, spices, guaiac wood, amber and leather. The embodiment of bold masculinity. 100ml EDP.', images:img(12), sellerName:UT },
    { _id:'pf089', title:'Bvlgari Splendida Magnolia Sensuel', category:'Perfume & Fragrance', price:122.00, originalPrice:145.00, stock:20, rating:4.6, numReviews:1234, description:'Sensual magnolia, peony, heliotrope, amber and musk. A love poem to the most beautiful of flowers. 100ml EDP.', images:img(13), sellerName:SB },
    { _id:'pf090', title:'Bvlgari Goldea The Roman Night', category:'Perfume & Fragrance', price:118.00, originalPrice:140.00, stock:22, rating:4.6, numReviews:1098, description:'The golden sensuality of a Roman night. Champaca, tuberose, jasmine, sandalwood, amber and musk. 75ml EDP.', images:img(14), sellerName:SB },

    // ── LANCOME ───────────────────────────────────────────────
    { _id:'pf091', title:'Lancôme La Vie est Belle EDP', category:'Perfume & Fragrance', price:124.99, originalPrice:148.00, stock:20, rating:4.7, numReviews:2650, isFeatured:true, description:'A declaration of happiness. Iris, patchouli, praline, vanilla and tonka bean. A sweet, elegant joy. 75ml EDP.', images:img(15), sellerName:SB },
    { _id:'pf092', title:'Lancôme Idôle EDP', category:'Perfume & Fragrance', price:118.00, originalPrice:140.00, stock:18, rating:4.6, numReviews:1567, description:'Rose from Grasse, jasmine from Egypt, musc and cedarwood. A fragrance for a woman who inspires. 75ml EDP.', images:img(16), sellerName:SB },
    { _id:'pf093', title:'Lancôme Trésor EDP', category:'Perfume & Fragrance', price:112.00, originalPrice:135.00, stock:22, rating:4.7, numReviews:1876, description:'A timeless love story. Iris, lily, heliotrope, rose, apricot, amber and musk. An enduring classic. 100ml EDP.', images:img(17), sellerName:SB },

    // ── CALVIN KLEIN ──────────────────────────────────────────
    { _id:'pf094', title:'CK Euphoria EDP', category:'Perfume & Fragrance', price:89.99, originalPrice:108.00, stock:30, rating:4.6, numReviews:2345, description:'Sensual and exotic. Black orchid, pomegranate, black violet, amber, lotus blossom, mahogany and musk. 100ml EDP.', images:img(18), sellerName:UT },
    { _id:'pf095', title:'CK Obsession EDP', category:'Perfume & Fragrance', price:84.99, originalPrice:102.00, stock:32, rating:4.5, numReviews:1987, description:'The original provocation. Bergamot, myrrh, orange blossom, jasmine, sandalwood, amber and musk. 100ml EDP.', images:img(19), sellerName:UT },
    { _id:'pf096', title:'CK Eternity EDP', category:'Perfume & Fragrance', price:82.99, originalPrice:99.00, stock:28, rating:4.5, numReviews:2156, description:'Everlasting love. Freesia, marigold, lily, sage, thyme, sandalwood, amber and musk. A timeless classic. 100ml EDP.', images:img(20), sellerName:UT },

    // ── HUGO BOSS ─────────────────────────────────────────────
    { _id:'pf097', title:'Hugo Boss The Scent EDP', category:'Perfume & Fragrance', price:98.99, originalPrice:118.00, stock:26, rating:4.6, numReviews:1678, description:'Irresistible and magnetic. Ginger, maninka fruit, leather and vetiver. The ultimate seduction. 100ml EDP.', images:img(21), sellerName:UT },
    { _id:'pf098', title:'Hugo Boss Bottled EDP', category:'Perfume & Fragrance', price:94.99, originalPrice:115.00, stock:28, rating:4.6, numReviews:1987, description:'The fragrance of a man who always achieves his goal. Apple, cinnamon, vanilla and sandalwood. A classic. 100ml EDP.', images:img(22), sellerName:UT },

    // ── DOLCE & GABBANA ───────────────────────────────────────
    { _id:'pf099', title:'D&G Light Blue EDT', category:'Perfume & Fragrance', price:102.00, originalPrice:122.00, stock:30, rating:4.7, numReviews:2876, isFeatured:true, description:'Sicilian cedar, apple, bamboo, jasmine, white rose, musk, amber and cedarwood. The essence of summer. 100ml EDT.', images:img(23), sellerName:UT },
    { _id:'pf100', title:'D&G The One EDP', category:'Perfume & Fragrance', price:112.00, originalPrice:135.00, stock:24, rating:4.7, numReviews:2234, description:'Modern and seductive. Bergamot, mandarin, lychee, peach, madonna lily, jasmine, musk and amber. The One. 75ml EDP.', images:img(24), sellerName:SB },

    // ── BURBERRY ──────────────────────────────────────────────
    { _id:'pf101', title:'Burberry Her EDP', category:'Perfume & Fragrance', price:115.00, originalPrice:138.00, stock:20, rating:4.7, numReviews:1567, description:'Fresh berry and floral notes with amber and musk. A British girl\'s London adventure bottled beautifully. 100ml EDP.', images:img(0), sellerName:UT },
    { _id:'pf102', title:'Burberry My Burberry EDP', category:'Perfume & Fragrance', price:118.00, originalPrice:142.00, stock:18, rating:4.6, numReviews:1234, description:'After the rain on a London morning. Bergamot, sweet pea, quince, geranium, freesia, rose and musk. 90ml EDP.', images:img(1), sellerName:SB },

    // ── GIVENCHY ──────────────────────────────────────────────
    { _id:'pf103', title:'Givenchy L\'Interdit EDP', category:'Perfume & Fragrance', price:125.00, originalPrice:150.00, stock:17, rating:4.7, numReviews:1456, description:'Dare to be forbidden. White flowers, orange blossom, jasmine, patchouli and vetiver. Bold and elegant. 80ml EDP.', images:img(2), sellerName:SB },
    { _id:'pf104', title:'Givenchy Gentleman EDP', category:'Perfume & Fragrance', price:118.00, originalPrice:142.00, stock:19, rating:4.6, numReviews:1123, description:'Iris, pear, patchouli, vanilla and sandalwood. The new definition of masculine elegance. 100ml EDP.', images:img(3), sellerName:UT },

    // ── XERJOFF ───────────────────────────────────────────────
    { _id:'pf105', title:'Xerjoff Naxos EDP', category:'Perfume & Fragrance', price:385.00, originalPrice:445.00, stock:4, rating:5.0, numReviews:432, isFeatured:true, description:'Italian luxury at its finest. Bergamot, lavender, honey, tobacco leaf, iris, tonka bean and vanilla. 100ml EDP.', images:img(4), sellerName:LE },
    { _id:'pf106', title:'Xerjoff Casamorati 1888 EDP', category:'Perfume & Fragrance', price:375.00, originalPrice:435.00, stock:5, rating:4.9, numReviews:387, description:'A vintage Italian opera house. Bergamot, neroli, pepper, rose, iris, amber, musk and sandalwood. 100ml EDP.', images:img(5), sellerName:LE },

    // ── INITIO ────────────────────────────────────────────────
    { _id:'pf107', title:'Initio Oud for Greatness EDP', category:'Perfume & Fragrance', price:345.00, originalPrice:400.00, stock:5, rating:4.9, numReviews:543, isFeatured:true, description:'The most refined oud experience. Agarwood, nutmeg, musks and patchouli. Power, mystery and undeniable presence. 90ml EDP.', images:img(6), sellerName:LE },
    { _id:'pf108', title:'Initio Atomic Rose EDP', category:'Perfume & Fragrance', price:328.00, originalPrice:382.00, stock:6, rating:4.8, numReviews:432, description:'An atomic explosion of roses. Turkish rose, Bulgarian rose, musk, sandalwood and ambroxan. Indestructible rose. 90ml EDP.', images:img(7), sellerName:LE },

    // ── NISHANE ───────────────────────────────────────────────
    { _id:'pf109', title:'Nishane Hacivat EDP', category:'Perfume & Fragrance', price:295.00, originalPrice:345.00, stock:7, rating:4.9, numReviews:654, isFeatured:true, description:'A chypre masterpiece. Bergamot, pineapple, grapefruit, jasmine, rose, patchouli, oakmoss and musk. 100ml EDP.', images:img(8), sellerName:LE },
    { _id:'pf110', title:'Nishane Ani EDP', category:'Perfume & Fragrance', price:285.00, originalPrice:332.00, stock:8, rating:4.8, numReviews:543, description:'A warm, vanilla embrace. Bergamot, coriander, heliotrope, jasmine, vanilla, benzoin and musk. Comforting luxury. 100ml EDP.', images:img(9), sellerName:LE },

    // ── MEMO PARIS ────────────────────────────────────────────
    { _id:'pf111', title:'Memo Paris Irish Leather EDP', category:'Perfume & Fragrance', price:265.00, originalPrice:308.00, stock:7, rating:4.8, numReviews:432, description:'The finest Irish leather with violet, iris, tobacco, birch and musk. Rugged luxury, impeccably finished. 75ml EDP.', images:img(10), sellerName:LE },
    { _id:'pf112', title:'Memo Paris Marfa EDP', category:'Perfume & Fragrance', price:258.00, originalPrice:300.00, stock:8, rating:4.7, numReviews:376, description:'A Texas road trip. Cactus, juniper, sage, cedarwood, sandalwood and musk. Wild, free and luxurious. 75ml EDP.', images:img(11), sellerName:LE },

    // ── VALENTINO ─────────────────────────────────────────────
    { _id:'pf113', title:'Valentino Donna Born in Roma EDP', category:'Perfume & Fragrance', price:132.00, originalPrice:158.00, stock:15, rating:4.7, numReviews:1234, description:'The passion of Rome. Blackcurrant, jasmine absolute, vetiver and vanilla. Modern, sensual and Italian. 100ml EDP.', images:img(12), sellerName:SB },
    { _id:'pf114', title:'Valentino Uomo Born in Roma EDP', category:'Perfume & Fragrance', price:128.00, originalPrice:152.00, stock:17, rating:4.6, numReviews:987, description:'Roman wood smoke and vanilla — grapefruit, coriander, birch tar, amber and vanilla. A masculine Roman dream. 100ml EDP.', images:img(13), sellerName:UT },
    { _id:'pf115', title:'Valentino Voce Viva EDP', category:'Perfume & Fragrance', price:125.00, originalPrice:148.00, stock:18, rating:4.6, numReviews:876, description:'A powerful, sparkling voice. Bergamot, tuberose, orange blossom, jasmine, musks and woods. Pure radiance. 100ml EDP.', images:img(14), sellerName:SB },
  ];
}

/* ── CLOTHES ──────────────────────────────────────────────── */
function getClothes() {
  const ci = [
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=500&q=80',
    'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=500&q=80',
    'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=500&q=80',
    'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=500&q=80',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500&q=80',
    'https://images.unsplash.com/photo-1602810316693-3667c854239a?w=500&q=80',
    'https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=500&q=80',
    'https://images.unsplash.com/photo-1516762689617-e1cffcef479d?w=500&q=80',
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500&q=80',
    'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=500&q=80',
    'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=500&q=80',
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=500&q=80',
    'https://images.unsplash.com/photo-1544441893-675973e31985?w=500&q=80',
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500&q=80',
    'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=500&q=80',
    'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=500&q=80',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80',
    'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&q=80',
    'https://images.unsplash.com/photo-1548624313-0396c75e4b1a?w=500&q=80',
    'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=500&q=80',
  ];
  const img = i => [ci[i % ci.length]];
  const SB='Suraj Boutique', UT='Urban Threads', NR='Noir Maison', LE='Le Luxe Paris';
  return [
    // Dresses & Frocks
    {_id:'cl001',title:'Flowy Boho Maxi Dress',category:'Dress & Frock',price:54.99,originalPrice:79.99,stock:18,rating:4.7,numReviews:342,isFeatured:true,description:'Lightweight chiffon maxi dress with floral print and adjustable straps. Perfect for summer festivals and beach days. Free size.',images:img(0),sellerName:SB},
    {_id:'cl002',title:'Off-Shoulder Mini Dress',category:'Dress & Frock',price:44.99,originalPrice:65.99,stock:22,rating:4.6,numReviews:289,description:'Ruffle off-shoulder mini dress in vibrant solid colors. Elasticized neckline and flared hem. Sizes XS–XL.',images:img(1),sellerName:UT},
    {_id:'cl003',title:'Satin Slip Evening Dress',category:'Dress & Frock',price:89.99,originalPrice:129.99,stock:10,rating:4.8,numReviews:198,isFeatured:true,description:'Luxurious satin slip dress with adjustable spaghetti straps, bias-cut silhouette, and thigh-high slit. Midi length.',images:img(2),sellerName:LE},
    {_id:'cl004',title:'Floral Wrap Midi Dress',category:'Dress & Frock',price:59.99,originalPrice:84.99,stock:25,rating:4.6,numReviews:412,description:'V-neck wrap dress in bold floral print. Flattering A-line skirt, cinched waist tie, flutter sleeves.',images:img(3),sellerName:SB},
    {_id:'cl005',title:'Little Black Bodycon Dress',category:'Dress & Frock',price:49.99,originalPrice:72.99,stock:30,rating:4.7,numReviews:567,isFeatured:true,description:'Classic LBD in sculpting ribbed fabric. Scoop neck, sleeveless, knee-length. Every wardrobe essential.',images:img(4),sellerName:UT},
    {_id:'cl006',title:'Embroidered Kurta Set',category:'Dress & Frock',price:69.99,originalPrice:95.99,stock:14,rating:4.8,numReviews:234,description:'Elegant cotton kurta with intricate floral embroidery, straight-cut palazzo pants included. Festive & casual.',images:img(5),sellerName:SB},
    {_id:'cl007',title:'Shirt Dress with Belt',category:'Dress & Frock',price:52.99,originalPrice:75.99,stock:20,rating:4.5,numReviews:178,description:'Oversized chambray shirt dress, cinched with detachable waist belt. Chest pockets, button-front, midi length.',images:img(6),sellerName:UT},
    {_id:'cl008',title:'Ruched Bodycon Party Dress',category:'Dress & Frock',price:46.99,originalPrice:68.99,stock:28,rating:4.6,numReviews:321,description:'Stretchy ruched mini dress with sweetheart neckline. Available in wine, sage, and midnight blue.',images:img(7),sellerName:SB},
    // T-Shirts
    {_id:'cl009',title:'Premium Oversized Tee',category:'T-Shirts',price:22.99,originalPrice:34.99,stock:60,rating:4.5,numReviews:890,isFeatured:true,description:'100% organic cotton oversized t-shirt with dropped shoulders. Heavyweight 220gsm fabric for a luxurious feel.',images:img(8),sellerName:UT},
    {_id:'cl010',title:'Vintage Graphic Print Tee',category:'T-Shirts',price:27.99,originalPrice:39.99,stock:45,rating:4.4,numReviews:678,description:'Retro-inspired graphic tee with distressed vintage print. Unisex fit, soft ring-spun cotton.',images:img(9),sellerName:SB},
    {_id:'cl011',title:'Polo Collar Slim Fit Tee',category:'T-Shirts',price:32.99,originalPrice:48.99,stock:38,rating:4.6,numReviews:456,description:'Classic piqué polo in breathable cotton. Slim fit with two-button placket. Available in 12 colors.',images:img(10),sellerName:UT},
    {_id:'cl012',title:'Tie-Dye Crop Top',category:'T-Shirts',price:19.99,originalPrice:29.99,stock:55,rating:4.3,numReviews:512,description:'Vibrant tie-dye crop top in swirl patterns. Relaxed fit, curved hem. 100% soft jersey cotton.',images:img(11),sellerName:SB},
    {_id:'cl013',title:'Henley Button-Neck Tee',category:'T-Shirts',price:28.99,originalPrice:42.99,stock:40,rating:4.5,numReviews:334,description:'Three-button Henley neckline, long-sleeve, in waffle-knit thermal fabric. Perfect layering essential.',images:img(12),sellerName:UT},
    {_id:'cl014',title:'Muscle-Fit Gym Tank',category:'T-Shirts',price:18.99,originalPrice:27.99,stock:70,rating:4.4,numReviews:445,description:'Moisture-wicking performance tank in stretchy quick-dry fabric. Racerback cut for full range of motion.',images:img(13),sellerName:SB},
    // Jackets
    {_id:'cl015',title:'Quilted Puffer Jacket',category:'Jackets',price:149.99,originalPrice:199.99,stock:12,rating:4.8,numReviews:267,isFeatured:true,description:'Lightweight quilted puffer with recycled down fill. Packable, water-resistant shell. Available in 8 colors.',images:img(14),sellerName:UT},
    {_id:'cl016',title:'Denim Trucker Jacket',category:'Jackets',price:89.99,originalPrice:129.99,stock:20,rating:4.7,numReviews:398,description:'Classic denim trucker jacket in stonewashed indigo. Button closure, chest and hand pockets, adjustable hem.',images:img(15),sellerName:SB},
    {_id:'cl017',title:'Suede Biker Jacket',category:'Jackets',price:219.99,originalPrice:289.99,stock:7,rating:4.9,numReviews:145,isFeatured:true,description:'Genuine suede moto jacket with asymmetric zip, snap lapels, quilted shoulders and silver hardware.',images:img(16),sellerName:LE},
    {_id:'cl018',title:'Blazer Jacket Slim Fit',category:'Jackets',price:129.99,originalPrice:179.99,stock:15,rating:4.7,numReviews:223,description:'Tailored slim-fit blazer in stretch wool blend. Notched lapels, two-button closure, welt pockets.',images:img(17),sellerName:UT},
    {_id:'cl019',title:'Windbreaker Shell Jacket',category:'Jackets',price:79.99,originalPrice:109.99,stock:25,rating:4.5,numReviews:334,description:'Lightweight packable windbreaker in ripstop nylon. Full-zip, drawcord hem, chest zip pocket.',images:img(18),sellerName:SB},
    {_id:'cl020',title:'Faux Fur Teddy Coat',category:'Jackets',price:169.99,originalPrice:229.99,stock:9,rating:4.8,numReviews:187,isFeatured:true,description:'Ultra-soft faux teddy bear fur coat, belted waist, oversized lapels. Winter glamour defined.',images:img(19),sellerName:LE},
    // Jeans & Shorts
    {_id:'cl021',title:'High-Rise Skinny Jeans',category:'Shorts & Jeans',price:64.99,originalPrice:89.99,stock:32,rating:4.7,numReviews:654,isFeatured:true,description:'High-waisted skinny jeans in premium stretch denim. Ankle-length, 5-pocket styling. Sizes 24–34.',images:img(0),sellerName:UT},
    {_id:'cl022',title:'Wide-Leg Palazzo Trousers',category:'Shorts & Jeans',price:54.99,originalPrice:79.99,stock:28,rating:4.6,numReviews:423,description:'Flowy wide-leg palazzo pants in viscose crepe. Elasticized waist, full length. Perfect for resort wear.',images:img(1),sellerName:SB},
    {_id:'cl023',title:'Cargo Utility Shorts',category:'Shorts & Jeans',price:39.99,originalPrice:55.99,stock:45,rating:4.4,numReviews:312,description:'Multi-pocket cargo shorts in ripstop cotton. Drawcord waist, zip fly, knee-length. Khaki & olive.',images:img(2),sellerName:UT},
    {_id:'cl024',title:'Mom-Fit Vintage Jeans',category:'Shorts & Jeans',price:69.99,originalPrice:99.99,stock:22,rating:4.7,numReviews:534,description:'90s-inspired mom jeans in rigid indigo denim. Relaxed thigh, tapered ankle, distressed knee detail.',images:img(3),sellerName:SB},
    {_id:'cl025',title:'Chino Slim Pants',category:'Shorts & Jeans',price:49.99,originalPrice:72.99,stock:35,rating:4.5,numReviews:289,description:'Slim-fit chino trousers in stretch cotton. Flat-front, mid-rise, ankle length. Available in 10 colors.',images:img(4),sellerName:UT},
    // Winter Wear
    {_id:'cl026',title:'Cashmere Turtleneck Sweater',category:'Winter Wear',price:189.99,originalPrice:249.99,stock:8,rating:4.9,numReviews:178,isFeatured:true,description:'100% pure Grade-A cashmere turtleneck. Ultra-soft, warm, ribbed cuffs and hem. Timeless winter luxury.',images:img(5),sellerName:LE},
    {_id:'cl027',title:'Knit Cable Crew Pullover',category:'Winter Wear',price:89.99,originalPrice:129.99,stock:18,rating:4.7,numReviews:312,description:'Chunky cable-knit crewneck sweater in merino wool blend. Relaxed fit, ribbed edges. 8 colors.',images:img(6),sellerName:SB},
    {_id:'cl028',title:'Thermal Base Layer Set',category:'Winter Wear',price:59.99,originalPrice:84.99,stock:30,rating:4.6,numReviews:234,description:'Top and bottom thermal set in brushed micro-fleece. Moisture-wicking, four-way stretch, flatlock seams.',images:img(7),sellerName:UT},
    {_id:'cl029',title:'Sherpa Fleece Hoodie',category:'Winter Wear',price:69.99,originalPrice:99.99,stock:24,rating:4.7,numReviews:445,isFeatured:true,description:'Two-layer sherpa fleece hoodie with kangaroo pocket and zip front. Incredibly warm and plush.',images:img(8),sellerName:SB},
    {_id:'cl030',title:'Wool Blend Overcoat',category:'Winter Wear',price:249.99,originalPrice:349.99,stock:6,rating:4.9,numReviews:134,description:'Double-breasted wool-blend overcoat with satin lining. Knee length, peaked lapels, welt pockets.',images:img(9),sellerName:LE},
    // Sports
    {_id:'cl031',title:'Performance Running Shorts',category:'Sports',price:34.99,originalPrice:49.99,stock:50,rating:4.5,numReviews:567,description:'4-inch inseam running shorts with built-in liner. Lightweight, moisture-wicking, reflective details.',images:img(10),sellerName:UT},
    {_id:'cl032',title:'Compression Yoga Leggings',category:'Sports',price:49.99,originalPrice:72.99,stock:42,rating:4.7,numReviews:789,isFeatured:true,description:'High-waist 7/8 length yoga leggings in 4-way stretch fabric. Squat-proof, pocket at waistband.',images:img(11),sellerName:SB},
    {_id:'cl033',title:'Athletic Training Hoodie',category:'Sports',price:64.99,originalPrice:89.99,stock:30,rating:4.6,numReviews:423,description:'Pullover training hoodie in French terry fabric. Kangaroo pocket, dropped hem, thumb holes at cuffs.',images:img(12),sellerName:UT},
    {_id:'cl034',title:'Sports Bra High Impact',category:'Sports',price:39.99,originalPrice:55.99,stock:38,rating:4.6,numReviews:612,description:'Racerback sports bra with underwire support, removable pads. High-impact, moisture-wicking, sizes XS–3XL.',images:img(13),sellerName:SB},
    {_id:'cl035',title:'Track Suit Set',category:'Sports',price:79.99,originalPrice:114.99,stock:25,rating:4.5,numReviews:334,description:'Matching track jacket and jogger set in tricot fabric. Zip-up jacket, elastic waist pants. 6 colorways.',images:img(14),sellerName:UT},
    // Hats & Caps
    {_id:'cl036',title:'Classic Baseball Cap',category:'Hats & Caps',price:24.99,originalPrice:35.99,stock:60,rating:4.5,numReviews:678,description:'Structured 6-panel baseball cap in premium cotton twill. Adjustable strap, embroidered logo.',images:img(15),sellerName:SB},
    {_id:'cl037',title:'Merino Wool Beanie',category:'Hats & Caps',price:34.99,originalPrice:49.99,stock:45,rating:4.7,numReviews:389,description:'Ribbed merino wool beanie with double-layer brim. Naturally warm and itch-free. 10 classic colors.',images:img(16),sellerName:UT},
    {_id:'cl038',title:'Bucket Hat UV Protection',category:'Hats & Caps',price:22.99,originalPrice:32.99,stock:55,rating:4.4,numReviews:445,description:'Packable bucket hat with UPF 50+ protection. Nylon ripstop, chin strap. Perfect for outdoor adventures.',images:img(17),sellerName:SB},
    {_id:'cl039',title:'Wide Brim Straw Hat',category:'Hats & Caps',price:29.99,originalPrice:44.99,stock:35,rating:4.6,numReviews:312,isFeatured:true,description:'Handwoven natural straw hat with 4-inch wide brim. UV-blocking, adjustable ribbon band. Resort essential.',images:img(18),sellerName:LE},
    {_id:'cl040',title:'Dad Hat Vintage Wash',category:'Hats & Caps',price:21.99,originalPrice:32.99,stock:50,rating:4.3,numReviews:534,description:'Enzyme-washed unstructured dad hat with curved brim. Cotton twill, adjustable metal clasp. Fits all.',images:img(19),sellerName:UT},
  ];
}

/* ── FOOTWEAR ──────────────────────────────────────────────── */
function getFootwear() {
  const fi = [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80',
    'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&q=80',
    'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=500&q=80',
    'https://images.unsplash.com/photo-1518894781321-630e638d0742?w=500&q=80',
    'https://images.unsplash.com/photo-1587170466744-41fa6bc80b21?w=500&q=80',
    'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=500&q=80',
    'https://images.unsplash.com/photo-1539185441755-769473a23570?w=500&q=80',
    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=500&q=80',
    'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=500&q=80',
    'https://images.unsplash.com/photo-1508609349937-5ec4ae374ebf?w=500&q=80',
    'https://images.unsplash.com/photo-1465453869711-7e174808ace9?w=500&q=80',
    'https://images.unsplash.com/photo-1571736772567-3cb42f5d5634?w=500&q=80',
    'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=500&q=80',
    'https://images.unsplash.com/photo-1611188651614-b5e3f52ae1e1?w=500&q=80',
    'https://images.unsplash.com/photo-1578116922645-3976907a7671?w=500&q=80',
    'https://images.unsplash.com/photo-1559563458-527698bf5295?w=500&q=80',
    'https://images.unsplash.com/photo-1584735175315-9d5df23be4be?w=500&q=80',
    'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=500&q=80',
    'https://images.unsplash.com/photo-1562272821-4ddb7ee13dab?w=500&q=80',
    'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=500&q=80',
  ];
  const img = i => [fi[i % fi.length]];
  const SB='Suraj Boutique', UT='Urban Threads', LE='Le Luxe Paris';
  return [
    // Sneakers
    {_id:'fw001',title:'Air Cushion Running Sneakers',category:'Shoes & Footwear',price:89.99,originalPrice:124.99,stock:28,rating:4.7,numReviews:987,isFeatured:true,description:'Lightweight mesh running sneaker with full-length air cushion midsole. Breathable upper, rubber outsole. Sizes 6–13.',images:img(0),sellerName:UT},
    {_id:'fw002',title:'Classic Leather Sneakers',category:'Shoes & Footwear',price:79.99,originalPrice:109.99,stock:32,rating:4.6,numReviews:756,description:'Clean white leather low-top sneaker with perforated toe box. Cushioned footbed, vulcanized sole.',images:img(1),sellerName:SB},
    {_id:'fw003',title:'Chunky Platform Sneakers',category:'Shoes & Footwear',price:99.99,originalPrice:139.99,stock:18,rating:4.7,numReviews:543,isFeatured:true,description:'Retro chunky-sole sneaker with leather upper and exaggerated platform. Mixed-color lace-up front.',images:img(2),sellerName:LE},
    {_id:'fw004',title:'Trail Running Shoes',category:'Shoes & Footwear',price:119.99,originalPrice:159.99,stock:22,rating:4.8,numReviews:445,description:'Aggressive-lugged trail runner in protective mesh. Waterproof TPU overlays, rock plate, cushioned stack.',images:img(3),sellerName:UT},
    {_id:'fw005',title:'Slip-On Canvas Sneakers',category:'Shoes & Footwear',price:39.99,originalPrice:54.99,stock:50,rating:4.4,numReviews:678,description:'Easy slip-on sneaker in washed canvas. Elastic gore panels, padded collar, rubber outsole.',images:img(4),sellerName:SB},
    {_id:'fw006',title:'High-Top Basketball Shoes',category:'Shoes & Footwear',price:129.99,originalPrice:179.99,stock:15,rating:4.7,numReviews:389,description:'High-cut basketball sneaker with ankle support strap. Foam-cushioned midsole, herringbone outsole.',images:img(5),sellerName:UT},
    {_id:'fw007',title:'Knit Sock Sneakers',category:'Shoes & Footwear',price:74.99,originalPrice:104.99,stock:25,rating:4.5,numReviews:534,description:'Seamless flyknit upper with sock-like fit. Boost-foam midsole, flexible outsole. Ultra-lightweight.',images:img(6),sellerName:SB},
    {_id:'fw008',title:'Luxury Leather Loafers',category:'Shoes & Footwear',price:169.99,originalPrice:229.99,stock:12,rating:4.8,numReviews:267,isFeatured:true,description:'Horsebit loafer in full-grain calfskin leather. Leather lining, stacked heel, Goodyear welt construction.',images:img(7),sellerName:LE},
    // Boots
    {_id:'fw009',title:'Chelsea Ankle Boots',category:'Shoes & Footwear',price:139.99,originalPrice:189.99,stock:18,rating:4.7,numReviews:456,isFeatured:true,description:'Classic Chelsea boot in pull-up leather. Elastic side panels, pull tab, block heel. Black & tan.',images:img(8),sellerName:SB},
    {_id:'fw010',title:'Chunky Combat Boots',category:'Shoes & Footwear',price:149.99,originalPrice:209.99,stock:14,rating:4.8,numReviews:334,description:'Lace-up combat boot with lug sole. Smooth synthetic leather, zip side for easy entry.',images:img(9),sellerName:UT},
    {_id:'fw011',title:'Knee-High Riding Boots',category:'Shoes & Footwear',price:199.99,originalPrice:279.99,stock:8,rating:4.8,numReviews:212,isFeatured:true,description:'Pull-on knee-high riding boot in supple suede. Block heel, inside zip, leather lining.',images:img(10),sellerName:LE},
    {_id:'fw012',title:'Waterproof Hiking Boots',category:'Shoes & Footwear',price:159.99,originalPrice:219.99,stock:16,rating:4.9,numReviews:389,description:'Waterproof Gore-Tex hiking boot. Nubuck upper, Vibram outsole, cushioned ankle collar.',images:img(11),sellerName:UT},
    {_id:'fw013',title:'Western Cowboy Boots',category:'Shoes & Footwear',price:189.99,originalPrice:259.99,stock:10,rating:4.7,numReviews:198,description:'Genuine leather cowboy boot with decorative stitching. Pointed toe, angled heel, pull-on loops.',images:img(12),sellerName:SB},
    {_id:'fw014',title:'Fur-Lined Snow Boots',category:'Shoes & Footwear',price:129.99,originalPrice:179.99,stock:20,rating:4.8,numReviews:312,description:'Waterproof snow boots with faux-fur lining and fleece footbed. Anti-slip lugged outsole. -40°C rated.',images:img(13),sellerName:UT},
    // Heels & Sandals
    {_id:'fw015',title:'Strappy Heeled Sandals',category:'Shoes & Footwear',price:79.99,originalPrice:114.99,stock:22,rating:4.6,numReviews:445,description:'Thin-strap heeled sandal with adjustable ankle buckle. 3.5" stiletto heel. Nude & black colorways.',images:img(14),sellerName:SB},
    {_id:'fw016',title:'Block Heel Mule Sandals',category:'Shoes & Footwear',price:69.99,originalPrice:99.99,stock:28,rating:4.5,numReviews:378,description:'Open-toe mule with wide block heel and padded footbed. Suede upper, easy slip-on.',images:img(15),sellerName:UT},
    {_id:'fw017',title:'Platform Espadrille Wedge',category:'Shoes & Footwear',price:59.99,originalPrice:84.99,stock:30,rating:4.5,numReviews:334,description:'Jute-wrapped wedge espadrille with canvas upper. Ankle tie, platform base. Summer essential.',images:img(16),sellerName:SB},
    {_id:'fw018',title:'Leather Birkenstock-Style Sandal',category:'Shoes & Footwear',price:89.99,originalPrice:124.99,stock:35,rating:4.7,numReviews:623,isFeatured:true,description:'Two-strap contoured cork footbed sandal in full-grain leather. Adjustable buckle, natural cork latex sole.',images:img(17),sellerName:LE},
    {_id:'fw019',title:'Rhinestone Embellished Heels',category:'Shoes & Footwear',price:94.99,originalPrice:134.99,stock:12,rating:4.6,numReviews:234,description:'Point-toe stiletto with crystal rhinestone strap. 4" heel, padded insole. Party & bridal.',images:img(18),sellerName:SB},
    {_id:'fw020',title:'Slip-On Pool Slides',category:'Shoes & Footwear',price:29.99,originalPrice:44.99,stock:60,rating:4.3,numReviews:789,description:'Cloud-soft EVA foam pool slides with contoured footbed. Lightweight, waterproof, quick-dry.',images:img(19),sellerName:UT},
    // Formal & Loafers
    {_id:'fw021',title:'Oxford Brogue Derby Shoes',category:'Shoes & Footwear',price:149.99,originalPrice:199.99,stock:14,rating:4.8,numReviews:278,isFeatured:true,description:'Hand-crafted full-grain leather Derby with laser-cut broguing. Leather sole, cushioned insole.',images:img(0),sellerName:LE},
    {_id:'fw022',title:'Penny Loafers Classic',category:'Shoes & Footwear',price:129.99,originalPrice:174.99,stock:18,rating:4.7,numReviews:312,description:'Smooth calfskin penny loafer on leather sole. Stitch-down construction, brass penny slot.',images:img(1),sellerName:SB},
    {_id:'fw023',title:'Monk Strap Shoes',category:'Shoes & Footwear',price:159.99,originalPrice:219.99,stock:10,rating:4.8,numReviews:189,description:'Double monk strap in burnished tan leather. Square toe, leather sole, metal buckle closure.',images:img(2),sellerName:LE},
    {_id:'fw024',title:'Patent Leather Pumps',category:'Shoes & Footwear',price:84.99,originalPrice:119.99,stock:20,rating:4.6,numReviews:345,description:'Classic patent leather court pump. Pointed toe, 3" heel, slip-on. 8 rich colorways.',images:img(3),sellerName:SB},
    {_id:'fw025',title:'Velvet Loafers',category:'Shoes & Footwear',price:99.99,originalPrice:139.99,stock:15,rating:4.7,numReviews:223,description:'Crush velvet loafer with gold embroidered crest. Leather lining, flexible leather sole.',images:img(4),sellerName:LE},
    // Casual & Flip Flops
    {_id:'fw026',title:'Memory Foam Flip Flops',category:'Shoes & Footwear',price:24.99,originalPrice:36.99,stock:80,rating:4.4,numReviews:1023,description:'Contoured memory foam flip flops with arch support. Non-slip outsole, adjustable thong strap.',images:img(5),sellerName:UT},
    {_id:'fw027',title:'Canvas Lace-Up Plimsolls',category:'Shoes & Footwear',price:34.99,originalPrice:49.99,stock:55,rating:4.3,numReviews:678,description:'Classic canvas plimsolls in vibrant colors. Lace-up, vulcanized sole, cushioned footbed.',images:img(6),sellerName:SB},
    {_id:'fw028',title:'Boat Deck Shoes',category:'Shoes & Footwear',price:74.99,originalPrice:104.99,stock:28,rating:4.5,numReviews:356,description:'Genuine leather boat shoe with hand-sewn moc-toe. Non-marking siping sole, lace-up topline.',images:img(7),sellerName:UT},
    {_id:'fw029',title:'Wool Slip-On Moccasin',category:'Shoes & Footwear',price:64.99,originalPrice:89.99,stock:30,rating:4.6,numReviews:289,description:'Boiled wool upper moccasin with rubber sole. Indoor-outdoor, warm, machine washable.',images:img(8),sellerName:SB},
    {_id:'fw030',title:'Kids Sports Sneaker',category:'Shoes & Footwear',price:44.99,originalPrice:64.99,stock:40,rating:4.5,numReviews:445,description:'Velcro-closure kids sneaker in lightweight mesh. Machine washable, flexible sole. Sizes 1–7.',images:img(9),sellerName:UT},
  ];
}

/* ── JEWELRY ──────────────────────────────────────────────── */
function getJewelry() {
  const ji = [
    'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&q=80',
    'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&q=80',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=500&q=80',
    'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=500&q=80',
    'https://images.unsplash.com/photo-1551717743-49959800b1f6?w=500&q=80',
    'https://images.unsplash.com/photo-1573408301185-9519f94f7b6d?w=500&q=80',
    'https://images.unsplash.com/photo-1601121141461-9d6647bef0a0?w=500&q=80',
    'https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=500&q=80',
    'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=500&q=80',
    'https://images.unsplash.com/photo-1546938576-6e6a64f317cc?w=500&q=80',
    'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=500&q=80',
    'https://images.unsplash.com/photo-1590548784585-643d2b9f2925?w=500&q=80',
    'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&q=80',
    'https://images.unsplash.com/photo-1434156517-4e5c0c1012d5?w=500&q=80',
    'https://images.unsplash.com/photo-1543294001-f7cd5d7fb516?w=500&q=80',
    'https://images.unsplash.com/photo-1589128777073-263566ae5e4d?w=500&q=80',
    'https://images.unsplash.com/photo-1628592102751-ba83b0314276?w=500&q=80',
    'https://images.unsplash.com/photo-1583292650898-7d22cd27ca6f?w=500&q=80',
    'https://images.unsplash.com/photo-1596944924616-7b38e7cfac36?w=500&q=80',
    'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=500&q=80',
  ];
  const img = i => [ji[i % ji.length]];
  const SB='Suraj Boutique', UT='Urban Threads', LE='Le Luxe Paris';
  return [
    // Necklaces
    {_id:'jw001',title:'Diamond Solitaire Pendant',category:'Watches & Jewelry',price:349.99,originalPrice:449.99,stock:8,rating:4.9,numReviews:234,isFeatured:true,description:'0.25ct brilliant-cut diamond solitaire on 18kt white gold fine cable chain. IGI certified. 18".',images:img(0),sellerName:LE},
    {_id:'jw002',title:'Pearl Strand Necklace',category:'Watches & Jewelry',price:189.99,originalPrice:249.99,stock:12,rating:4.8,numReviews:198,isFeatured:true,description:'Freshwater pearl strand necklace with 18kt gold lobster clasp. Uniform 7–8mm pearls, 18" length.',images:img(1),sellerName:LE},
    {_id:'jw003',title:'Gold Layered Chain Necklace',category:'Watches & Jewelry',price:49.99,originalPrice:72.99,stock:30,rating:4.6,numReviews:567,description:'Triple-layered 18kt gold vermeil chain necklace. Varying lengths — 16", 18", 20". Tarnish-resistant.',images:img(2),sellerName:SB},
    {_id:'jw004',title:'Turquoise Boho Choker',category:'Watches & Jewelry',price:29.99,originalPrice:44.99,stock:40,rating:4.5,numReviews:445,description:'Handcrafted turquoise stone choker on braided leather cord. Adjustable length, brass toggle clasp.',images:img(3),sellerName:SB},
    {_id:'jw005',title:'Evil Eye Pendant Necklace',category:'Watches & Jewelry',price:34.99,originalPrice:49.99,stock:45,rating:4.6,numReviews:678,description:'Blue enamel evil eye on sterling silver chain. 0.8" pendant, 18" adjustable cable chain. Amulet of protection.',images:img(4),sellerName:UT},
    {_id:'jw006',title:'Emerald Drop Pendant',category:'Watches & Jewelry',price:279.99,originalPrice:369.99,stock:6,rating:4.9,numReviews:145,isFeatured:true,description:'Natural 0.5ct emerald teardrop pendant in 14kt yellow gold bezel setting. 18" chain included.',images:img(5),sellerName:LE},
    {_id:'jw007',title:'Locket Photo Necklace',category:'Watches & Jewelry',price:44.99,originalPrice:64.99,stock:35,rating:4.5,numReviews:389,description:'Oval locket necklace in 18kt gold-plated sterling silver. Opens for two small photos. 20" chain.',images:img(6),sellerName:SB},
    {_id:'jw008',title:'Bar Name Necklace',category:'Watches & Jewelry',price:39.99,originalPrice:58.99,stock:50,rating:4.7,numReviews:734,description:'Personalized flat bar name necklace in sterling silver. Up to 12 characters, 16–20" chain.',images:img(7),sellerName:UT},
    // Rings
    {_id:'jw009',title:'Diamond Eternity Band',category:'Watches & Jewelry',price:599.99,originalPrice:799.99,stock:5,rating:5.0,numReviews:98,isFeatured:true,description:'1.0ct total weight round brilliant diamonds, channel-set in 14kt white gold eternity band. Sizes 4–9.',images:img(8),sellerName:LE},
    {_id:'jw010',title:'Stackable Gold Ring Set',category:'Watches & Jewelry',price:59.99,originalPrice:89.99,stock:28,rating:4.7,numReviews:456,description:'Set of 5 stackable 14kt gold-filled rings. Hammered, beaded, twisted, plain, and chevron styles.',images:img(9),sellerName:SB},
    {_id:'jw011',title:'Moonstone Silver Ring',category:'Watches & Jewelry',price:49.99,originalPrice:72.99,stock:22,rating:4.8,numReviews:312,description:'Natural moonstone cabochon set in sterling silver prong setting. Adularescent glow, sizes 5–10.',images:img(10),sellerName:UT},
    {_id:'jw012',title:'Emerald Cut Cocktail Ring',category:'Watches & Jewelry',price:149.99,originalPrice:209.99,stock:10,rating:4.7,numReviews:234,description:'Green synthetic emerald cut stone in 18kt gold vermeil four-claw setting. Statement cocktail ring.',images:img(11),sellerName:SB},
    {_id:'jw013',title:'Signet Pinky Ring',category:'Watches & Jewelry',price:69.99,originalPrice:99.99,stock:18,rating:4.6,numReviews:278,description:'Classic oval signet ring in 14kt gold-filled. Engravable flat face, polished finish. Unisex.',images:img(12),sellerName:LE},
    {_id:'jw014',title:'Birthstone Halo Ring',category:'Watches & Jewelry',price:89.99,originalPrice:129.99,stock:15,rating:4.7,numReviews:345,description:'Birthstone center gem surrounded by CZ halo, sterling silver band. 12 birthstones available.',images:img(13),sellerName:SB},
    // Earrings
    {_id:'jw015',title:'Diamond Stud Earrings',category:'Watches & Jewelry',price:299.99,originalPrice:399.99,stock:10,rating:4.9,numReviews:189,isFeatured:true,description:'0.50ct TW diamond studs in 14kt white gold four-prong push-back setting. IGI certified.',images:img(14),sellerName:LE},
    {_id:'jw016',title:'Gold Hoop Earrings',category:'Watches & Jewelry',price:39.99,originalPrice:59.99,stock:42,rating:4.7,numReviews:678,description:'14kt gold-filled seamless hoop earrings. 25mm diameter, 2mm tube. Lightweight, comfortable all-day wear.',images:img(15),sellerName:SB},
    {_id:'jw017',title:'Pearl Drop Earrings',category:'Watches & Jewelry',price:69.99,originalPrice:99.99,stock:20,rating:4.8,numReviews:312,isFeatured:true,description:'Freshwater pearl dangle earrings on 14kt gold wire. 9–10mm pearls, 1.5" drop. Classic elegance.',images:img(16),sellerName:LE},
    {_id:'jw018',title:'Tassel Chandelier Earrings',category:'Watches & Jewelry',price:32.99,originalPrice:49.99,stock:35,rating:4.5,numReviews:445,description:'Boho tassel earrings with crystal CZ stations and long fringe drop. 4" total length. Festival glam.',images:img(17),sellerName:UT},
    {_id:'jw019',title:'Ear Cuff No Piercing',category:'Watches & Jewelry',price:24.99,originalPrice:36.99,stock:50,rating:4.5,numReviews:534,description:'Adjustable ear cuff in 14kt gold-plated brass. No piercing needed. Geometric open design.',images:img(18),sellerName:SB},
    // Bracelets & Watches
    {_id:'jw020',title:'Tennis Bracelet CZ',category:'Watches & Jewelry',price:89.99,originalPrice:129.99,stock:15,rating:4.8,numReviews:378,isFeatured:true,description:'Round-cut CZ stones set in 18kt white gold-plated settings, box-clasp. 7" adjustable.',images:img(19),sellerName:SB},
    {_id:'jw021',title:'Pandora-Style Charm Bracelet',category:'Watches & Jewelry',price:49.99,originalPrice:72.99,stock:25,rating:4.6,numReviews:512,description:'Sterling silver snake-chain bracelet with barrel clasp. Fits Pandora-style threaded charms.',images:img(0),sellerName:UT},
    {_id:'jw022',title:'Gold Bangle Set 6-Piece',category:'Watches & Jewelry',price:44.99,originalPrice:64.99,stock:32,rating:4.5,numReviews:445,description:'Set of 6 gold-plated bangles in varying textures — plain, twisted, beaded. Stack them all.',images:img(1),sellerName:SB},
    {_id:'jw023',title:'Rose Gold Luxury Watch',category:'Watches & Jewelry',price:249.99,originalPrice:349.99,stock:8,rating:4.8,numReviews:234,isFeatured:true,description:'Rose gold-tone case with mesh bracelet strap. Japanese quartz movement, sapphire crystal glass. 38mm.',images:img(2),sellerName:LE},
    {_id:'jw024',title:'Classic Black Dial Watch',category:'Watches & Jewelry',price:199.99,originalPrice:279.99,stock:12,rating:4.7,numReviews:312,description:'Minimalist black sunray dial on polished stainless case. Leather strap, 40mm, 50m water resistant.',images:img(3),sellerName:UT},
    {_id:'jw025',title:'Smart Fitness Watch',category:'Watches & Jewelry',price:159.99,originalPrice:219.99,stock:20,rating:4.6,numReviews:567,description:'AMOLED fitness smartwatch. Heart rate, SpO2, GPS, 7-day battery. 100+ sport modes, IP68.',images:img(4),sellerName:SB},
  ];
}

/* ── COSMETICS ──────────────────────────────────────────────── */
function getCosmetics() {
  const coi = [
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=500&q=80',
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=500&q=80',
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=500&q=80',
    'https://images.unsplash.com/photo-1631730486784-74757073c3f9?w=500&q=80',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=500&q=80',
    'https://images.unsplash.com/photo-1583241475880-083f84372725?w=500&q=80',
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=500&q=80',
    'https://images.unsplash.com/photo-1527799820374-87036da0c4ea?w=500&q=80',
    'https://images.unsplash.com/photo-1561015638-47c0b1cac88d?w=500&q=80',
    'https://images.unsplash.com/photo-1502936406656-d1c1ca8be3e8?w=500&q=80',
    'https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=500&q=80',
    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=500&q=80',
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=500&q=80',
    'https://images.unsplash.com/photo-1614253429340-98120bd6d753?w=500&q=80',
    'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=500&q=80',
    'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=500&q=80',
    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500&q=80',
    'https://images.unsplash.com/photo-1607748862156-7c548e7e98f4?w=500&q=80',
    'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=500&q=80',
    'https://images.unsplash.com/photo-1551033406-611cf9a28f67?w=500&q=80',
  ];
  const img = i => [coi[i % coi.length]];
  const SB='Suraj Boutique', UT='Urban Threads', LE='Le Luxe Paris', NR='Noir Maison';
  return [
    // Foundation & Face
    {_id:'co001',title:'HD Flawless Foundation SPF30',category:'Cosmetics & Beauty',price:42.99,originalPrice:58.99,stock:35,rating:4.7,numReviews:1234,isFeatured:true,description:'Buildable liquid foundation with SPF 30, 24-hour wear. 50 shades, full coverage, luminous finish. 30ml.',images:img(0),sellerName:SB},
    {_id:'co002',title:'Luminous CC Cream SPF50',category:'Cosmetics & Beauty',price:32.99,originalPrice:46.99,stock:42,rating:4.6,numReviews:987,description:'Color-correcting cream with SPF 50. Blurs imperfections, evens skin tone, lightweight. 12 shades, 40ml.',images:img(1),sellerName:UT},
    {_id:'co003',title:'Velvet Matte Setting Powder',category:'Cosmetics & Beauty',price:28.99,originalPrice:42.99,stock:50,rating:4.6,numReviews:789,description:'Ultra-fine talc-free setting powder. Blurs pores, mattifies, extends makeup wear all day. 10g.',images:img(2),sellerName:SB},
    {_id:'co004',title:'Glow Highlighter Palette',category:'Cosmetics & Beauty',price:34.99,originalPrice:49.99,stock:30,rating:4.8,numReviews:876,isFeatured:true,description:'4-shade highlighting palette with gold, rose gold, bronze and pearl. Buildable luminosity for face & body.',images:img(3),sellerName:LE},
    {_id:'co005',title:'Sculpting Contour Kit',category:'Cosmetics & Beauty',price:36.99,originalPrice:54.99,stock:28,rating:4.7,numReviews:756,description:'6-piece contour and highlight kit. Matte bronzer, highlighter and blush with contour brush. All skin tones.',images:img(4),sellerName:SB},
    {_id:'co006',title:'Dewy Setting Spray',category:'Cosmetics & Beauty',price:24.99,originalPrice:36.99,stock:45,rating:4.6,numReviews:645,description:'Rosewater-infused setting spray. Sets makeup, adds dewy glow, refreshes throughout the day. 100ml.',images:img(5),sellerName:UT},
    {_id:'co007',title:'Pore-Blurring Primer',category:'Cosmetics & Beauty',price:29.99,originalPrice:44.99,stock:40,rating:4.5,numReviews:534,description:'Silicone-free pore-minimizing primer. Creates smooth canvas, extends wear, brightens skin. 30ml.',images:img(6),sellerName:SB},
    // Eyes
    {_id:'co008',title:'24hr Waterproof Mascara',category:'Cosmetics & Beauty',price:22.99,originalPrice:34.99,stock:55,rating:4.7,numReviews:1567,isFeatured:true,description:'Volumizing, lengthening waterproof mascara. Builds on each coat without clumping. Black & brown.',images:img(7),sellerName:UT},
    {_id:'co009',title:'Eyeshadow Palette 18 Shades',category:'Cosmetics & Beauty',price:44.99,originalPrice:64.99,stock:25,rating:4.8,numReviews:1234,isFeatured:true,description:'Warm neutrals to bold brights — 18 pigmented shades. Matte, shimmer and glitter finishes. Cruelty-free.',images:img(8),sellerName:SB},
    {_id:'co010',title:'Liquid Eyeliner Pen',category:'Cosmetics & Beauty',price:16.99,originalPrice:24.99,stock:60,rating:4.6,numReviews:978,description:'Ultra-precise felt-tip liquid eyeliner. Intense black, waterproof, smudge-proof. Lasts 16 hours.',images:img(9),sellerName:UT},
    {_id:'co011',title:'Brow Microblading Pen',category:'Cosmetics & Beauty',price:24.99,originalPrice:36.99,stock:45,rating:4.7,numReviews:823,description:'4-fork brow pen mimics real hair strokes. Waterproof, long-lasting. 6 shades for every brow color.',images:img(10),sellerName:SB},
    {_id:'co012',title:'Lash Lift Curler Kit',category:'Cosmetics & Beauty',price:34.99,originalPrice:49.99,stock:30,rating:4.6,numReviews:456,description:'Professional at-home lash lift kit. Lifting lotion, setting lotion, nourishing serum. 10-week curl.',images:img(11),sellerName:LE},
    {_id:'co013',title:'Eye Primer Anti-Crease',category:'Cosmetics & Beauty',price:18.99,originalPrice:28.99,stock:50,rating:4.5,numReviews:567,description:'Eyeshadow primer that prevents creasing and extends eyeshadow wear. Nude finish, 5ml.',images:img(12),sellerName:UT},
    // Lips
    {_id:'co014',title:'Matte Liquid Lipstick Set',category:'Cosmetics & Beauty',price:39.99,originalPrice:58.99,stock:30,rating:4.8,numReviews:1123,isFeatured:true,description:'Set of 6 long-wear matte liquid lipsticks. Non-drying formula, 16-hour wear. Nudes to bold reds.',images:img(13),sellerName:SB},
    {_id:'co015',title:'Plumping Lip Gloss',category:'Cosmetics & Beauty',price:19.99,originalPrice:29.99,stock:48,rating:4.6,numReviews:789,description:'Peptide-infused plumping lip gloss. Hydrating, high-shine, subtle tingle effect. 12 wearable shades.',images:img(14),sellerName:UT},
    {_id:'co016',title:'Tinted Lip Balm SPF15',category:'Cosmetics & Beauty',price:14.99,originalPrice:22.99,stock:65,rating:4.5,numReviews:934,description:'Moisturizing tinted lip balm with SPF 15. 8 sheer colors, shea butter formula. Daily lip care.',images:img(15),sellerName:SB},
    {_id:'co017',title:'Velvet Lip Liner Set',category:'Cosmetics & Beauty',price:29.99,originalPrice:44.99,stock:35,rating:4.6,numReviews:567,description:'Set of 6 velvet-smooth lip liners. Long-lasting, defines and fills. Nudes, pinks, berries, reds.',images:img(16),sellerName:UT},
    // Skincare
    {_id:'co018',title:'Vitamin C Brightening Serum',category:'Cosmetics & Beauty',price:54.99,originalPrice:79.99,stock:22,rating:4.8,numReviews:1456,isFeatured:true,description:'15% ascorbic acid + vitamin E + ferulic acid serum. Brightens, fades dark spots, antioxidant protection. 30ml.',images:img(17),sellerName:LE},
    {_id:'co019',title:'Hyaluronic Acid Moisturizer',category:'Cosmetics & Beauty',price:44.99,originalPrice:64.99,stock:28,rating:4.7,numReviews:1234,description:'3-weight hyaluronic acid face cream. Plumps, hydrates, barrier repair. Fragrance-free, all skin types. 50ml.',images:img(18),sellerName:SB},
    {_id:'co020',title:'Retinol Night Cream',category:'Cosmetics & Beauty',price:62.99,originalPrice:89.99,stock:18,rating:4.8,numReviews:876,isFeatured:true,description:'0.3% encapsulated retinol night cream. Reduces fine lines, boosts collagen. Beginners to advanced. 50ml.',images:img(19),sellerName:LE},
    {_id:'co021',title:'Clay Deep Cleanse Mask',category:'Cosmetics & Beauty',price:26.99,originalPrice:38.99,stock:35,rating:4.6,numReviews:789,description:'Kaolin and bentonite clay mask with activated charcoal. Draws out impurities, tightens pores. 100ml.',images:img(0),sellerName:UT},
    {_id:'co022',title:'SPF 50 Sunscreen Fluid',category:'Cosmetics & Beauty',price:29.99,originalPrice:44.99,stock:45,rating:4.7,numReviews:1023,description:'Lightweight SPF 50 PA++++ sunscreen fluid. No white cast, oil-free, invisible. Daily UV protection. 50ml.',images:img(1),sellerName:SB},
    {_id:'co023',title:'Niacinamide 10% Serum',category:'Cosmetics & Beauty',price:18.99,originalPrice:28.99,stock:55,rating:4.7,numReviews:1567,description:'10% niacinamide + 1% zinc serum. Minimizes pores, balances oil, fades blemish marks. 30ml.',images:img(2),sellerName:UT},
    // Nails & Tools
    {_id:'co024',title:'Gel Nail Polish Set 12pc',category:'Cosmetics & Beauty',price:34.99,originalPrice:49.99,stock:30,rating:4.6,numReviews:712,description:'12 gel nail polishes, UV/LED curable. Long-lasting chip-free formula. Seasonal trend colors included.',images:img(3),sellerName:SB},
    {_id:'co025',title:'Beauty Blender Sponge Set',category:'Cosmetics & Beauty',price:19.99,originalPrice:29.99,stock:50,rating:4.7,numReviews:1234,isFeatured:true,description:'Set of 3 latex-free makeup sponges. Seamless application for liquid, cream & powder products.',images:img(4),sellerName:UT},
    {_id:'co026',title:'Professional Brush Set 15pc',category:'Cosmetics & Beauty',price:44.99,originalPrice:64.99,stock:22,rating:4.8,numReviews:678,description:'15-piece synthetic hair brush set. Face, eye, lip and blending brushes. Includes roll-up pouch.',images:img(5),sellerName:SB},
    {_id:'co027',title:'Rose Quartz Jade Roller',category:'Cosmetics & Beauty',price:22.99,originalPrice:34.99,stock:40,rating:4.5,numReviews:890,description:'Genuine rose quartz dual-end jade roller. Reduces puffiness, boosts lymphatic drainage, cooling effect.',images:img(6),sellerName:LE},
    {_id:'co028',title:'Gua Sha Facial Tool',category:'Cosmetics & Beauty',price:18.99,originalPrice:28.99,stock:45,rating:4.6,numReviews:723,description:'Authentic green jade gua sha tool. Multi-edge for face contouring, neck, jawline and décolleté.',images:img(7),sellerName:SB},
    {_id:'co029',title:'LED Light Therapy Mask',category:'Cosmetics & Beauty',price:129.99,originalPrice:179.99,stock:10,rating:4.7,numReviews:345,isFeatured:true,description:'7-color LED face mask. Red for anti-aging, blue for acne, green for pigmentation. 20-min sessions.',images:img(8),sellerName:LE},
    {_id:'co030',title:'Makeup Fridge Mini Cooler',category:'Cosmetics & Beauty',price:64.99,originalPrice:89.99,stock:15,rating:4.6,numReviews:456,description:'4L compact skincare fridge. Keeps cosmetics cool for longer shelf life. USB-powered, silent, cute design.',images:img(9),sellerName:UT},
  ];
}

/* ── GLASSES ──────────────────────────────────────────────── */
function getGlasses() {
  const gi = [
    'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=500&q=80',
    'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&q=80',
    'https://images.unsplash.com/photo-1508296695146-257a814070b4?w=500&q=80',
    'https://images.unsplash.com/photo-1556306535-38febf6cdbe9?w=500&q=80',
    'https://images.unsplash.com/photo-1627844718626-4c0b3f77f833?w=500&q=80',
    'https://images.unsplash.com/photo-1473496169904-658ba7574b0d?w=500&q=80',
    'https://images.unsplash.com/photo-1604591939241-cc5a2b63c9f8?w=500&q=80',
    'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=500&q=80',
    'https://images.unsplash.com/photo-1577803645773-f96470509666?w=500&q=80',
    'https://images.unsplash.com/photo-1607827448387-a67db879ce5f?w=500&q=80',
    'https://images.unsplash.com/photo-1638977748693-e1ff6bae4048?w=500&q=80',
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500&q=80',
    'https://images.unsplash.com/photo-1641637950716-c9a4d6c00ae6?w=500&q=80',
    'https://images.unsplash.com/photo-1532572411936-0f78c66f1d59?w=500&q=80',
    'https://images.unsplash.com/photo-1434064511983-e2e346b1c3e9?w=500&q=80',
  ];
  const img = i => [gi[i % gi.length]];
  const SB='Suraj Boutique', UT='Urban Threads', LE='Le Luxe Paris';
  return [
    // Sunglasses
    {_id:'gl001',title:'Classic Aviator Sunglasses',category:'Glasses & Lens',price:44.99,originalPrice:64.99,stock:40,rating:4.7,numReviews:1234,isFeatured:true,description:'Polarized UV400 aviator sunglasses. Metal frame, teardrop lens, adjustable nose pads. Gold & silver.',images:img(0),sellerName:SB},
    {_id:'gl002',title:'Oversized Square Sunglasses',category:'Glasses & Lens',price:38.99,originalPrice:55.99,stock:35,rating:4.6,numReviews:876,description:'90s-inspired oversized square frames in acetate. Gradient lens, UV400 protection, spring hinges.',images:img(1),sellerName:UT},
    {_id:'gl003',title:'Round Lennon Sunglasses',category:'Glasses & Lens',price:34.99,originalPrice:49.99,stock:45,rating:4.5,numReviews:678,description:'Small round wire-frame sunglasses. Tinted flat lens, slim temple, UV400. Retro-cool aesthetic.',images:img(2),sellerName:SB},
    {_id:'gl004',title:'Cat-Eye Designer Sunglasses',category:'Glasses & Lens',price:54.99,originalPrice:79.99,stock:28,rating:4.7,numReviews:534,isFeatured:true,description:'Vintage cat-eye acetate sunglasses with polarized gradient lenses. Keyhole bridge, spring hinges.',images:img(3),sellerName:LE},
    {_id:'gl005',title:'Sports Wraparound Sunglasses',category:'Glasses & Lens',price:49.99,originalPrice:72.99,stock:30,rating:4.6,numReviews:445,description:'Polarized TR90 wraparound sports glasses. Rubber nose pads and temple tips, UV400. Cycling & running.',images:img(4),sellerName:UT},
    {_id:'gl006',title:'Mirrored Shield Sunglasses',category:'Glasses & Lens',price:42.99,originalPrice:62.99,stock:32,rating:4.5,numReviews:389,description:'Single-lens shield frame sunglasses. Chrome mirror coating, TR90 frame, UV400, unisex.',images:img(5),sellerName:SB},
    {_id:'gl007',title:'Luxury Gold Rimless Sunglasses',category:'Glasses & Lens',price:129.99,originalPrice:179.99,stock:12,rating:4.8,numReviews:234,isFeatured:true,description:'Rimless floating lens sunglasses. 24kt gold-plated titanium bridge, polarized amber lens.',images:img(6),sellerName:LE},
    {_id:'gl008',title:'Bamboo Wood Frame Sunglasses',category:'Glasses & Lens',price:39.99,originalPrice:57.99,stock:25,rating:4.6,numReviews:312,description:'Eco-friendly natural bamboo-wood frame sunglasses. UV400 polarized lens, lightweight and unique.',images:img(7),sellerName:SB},
    {_id:'gl009',title:'Hexagonal Flat-Top Sunglasses',category:'Glasses & Lens',price:36.99,originalPrice:53.99,stock:38,rating:4.4,numReviews:456,description:'Geometric hexagon flat-lens sunglasses in colorful acetate. Bold statement piece, UV400.',images:img(8),sellerName:UT},
    {_id:'gl010',title:'Wayfarer Style Classic Frames',category:'Glasses & Lens',price:34.99,originalPrice:49.99,stock:50,rating:4.6,numReviews:789,description:'Timeless wayfarer-style acetate sunglasses. Available in tortoise, black and crystal. Polarized UV400.',images:img(9),sellerName:SB},
    // Optical & Blue Light
    {_id:'gl011',title:'Blue Light Blocking Glasses',category:'Glasses & Lens',price:29.99,originalPrice:44.99,stock:55,rating:4.6,numReviews:1567,isFeatured:true,description:'Anti-blue light computer glasses. Clear lens, reduces digital eye strain, zero distortion. Unisex.',images:img(10),sellerName:UT},
    {_id:'gl012',title:'Round Acetate Reading Glasses',category:'Glasses & Lens',price:22.99,originalPrice:34.99,stock:60,rating:4.4,numReviews:845,description:'Spring-hinge reading glasses in round acetate frame. Strengths +1.0 to +3.5. Slim case included.',images:img(11),sellerName:SB},
    {_id:'gl013',title:'Photochromic Transition Lenses',category:'Glasses & Lens',price:89.99,originalPrice:129.99,stock:18,rating:4.7,numReviews:423,description:'Photochromic lens glasses that darken in sunlight. Full UV protection, anti-scratch coating.',images:img(12),sellerName:LE},
    {_id:'gl014',title:'Titanium Lightweight Frames',category:'Glasses & Lens',price:149.99,originalPrice:209.99,stock:10,rating:4.8,numReviews:234,isFeatured:true,description:'Ultra-lightweight beta-titanium optical frames. Hypoallergenic, memory flex, prescription-ready.',images:img(13),sellerName:LE},
    {_id:'gl015',title:'Thick Horn-Rim Frames',category:'Glasses & Lens',price:44.99,originalPrice:64.99,stock:30,rating:4.5,numReviews:567,description:'Bold thick horn-rimmed acetate optical frames. Classic intellectual look. Demo lens, prescription-ready.',images:img(14),sellerName:UT},
    // Kids & Accessories
    {_id:'gl016',title:'Kids Flexible Silicone Glasses',category:'Glasses & Lens',price:24.99,originalPrice:36.99,stock:40,rating:4.5,numReviews:334,description:'Flexible silicone kids eyeglasses. Lightweight, impact-resistant, spring hinge. Ages 3–10.',images:img(0),sellerName:SB},
    {_id:'gl017',title:'Clip-On Polarized Sunglasses',category:'Glasses & Lens',price:19.99,originalPrice:29.99,stock:50,rating:4.3,numReviews:456,description:'Universal clip-on polarized flip-up sunglasses. Fits most frame styles, UV400.',images:img(1),sellerName:UT},
    {_id:'gl018',title:'Anti-Fog Swimming Goggles',category:'Glasses & Lens',price:27.99,originalPrice:39.99,stock:45,rating:4.6,numReviews:623,description:'Anti-fog UV swim goggles with soft silicone seal. Wide-view lens, adjustable strap. Adult & junior.',images:img(2),sellerName:SB},
    {_id:'gl019',title:'Ski Snow Goggles',category:'Glasses & Lens',price:69.99,originalPrice:99.99,stock:20,rating:4.7,numReviews:312,description:'Double-layer foam ski goggles. UV400 anti-fog spherical lens. OTG (over glasses) compatible.',images:img(3),sellerName:UT},
    {_id:'gl020',title:'Eyeglass Case & Chain Set',category:'Glasses & Lens',price:14.99,originalPrice:22.99,stock:70,rating:4.4,numReviews:445,description:'Leather eyeglass hard case with chain retainer set. Magnetic closure, microfiber cleaning cloth.',images:img(4),sellerName:SB},
  ];
}

/* ── BAGS ──────────────────────────────────────────────── */
function getBags() {
  const bi = [
    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500&q=80',
    'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=500&q=80',
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500&q=80',
    'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=500&q=80',
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&q=80',
    'https://images.unsplash.com/photo-1575032617751-6ddec2089882?w=500&q=80',
    'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=500&q=80',
    'https://images.unsplash.com/photo-1614179924047-e1ab49a0a0cf?w=500&q=80',
    'https://images.unsplash.com/photo-1594938298603-c8148c4b5ec9?w=500&q=80',
    'https://images.unsplash.com/photo-1512201078372-9c52b0212aca?w=500&q=80',
    'https://images.unsplash.com/photo-1455849318743-b2233052fcff?w=500&q=80',
    'https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?w=500&q=80',
    'https://images.unsplash.com/photo-1473188588951-666fce8e7c68?w=500&q=80',
    'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=500&q=80',
    'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=500&q=80',
    'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=500&q=80',
    'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=500&q=80',
    'https://images.unsplash.com/photo-1608731267464-c0c889c2ff92?w=500&q=80',
    'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=500&q=80',
    'https://images.unsplash.com/photo-1581605405669-fcdf81165afa?w=500&q=80',
  ];
  const img = i => [bi[i % bi.length]];
  const SB='Suraj Boutique', UT='Urban Threads', LE='Le Luxe Paris';
  return [
    // Handbags
    {_id:'bg001',title:'Quilted Chain Shoulder Bag',category:'Bags & Accessories',price:129.99,originalPrice:179.99,stock:15,rating:4.8,numReviews:567,isFeatured:true,description:'Quilted lambskin shoulder bag with gold chain strap. Interior zip pocket, magnetic snap closure. 10"×7".',images:img(0),sellerName:LE},
    {_id:'bg002',title:'Structured Top-Handle Bag',category:'Bags & Accessories',price:149.99,originalPrice:209.99,stock:10,rating:4.8,numReviews:423,isFeatured:true,description:'Saffiano leather structured tote with top handles and removable strap. Gold hardware, 11"×8"×4".',images:img(1),sellerName:LE},
    {_id:'bg003',title:'Raffia Basket Tote',category:'Bags & Accessories',price:44.99,originalPrice:64.99,stock:25,rating:4.5,numReviews:312,description:'Handwoven raffia beach tote with leather handles and inner zip pouch. Magnetic snap top, 14"×12".',images:img(2),sellerName:SB},
    {_id:'bg004',title:'Mini Croc Embossed Bag',category:'Bags & Accessories',price:69.99,originalPrice:99.99,stock:20,rating:4.6,numReviews:389,description:'Mini croc-embossed faux leather bag with single chain strap. Top zip, 3 inner compartments. 7"×5".',images:img(3),sellerName:UT},
    {_id:'bg005',title:'Canvas Tote Bag Large',category:'Bags & Accessories',price:24.99,originalPrice:36.99,stock:60,rating:4.4,numReviews:890,description:'12oz waxed canvas tote with interior zip pocket. Wide handles, reinforced base. Natural & olive.',images:img(4),sellerName:SB},
    {_id:'bg006',title:'Suede Fringe Hobo Bag',category:'Bags & Accessories',price:89.99,originalPrice:129.99,stock:14,rating:4.7,numReviews:267,isFeatured:true,description:'Genuine suede boho hobo bag with fringe detail and tassels. Interior zip pocket, single shoulder strap.',images:img(5),sellerName:UT},
    {_id:'bg007',title:'Velvet Clutch Evening Bag',category:'Bags & Accessories',price:49.99,originalPrice:72.99,stock:22,rating:4.6,numReviews:345,description:'Crushed velvet envelope clutch with twist-lock clasp and wrist strap. Satin lining. 10"×6".',images:img(6),sellerName:SB},
    {_id:'bg008',title:'Woven Leather Intreccio Bag',category:'Bags & Accessories',price:189.99,originalPrice:269.99,stock:7,rating:4.9,numReviews:145,isFeatured:true,description:'Hand-woven leather intreccio shoulder bag inspired by Italian craftsmanship. Interior suede lining.',images:img(7),sellerName:LE},
    // Crossbody & Shoulder
    {_id:'bg009',title:'Pebbled Leather Crossbody',category:'Bags & Accessories',price:99.99,originalPrice:144.99,stock:18,rating:4.7,numReviews:567,isFeatured:true,description:'Pebbled leather mini crossbody with adjustable strap. Back slip pocket, zip top, 9"×7". 5 colors.',images:img(8),sellerName:SB},
    {_id:'bg010',title:'Nylon Camera Bag',category:'Bags & Accessories',price:39.99,originalPrice:57.99,stock:35,rating:4.5,numReviews:423,description:'Compact nylon camera-style crossbody. Two front pockets, adjustable strap, 8"×6"×3".',images:img(9),sellerName:UT},
    {_id:'bg011',title:'Baguette Shoulder Bag',category:'Bags & Accessories',price:79.99,originalPrice:114.99,stock:20,rating:4.6,numReviews:334,description:'Compact baguette bag with crescent silhouette. Faux leather, single shoulder strap, magnetic snap.',images:img(10),sellerName:SB},
    {_id:'bg012',title:'Multi-Pocket Utility Crossbody',category:'Bags & Accessories',price:54.99,originalPrice:79.99,stock:28,rating:4.5,numReviews:456,description:'8-pocket tactical crossbody bag in water-resistant nylon. USB charging port pass-through.',images:img(11),sellerName:UT},
    {_id:'bg013',title:'Printed Silk Scarf Bag',category:'Bags & Accessories',price:64.99,originalPrice:94.99,stock:16,rating:4.6,numReviews:234,description:'Structured bag with detachable silk scarf wrapped handle. Calfskin body, zip closure.',images:img(12),sellerName:LE},
    // Backpacks
    {_id:'bg014',title:'Leather Mini Backpack',category:'Bags & Accessories',price:89.99,originalPrice:129.99,stock:18,rating:4.7,numReviews:467,isFeatured:true,description:'Compact faux leather mini backpack with adjustable straps and convertible top handle. Drawstring and flap.',images:img(13),sellerName:SB},
    {_id:'bg015',title:'Anti-Theft Travel Backpack',category:'Bags & Accessories',price:79.99,originalPrice:114.99,stock:22,rating:4.8,numReviews:634,description:'30L anti-theft backpack with hidden pockets and lockable zippers. USB port, laptop sleeve. TSA-friendly.',images:img(14),sellerName:UT},
    {_id:'bg016',title:'School Canvas Rucksack',category:'Bags & Accessories',price:44.99,originalPrice:64.99,stock:40,rating:4.5,numReviews:789,description:'Waxed canvas rucksack with leather base and handles. 20L capacity, laptop sleeve, water bottle pocket.',images:img(15),sellerName:SB},
    {_id:'bg017',title:'Gym Duffel Bag',category:'Bags & Accessories',price:49.99,originalPrice:72.99,stock:30,rating:4.6,numReviews:512,description:'Large 40L gym duffel with separate wet shoe compartment. Water-resistant, adjustable shoulder strap.',images:img(16),sellerName:UT},
    // Wallets & Small Leather Goods
    {_id:'bg018',title:'Slim Bifold Card Wallet',category:'Bags & Accessories',price:39.99,originalPrice:58.99,stock:45,rating:4.6,numReviews:678,description:'Slim bifold wallet in RFID-blocking leather. 8 card slots, 2 bill compartments. Minimalist design.',images:img(17),sellerName:SB},
    {_id:'bg019',title:'Zip-Around Purse Wallet',category:'Bags & Accessories',price:54.99,originalPrice:79.99,stock:28,rating:4.7,numReviews:456,description:'Zip-around continental wallet in saffiano leather. 12 card slots, coin purse, phone pocket. 7 colors.',images:img(18),sellerName:LE},
    {_id:'bg020',title:'AirTag Leather Key Pouch',category:'Bags & Accessories',price:29.99,originalPrice:44.99,stock:50,rating:4.5,numReviews:345,description:'Full-grain leather key pouch with AirTag holder loop. D-ring, 4 key hooks, zipper coin pocket.',images:img(19),sellerName:UT},
    {_id:'bg021',title:'Straw Clutch Beach Bag',category:'Bags & Accessories',price:29.99,originalPrice:44.99,stock:35,rating:4.4,numReviews:289,description:'Hand-woven straw clutch with wooden beaded strap. Magnetic clasp, 10"×7". Summer essential.',images:img(0),sellerName:SB},
    {_id:'bg022',title:'Leather Belt Bag Fanny Pack',category:'Bags & Accessories',price:44.99,originalPrice:64.99,stock:30,rating:4.6,numReviews:534,isFeatured:true,description:'Genuine leather belt bag with adjustable waist strap. Two zip compartments, D-ring. Versatile crossbody.',images:img(1),sellerName:UT},
    {_id:'bg023',title:'Acrylic Box Minaudière',category:'Bags & Accessories',price:59.99,originalPrice:84.99,stock:12,rating:4.6,numReviews:178,description:'Transparent acrylic box clutch with gold hardware and wrist chain. Interior mirror, snap closure.',images:img(2),sellerName:LE},
    {_id:'bg024',title:'Vegan Leather Tote Set 3pc',category:'Bags & Accessories',price:74.99,originalPrice:109.99,stock:20,rating:4.5,numReviews:312,description:'Set of 3 nested vegan leather totes. Large market bag, medium shopper, small pouch. Eco-friendly.',images:img(3),sellerName:SB},
    {_id:'bg025',title:'Monogram Luxury Weekend Bag',category:'Bags & Accessories',price:229.99,originalPrice:319.99,stock:6,rating:4.9,numReviews:134,isFeatured:true,description:'Premium canvas monogram weekend duffel. Leather trim, zip top, shoe compartment. 50L capacity.',images:img(4),sellerName:LE},
  ];
}

function getDemoProducts() {
  return [
    { _id: 'd1', title: 'Floral Summer Dress', category: 'Dress & Frock', price: 49.99, originalPrice: 69.99, stock: 25, rating: 4.5, numReviews: 12, isFeatured: true, images: ['assets/images/products/clothes-1.jpg'], sellerName: 'Suraj Boutique' },
    { _id: 'd2', title: 'Classic Winter Coat', category: 'Winter Wear', price: 129.99, originalPrice: 179.99, stock: 12, rating: 4.8, numReviews: 28, isFeatured: true, images: ['assets/images/products/jacket-1.jpg'], sellerName: 'Urban Threads' },
    { _id: 'd3', title: 'Aviator Sunglasses', category: 'Glasses & Lens', price: 34.99, originalPrice: 49.99, stock: 50, rating: 4.3, numReviews: 45, images: ['assets/images/products/1.jpg'], sellerName: 'Suraj Boutique' },
    { _id: 'd4', title: 'Slim Fit Denim Jeans', category: 'Shorts & Jeans', price: 59.99, stock: 30, rating: 4.6, numReviews: 34, isFeatured: true, images: ['assets/images/products/shorts-1.jpg'], sellerName: 'Urban Threads' },
    { _id: 'd5', title: 'Graphic Print Tee', category: 'T-Shirts', price: 24.99, stock: 100, rating: 4.2, numReviews: 67, images: ['assets/images/products/shirt-1.jpg'], sellerName: 'Suraj Boutique' },
    { _id: 'd6', title: 'Leather Biker Jacket', category: 'Jackets', price: 199.99, originalPrice: 259.99, stock: 8, rating: 4.9, numReviews: 15, isFeatured: true, images: ['assets/images/products/jacket-2.jpg'], sellerName: 'Urban Threads' },
    { _id: 'd7', title: 'Chronograph Watch', category: 'Watches & Jewelry', price: 149.99, originalPrice: 199.99, stock: 15, rating: 4.7, numReviews: 22, isFeatured: true, images: ['assets/images/products/watch-1.jpg'], sellerName: 'Suraj Boutique' },
    { _id: 'd8', title: 'Wool Fedora Hat', category: 'Hats & Caps', price: 39.99, stock: 40, rating: 4.4, numReviews: 18, images: ['assets/images/products/3.jpg'], sellerName: 'Urban Threads' },
    { _id: 'd9', title: 'Leather Crossbody Bag', category: 'Bags & Accessories', price: 89.99, originalPrice: 119.99, stock: 20, rating: 4.6, numReviews: 31, isFeatured: true, images: ['assets/images/products/belt.jpg'], sellerName: 'Suraj Boutique' },
    { _id: 'd10', title: 'Running Sneakers', category: 'Shoes & Footwear', price: 79.99, stock: 35, rating: 4.5, numReviews: 52, images: ['assets/images/products/shoe-1.jpg'], sellerName: 'Urban Threads' },
    { _id: 'd11', title: 'Rose Gold EDP', category: 'Perfume & Fragrance', price: 69.99, originalPrice: 89.99, stock: 25, rating: 4.8, numReviews: 40, isFeatured: true, description: 'Luxurious floral musk with notes of rose, jasmine, and sandalwood. Long-lasting 100ml EDP.', images: ['assets/images/products/perfume.jpg'], sellerName: 'Suraj Boutique' },
    { _id: 'd12', title: 'Yoga Leggings', category: 'Sports', price: 44.99, stock: 60, rating: 4.6, numReviews: 88, images: ['assets/images/products/sports-1.jpg'], sellerName: 'Urban Threads' },
    ...getClothes(),
    ...getFootwear(),
    ...getJewelry(),
    ...getCosmetics(),
    ...getGlasses(),
    ...getBags(),
    ...getLuxuryPerfumes(),
  ];
}

function showSkeleton(show) {
  const sk = document.getElementById('loading-skeleton');
  const grid = document.getElementById('product-grid');
  if (sk) sk.style.display = show ? 'grid' : 'none';
  if (grid) grid.style.display = show ? 'none' : 'grid';
}

function renderProducts(products) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = '';
    document.getElementById('empty-state')?.classList.remove('hidden');
    return;
  }
  document.getElementById('empty-state')?.classList.add('hidden');
  grid.innerHTML = products.map(p => productCardHTML(p)).join('');
  bindCardEvents();
}

function productCardHTML(p) {
  const isWishlisted = state.wishlist.includes(p._id);
  const isCompared = (state.compareList || []).includes(p._id);
  const discount = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const inStock = p.stock > 0;
  const stockPct = Math.min(100, Math.round((p.stock / 50) * 100));
  const stockClass = stockPct < 20 ? 'low' : stockPct < 50 ? 'medium' : '';
  return `
  <article class="product-card" data-id="${p._id}">
    <div class="product-card-img">
      <img src="${p.images?.[0] || 'assets/images/products/clothes-1.jpg'}" alt="${esc(p.title)}" loading="lazy" />
      <div class="card-badges">
        ${p.isFeatured ? '<span class="badge-featured">Featured</span>' : ''}
        ${discount >= 10 ? `<span class="badge-sale">-${discount}%</span>` : ''}
        ${!inStock ? '<span class="badge-oos">Out of Stock</span>' : ''}
      </div>
      <button class="card-wishlist ${isWishlisted ? 'active' : ''}" data-id="${p._id}" aria-label="Wishlist">
        <i class="fa${isWishlisted ? 's' : 'r'} fa-heart"></i>
      </button>
      <button class="card-compare-btn ${isCompared ? 'active' : ''}" data-id="${p._id}" title="Compare" onclick="event.stopPropagation();app.toggleCompare('${p._id}')">
        <i class="fas fa-balance-scale"></i>
      </button>
      <div class="card-quick-view" onclick="event.stopPropagation();app.openProductModal('${p._id}')">⚡ Quick View</div>
    </div>
    <div class="product-card-body">
      <span class="card-category">${esc(p.category)}</span>
      <h3 class="card-title">${esc(p.title)}</h3>
      <div class="card-rating">${starsHTML(p.rating)} <span>(${p.numReviews || 0})</span></div>
      <div class="card-price-row">
        <span class="card-price">${formatPrice(p.price)}</span>
        ${p.originalPrice ? `<span class="card-original">${formatPrice(p.originalPrice)}</span>` : ''}
      </div>
      ${inStock && p.stock < 30 ? `<div class="stock-bar-wrap">
        <div class="stock-bar-label"><span>Only <strong>${p.stock} left</strong></span><span>${stockPct}%</span></div>
        <div class="stock-bar"><div class="stock-bar-fill ${stockClass}" style="width:${stockPct}%"></div></div>
      </div>` : ''}
      <div class="card-actions">
        <button class="card-add-btn" data-id="${p._id}" ${!inStock ? 'disabled' : ''}>${inStock ? '<i class="fas fa-shopping-bag"></i> Add to Cart' : 'Out of Stock'}</button>
      </div>
    </div>
  </article>`;
}

function showcaseItemHTML(p) {
  return `
  <div class="showcase-item" onclick="app.openProductModal('${p._id}')">
    <div class="showcase-item-img"><img src="${p.images?.[0] || 'https://via.placeholder.com/80'}" alt="${esc(p.title)}" loading="lazy" /></div>
    <div class="showcase-item-info">
      <div class="showcase-category">${esc(p.category)}</div>
      <div class="showcase-title">${esc(p.title)}</div>
      <div class="showcase-price">${formatPrice(p.price)}</div>
    </div>
  </div>`;
}

function starsHTML(rating) {
  const r = rating || 0;
  const full = Math.floor(r);
  const half = r % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return `<span class="stars-sm">${'★'.repeat(full)}${half ? '½' : ''}${'☆'.repeat(empty)}</span> ${r.toFixed(1)}`;
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function bindCardEvents() {
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-wishlist') || e.target.closest('.card-add-btn')) return;
      openProductModal(card.dataset.id);
    });
  });
  document.querySelectorAll('.card-wishlist').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleWishlist(btn.dataset.id); });
  });
  document.querySelectorAll('.card-add-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); addToCart(btn.dataset.id); });
  });
}

function renderPagination() {
  const { page, pages } = state.pagination;
  const container = document.getElementById('pagination');
  if (!container) return;
  if (pages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  if (page > 1) html += `<button class="page-btn" data-page="${page - 1}">‹</button>`;
  for (let i = 1; i <= pages; i++) html += `<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  if (page < pages) html += `<button class="page-btn" data-page="${page + 1}">›</button>`;
  container.innerHTML = html;
  container.querySelectorAll('.page-btn').forEach(btn => btn.addEventListener('click', () => {
    state.pagination.page = parseInt(btn.dataset.page);
    fetchProducts();
    document.getElementById('shop-main')?.scrollIntoView({ behavior: 'smooth' });
  }));
}

/* Render sidebar showcase lists */
function renderShowcaseLists() {
  const demos = getDemoProducts();
  const all = state.products.length ? state.products : demos;

  // Best sellers (by numReviews)
  const bestSellers = [...all].sort((a, b) => (b.numReviews || 0) - (a.numReviews || 0)).slice(0, 4);
  const bsEl = document.getElementById('best-sellers-list');
  if (bsEl) bsEl.innerHTML = `<div class="sidebar-showcase">${bestSellers.map(showcaseItemHTML).join('')}</div>`;

  // New arrivals (first 4)
  const newArrivals = all.slice(0, 4);
  const naEl = document.getElementById('new-arrivals-list');
  if (naEl) naEl.innerHTML = newArrivals.map(showcaseItemHTML).join('');

  // Trending (by rating desc)
  const trending = [...all].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
  const trEl = document.getElementById('trending-list');
  if (trEl) trEl.innerHTML = trending.map(showcaseItemHTML).join('');

  // Top Rated
  const topRated = [...all].filter(p => p.rating >= 4.5).slice(0, 4);
  const trREl = document.getElementById('top-rated-list');
  if (trREl) trREl.innerHTML = (topRated.length ? topRated : all.slice(8, 12)).map(showcaseItemHTML).join('');

  // Right sidebar products
  const rightEl = document.getElementById('right-products-list');
  if (rightEl) rightEl.innerHTML = `<div class="sidebar-showcase">${all.slice(4, 8).map(showcaseItemHTML).join('')}</div>`;
}

/* ============================================================
   CART
   ============================================================ */
function addToCart(productId, qty = 1) {
  const product = state.products.find(p => p._id === productId) || getDemoProducts().find(p => p._id === productId);
  if (!product) return;
  if (product.stock === 0) { toast('This product is out of stock.', 'error'); return; }

  const existing = state.cart.find(i => i._id === productId);
  if (existing) {
    const newQty = existing.quantity + qty;
    if (newQty > product.stock) { toast(`Only ${product.stock} in stock.`, 'error'); return; }
    existing.quantity = newQty;
  } else {
    state.cart.push({ _id: productId, title: product.title, price: product.price, image: product.images?.[0], stock: product.stock, quantity: qty });
  }
  saveLocal(); updateCartUI(); bounceCartBadge();
  toast(`<strong>${esc(product.title)}</strong> added to cart!`, 'success');
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i._id !== productId);
  saveLocal(); updateCartUI(); renderCartItems();
}

function updateQty(productId, delta) {
  const item = state.cart.find(i => i._id === productId);
  if (!item) return;
  const newQty = item.quantity + delta;
  if (newQty < 1) { removeFromCart(productId); return; }
  if (newQty > item.stock) { toast(`Only ${item.stock} in stock.`, 'error'); return; }
  item.quantity = newQty;
  saveLocal(); updateCartUI(); renderCartItems();
}

function updateCartUI() {
  const count = state.cart.reduce((s, i) => s + i.quantity, 0);
  ['cart-count', 'cart-drawer-count', 'mbn-cart-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  });
  renderMiniCartPreview();
  checkBundleDeal();
}

function calcCartTotals() {
  const subtotal = state.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const isNPR = getCurrency() === 'NPR';
  // Shipping in USD equivalent; NPR: free over रू13,300 (~$100), else रू100–350
  const shipping = isNPR
    ? (subtotal > 100 ? 0 : subtotal > 0 ? (100 / 133) : 0)   // ~रू100 in USD
    : (subtotal > 100 ? 0 : subtotal > 0 ? 12 : 0);
  const discount = state.coupon ? state.coupon.discount : 0;
  const taxable = subtotal - discount + shipping;
  const tax = taxable * 0.13;
  const total = taxable + tax;
  return { subtotal, shipping, discount, tax, total };
}

function renderCartItems() {
  const body = document.getElementById('cart-items');
  const empty = document.getElementById('cart-empty');
  const footer = document.getElementById('cart-footer');

  if (!state.cart.length) {
    if (body) { body.innerHTML = ''; if (empty) body.appendChild(empty); }
    if (empty) empty.classList.remove('hidden');
    if (footer) footer.style.display = 'none';
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (footer) footer.style.display = 'block';
  if (body) body.innerHTML = state.cart.map(i => `
    <div class="cart-item">
      <div class="cart-item-img"><img src="${i.image || 'https://via.placeholder.com/80'}" alt="${esc(i.title)}" /></div>
      <div class="cart-item-info">
        <p class="cart-item-title">${esc(i.title)}</p>
        <p class="cart-item-price">${formatPrice(i.price * i.quantity)}</p>
        <div class="cart-item-controls">
          <button class="qty-btn-sm" onclick="app.updateQty('${i._id}', -1)">−</button>
          <span class="qty-val">${i.quantity}</span>
          <button class="qty-btn-sm" onclick="app.updateQty('${i._id}', 1)">+</button>
          <button class="remove-item" onclick="app.removeFromCart('${i._id}')" aria-label="Remove"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
    </div>`).join('');

  const { subtotal, shipping, discount, tax, total } = calcCartTotals();
  const g = id => document.getElementById(id);
  if (g('cart-subtotal')) g('cart-subtotal').textContent = formatPrice(subtotal);
  if (g('cart-shipping')) g('cart-shipping').textContent = shipping === 0 ? 'FREE' : formatPrice(shipping);
  if (g('cart-tax')) g('cart-tax').textContent = formatPrice(tax);
  if (g('cart-total')) g('cart-total').textContent = formatPrice(total);
  const discRow = g('discount-row');
  if (discRow) {
    if (discount > 0) { discRow.classList.remove('hidden'); if (g('cart-discount')) g('cart-discount').textContent = `-${formatPrice(discount)}`; }
    else discRow.classList.add('hidden');
  }
  updateNPRAmounts();
}

/* ============================================================
   COUPON
   ============================================================ */
async function applyCoupon() {
  const code = document.getElementById('coupon-input').value.trim();
  const msgEl = document.getElementById('coupon-msg');
  if (!code) { msgEl.textContent = 'Enter a coupon code.'; msgEl.style.color = 'var(--danger)'; return; }

  const { subtotal } = calcCartTotals();
  try {
    const data = await apiRequest('/coupons/validate', { method: 'POST', body: JSON.stringify({ code, orderAmount: subtotal }) });
    state.coupon = { code, discount: data.discount };
    msgEl.textContent = `✓ ${data.coupon.description} — Saving $${data.discount.toFixed(2)}`;
    msgEl.style.color = 'var(--success)';
    renderCartItems();
    toast(`Coupon applied! Saving $${data.discount.toFixed(2)}`, 'success');
  } catch {
    const demoCoupons = { 'WELCOME10': { type: 'pct', val: 0.10 }, 'SUMMER25': { type: 'pct', val: 0.25, max: 50 }, 'SAVE20': { type: 'fixed', val: 20, min: 100 } };
    const codeUpper = code.toUpperCase();
    const c = demoCoupons[codeUpper];
    if (c && subtotal >= (c.min || 0)) {
      const discount = c.type === 'pct' ? Math.min(subtotal * c.val, c.max || Infinity) : Math.min(c.val, subtotal);
      state.coupon = { code: codeUpper, discount };
      msgEl.textContent = `✓ Coupon applied — Saving $${discount.toFixed(2)}`;
      msgEl.style.color = 'var(--success)';
      renderCartItems();
      toast(`Coupon applied! Saving $${discount.toFixed(2)}`, 'success');
    } else {
      state.coupon = null;
      msgEl.textContent = c ? `Minimum order $${c.min} required.` : 'Invalid coupon code.';
      msgEl.style.color = 'var(--danger)';
    }
  }
}

/* ============================================================
   WISHLIST
   ============================================================ */
async function toggleWishlist(productId) {
  const idx = state.wishlist.indexOf(productId);
  if (idx === -1) { state.wishlist.push(productId); toast('Added to wishlist!', 'success'); }
  else { state.wishlist.splice(idx, 1); toast('Removed from wishlist.', 'info'); }
  saveLocal(); updateWishlistUI(); renderProducts(state.products); renderWishlistItems();
  if (state.token) { try { await apiRequest(`/products/${productId}/wishlist`, { method: 'PUT' }); } catch {} }
}

function updateWishlistUI() {
  const count = state.wishlist.length;
  ['wishlist-count', 'wishlist-drawer-count', 'mbn-wish-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  });
}

function renderWishlistItems() {
  const body = document.getElementById('wishlist-items');
  const empty = document.getElementById('wishlist-empty');
  const allProds = [...state.products, ...getDemoProducts()];

  if (!state.wishlist.length) {
    if (body) { body.innerHTML = ''; if (empty) body.appendChild(empty); }
    return;
  }
  const items = state.wishlist.map(id => allProds.find(p => p._id === id)).filter(Boolean);
  if (body) body.innerHTML = items.map(p => `
    <div class="cart-item">
      <div class="cart-item-img"><img src="${p.images?.[0] || 'https://via.placeholder.com/80'}" alt="${esc(p.title)}" /></div>
      <div class="cart-item-info">
        <p class="cart-item-title">${esc(p.title)}</p>
        <p class="cart-item-price">$${p.price.toFixed(2)}</p>
        <div class="cart-item-controls">
          <button class="card-add-btn" onclick="app.addToCart('${p._id}')" ${p.stock === 0 ? 'disabled' : ''}>${p.stock > 0 ? '<i class="fas fa-shopping-bag"></i> Add to Cart' : 'Out of Stock'}</button>
          <button class="remove-item" onclick="app.toggleWishlist('${p._id}')" aria-label="Remove"><i class="fas fa-heart-broken"></i></button>
        </div>
      </div>
    </div>`).join('');
}

/* ============================================================
   PRODUCT DETAIL MODAL
   ============================================================ */
async function openProductModal(productId) {
  const allProds = [...state.products, ...getDemoProducts()];
  let product = allProds.find(p => p._id === productId);
  try {
    if (!product || !product.description) product = await apiRequest(`/products/${productId}`);
  } catch {}
  if (!product) return;
  state.currentProduct = product;
  trackRecentlyViewed(product);
  trackInterest(product.category);
  renderYouMayLike(product);

  const discount = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  const stockStatus = product.stock === 0 ? 'out-of-stock' : product.stock <= 5 ? 'low-stock' : 'in-stock';
  const stockText = product.stock === 0 ? 'Out of Stock' : product.stock <= 5 ? `Only ${product.stock} left!` : 'In Stock';
  const images = product.images?.length ? product.images : ['https://via.placeholder.com/500'];

  const g = id => document.getElementById(id);
  if (g('gallery-main-img')) g('gallery-main-img').src = images[0];
  if (g('gallery-badge')) { g('gallery-badge').textContent = discount >= 10 ? `-${discount}%` : ''; g('gallery-badge').classList.toggle('hidden', discount < 10); }
  if (g('gallery-thumbs')) g('gallery-thumbs').innerHTML = images.map((img, i) =>
    `<div class="gallery-thumb ${i === 0 ? 'active' : ''}" onclick="document.getElementById('gallery-main-img').src='${img}';document.querySelectorAll('.gallery-thumb').forEach(t=>t.classList.remove('active'));this.classList.add('active')"><img src="${img}" alt="" /></div>`
  ).join('');

  if (g('modal-category')) g('modal-category').textContent = product.category;
  if (g('modal-title')) g('modal-title').textContent = product.title;
  if (g('modal-stars')) g('modal-stars').innerHTML = starsHTML(product.rating || 0);
  if (g('modal-reviews-count')) g('modal-reviews-count').textContent = `${product.numReviews || 0} reviews`;
  if (g('modal-stock')) { g('modal-stock').textContent = stockText; g('modal-stock').className = `stock-pill ${stockStatus}`; }
  if (g('modal-price')) g('modal-price').textContent = formatPrice(product.price);
  if (g('modal-original-price')) g('modal-original-price').textContent = product.originalPrice ? formatPrice(product.originalPrice) : '';
  if (g('modal-discount-badge')) { g('modal-discount-badge').textContent = discount >= 10 ? `-${discount}%` : ''; g('modal-discount-badge').classList.toggle('hidden', discount < 10); }
  if (g('modal-desc')) g('modal-desc').textContent = product.description || 'Premium quality product.';
  if (g('modal-seller')) g('modal-seller').textContent = product.sellerName || 'Suraj Boutique';
  if (g('modal-qty')) { g('modal-qty').value = 1; g('modal-qty').max = product.stock; }

  const wishBtn = g('modal-wishlist');
  if (wishBtn) {
    const isWished = state.wishlist.includes(productId);
    wishBtn.innerHTML = `<i class="fa${isWished ? 's' : 'r'} fa-heart"></i>`;
    wishBtn.style.color = isWished ? 'var(--pink)' : '';
  }

  if (g('review-product-id')) g('review-product-id').value = productId;
  app._currentId = productId;
  // Check price drop alert state
  const alerts = JSON.parse(localStorage.getItem('sch-price-alerts') || '[]');
  const pdBtn = g('price-drop-btn');
  if (pdBtn) {
    const isSet = alerts.includes(productId);
    pdBtn.classList.toggle('active', isSet);
    pdBtn.innerHTML = isSet ? '<i class="fas fa-bell-slash"></i> Alert set ✓' : '<i class="fas fa-bell"></i> Notify me if price drops';
  }
  // Back in stock section
  const bisSection = g('back-in-stock-section');
  if (bisSection) bisSection.classList.toggle('hidden', product.stock > 0);
  // Variants
  renderVariants(product.category);
  // Sticky bar
  updateStickyBar(product);
  loadReviews(productId);
  openModal('product-modal');
  setTimeout(initImageMagnifier, 100);
}

async function loadReviews(productId) {
  const container = document.getElementById('modal-reviews-list');
  if (!container) return;
  container.innerHTML = '<div class="reviews-loading">Loading reviews...</div>';
  try {
    const data = await apiRequest(`/reviews/product/${productId}`);
    if (!data.reviews?.length) { container.innerHTML = '<p style="color:var(--text-3);font-size:13px;padding:10px 0">No reviews yet. Be the first!</p>'; return; }
    container.innerHTML = data.reviews.slice(0, 3).map(r => `
      <div class="review-card">
        <div class="review-header">
          <img class="review-avatar" src="${r.userAvatar || 'https://i.pravatar.cc/36'}" alt="${esc(r.userName)}" />
          <div class="review-meta">
            <div class="review-name">${esc(r.userName)} ${r.isVerifiedPurchase ? '<span class="review-verified">✓ Verified</span>' : ''}</div>
            <div class="review-date">${new Date(r.createdAt).toLocaleDateString()}</div>
          </div>
          <div class="review-stars">${'★'.repeat(r.rating)}</div>
        </div>
        <div class="review-title">${esc(r.title)}</div>
        <div class="review-body">${esc(r.body)}</div>
      </div>`).join('');
  } catch {
    container.innerHTML = '<p style="color:var(--text-3);font-size:13px;padding:10px 0">Connect to backend to see reviews.</p>';
  }
}

/* ============================================================
   AUTH
   ============================================================ */
/* ── DEMO ACCOUNTS (work offline, no backend needed) ── */
const DEMO_ACCOUNTS = [
  {
    _id: 'admin_001',
    name: 'Suraj Admin',
    email: 'admin@surajcommerce.com',
    password: 'Admin@1234',
    role: 'admin',
    token: 'demo-admin-token-suraj',
    avatar: '',
    phone: '9801234567',
    address: 'Kathmandu, Nepal',
  },
  {
    _id: 'seller_001',
    name: 'Suraj Seller',
    email: 'seller@surajcommerce.com',
    password: 'Seller@1234',
    role: 'seller',
    token: 'demo-seller-token-suraj',
    avatar: '',
    phone: '9807654321',
    address: 'Pokhara, Nepal',
  },
];

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Signing in...';

  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;

  // Check demo accounts first (works fully offline)
  const demo = DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === email && a.password === password);
  if (demo) {
    const { password: _pw, ...userData } = demo;
    state.user = userData; state.token = userData.token;
    saveLocal(); closeModal('auth-modal'); updateAuthUI();
    toast(`Welcome back, ${userData.name}! ${userData.role === 'admin' ? '👑' : '🛍️'}`, 'success');
    btn.disabled = false; btn.textContent = 'SIGN IN';
    return;
  }

  try {
    const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.email.value, password }) });
    state.user = data; state.token = data.token;
    saveLocal(); closeModal('auth-modal'); updateAuthUI();
    toast(`Welcome back, ${data.name}!`, 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'SIGN IN'; }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creating account...';
  try {
    const data = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ name: form.name.value, email: form.email.value, password: form.password.value, role: form.role.value }) });
    state.user = data; state.token = data.token;
    saveLocal(); closeModal('auth-modal'); updateAuthUI();
    toast(`Welcome, ${data.name}! 🎉`, 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'CREATE ACCOUNT'; }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  try {
    await apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: e.target.email.value }) });
    toast('Password reset email sent!', 'success');
    closeModal('auth-modal');
  } catch (err) { toast(err.message, 'error'); }
}

function logout() {
  clearAuth(); state.wishlist = [];
  updateAuthUI(); updateWishlistUI();
  closeModal('account-modal');
  toast('You have been logged out.', 'info');
}

function updateAuthUI() {
  const label = document.getElementById('nav-user-label');
  const loginBtn = document.getElementById('btn-login-nav');
  if (state.user) {
    if (label) label.textContent = state.user.name.split(' ')[0];
    if (loginBtn) loginBtn.onclick = () => openAccountModal();
  } else {
    if (label) label.textContent = 'Login';
    if (loginBtn) loginBtn.onclick = () => openModal('auth-modal');
  }
}

/* ============================================================
   SEPARATE DASHBOARDS
   ============================================================ */
function openDashboard(id) {
  document.querySelectorAll('.dashboard-overlay').forEach(d => d.classList.remove('open'));
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDashboard(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  document.body.style.overflow = '';
}

function initDashboardNav(dashId) {
  const dash = document.getElementById(dashId);
  if (!dash) return;
  dash.querySelectorAll('.dash-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      dash.querySelectorAll('.dash-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const paneId = btn.dataset.pane;
      dash.querySelectorAll('.dash-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById(paneId);
      if (pane) pane.classList.add('active');
    });
  });
}

async function openAccountModal() {
  if (!state.user) { openModal('auth-modal'); return; }
  const role = state.user.role;
  const g = id => document.getElementById(id);

  if (role === 'admin') {
    openDashboard('admin-dashboard');
    if (g('a-sidebar-name')) g('a-sidebar-name').textContent = state.user.name.split(' ')[0];
    if (g('a-greeting')) g('a-greeting').textContent = `Good day, ${state.user.name.split(' ')[0]} 👑`;
    loadAdminStats();
    loadAdminDashboardProducts();
    renderAdminAnalytics();
    renderAdminUsers();
    renderAdminOrders();
  } else if (role === 'seller') {
    openDashboard('seller-dashboard');
    if (g('s-sidebar-name')) g('s-sidebar-name').textContent = state.user.name.split(' ')[0];
    if (g('s-greeting')) g('s-greeting').textContent = `Welcome back, ${state.user.name.split(' ')[0]}!`;
    if (g('profile-name')) g('profile-name').value = state.user.name;
    if (g('profile-email')) g('profile-email').value = state.user.email;
    loadSellerDashboard();
    loadSellerProducts();
  } else {
    openDashboard('user-dashboard');
    if (g('profile-name')) g('profile-name').value = state.user.name;
    if (g('profile-email')) g('profile-email').value = state.user.email;
    if (g('profile-name-display')) g('profile-name-display').textContent = state.user.name;
    if (g('u-sidebar-name')) g('u-sidebar-name').textContent = state.user.name.split(' ')[0];
    const initials = state.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
    if (g('u-avatar-circle')) g('u-avatar-circle').textContent = initials;
    const badge = g('profile-role-badge');
    if (badge) badge.textContent = role || 'Customer';
    loadOrders();
    renderUserWishlist();
  }
}

async function loadOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;
  try {
    const orders = await apiRequest('/orders/myorders');
    if (!orders.length) { container.innerHTML = '<p style="color:var(--text-3)">No orders yet.</p>'; return; }
    container.innerHTML = orders.map(o => `
      <div class="order-row">
        <div><strong>${o.orderNumber}</strong><div style="font-size:11px;color:var(--text-3)">${new Date(o.createdAt).toLocaleDateString()}</div></div>
        <span>${o.items?.length || 0} item(s)</span>
        <span class="status-pill ${o.status}">$${o.total?.toFixed(2)}</span>
        <span class="status-pill ${o.status}">${o.status}</span>
      </div>`).join('');
  } catch { container.innerHTML = '<p style="color:var(--text-3)">Connect to backend to view orders.</p>'; }
}

async function loadAdminStats() {
  const g = id => document.getElementById(id);
  const products = getDemoProducts();
  // Demo stats from local data
  const totalProducts = products.length;
  const lowStock = products.filter(p => p.stock <= 5).length;
  const revenue = products.reduce((s, p) => s + p.price * Math.floor(Math.random() * 10 + 2), 0);
  if (g('stat-revenue')) g('stat-revenue').textContent = '$' + Math.round(revenue).toLocaleString();
  if (g('stat-orders')) g('stat-orders').textContent = Math.floor(Math.random() * 200 + 80);
  if (g('stat-pending')) g('stat-pending').textContent = Math.floor(Math.random() * 20 + 5);
  if (g('stat-customers')) g('stat-customers').textContent = Math.floor(Math.random() * 500 + 120);
  if (g('stat-lowstock')) g('stat-lowstock').textContent = lowStock;
  if (g('a-total-products')) g('a-total-products').textContent = totalProducts;
  // Recent orders demo
  const recentOrders = document.getElementById('a-recent-orders');
  if (recentOrders) {
    const names = ['Sita Sharma','Ram Bahadur','Anita KC','Bikash Thapa','Priya Maharjan'];
    recentOrders.innerHTML = Array.from({length:5},(_,i)=>`
      <div class="a-order-row">
        <span class="a-order-id">ORD-${10045+i}</span>
        <span class="a-order-customer">${names[i]}</span>
        <span class="status-pill processing">${['Processing','Shipped','Pending','Delivered','Processing'][i]}</span>
        <span class="a-order-amount">$${(Math.random()*200+30).toFixed(2)}</span>
      </div>`).join('');
  }
  // Top products
  const topProds = document.getElementById('a-top-products');
  if (topProds) {
    const top = products.filter(p=>p.isFeatured).slice(0,5);
    topProds.innerHTML = `<div class="a-top-list">${top.map(p=>`
      <div class="a-top-row">
        <img src="${p.images?.[0]||''}" alt="${esc(p.title)}" />
        <div class="a-top-info"><strong>${esc(p.title)}</strong><small>${p.category}</small></div>
        <span class="a-top-rev">$${(p.price*(p.numReviews||10)*0.3).toFixed(0)}</span>
      </div>`).join('')}</div>`;
  }
  try {
    const stats = await apiRequest('/orders/admin/stats');
    if (g('stat-revenue')) g('stat-revenue').textContent = `$${Math.round(stats.revenue||0).toLocaleString()}`;
    if (g('stat-orders')) g('stat-orders').textContent = stats.totalOrders||0;
    if (g('stat-pending')) g('stat-pending').textContent = stats.pending||0;
    if (g('stat-customers')) g('stat-customers').textContent = stats.customers||0;
  } catch {}
}

async function loadAdminDashboardProducts() {
  const container = document.getElementById('admin-products-list');
  if (!container) return;
  let products = getDemoProducts();
  // Filter support
  const search = document.getElementById('a-product-search')?.value?.toLowerCase() || '';
  const cat = document.getElementById('a-product-cat-filter')?.value || '';
  if (search) products = products.filter(p => p.title.toLowerCase().includes(search));
  if (cat) products = products.filter(p => p.category === cat);
  container.innerHTML = products.slice(0, 50).map(p => `
    <div class="a-product-row">
      <img src="${p.images?.[0]||''}" alt="${esc(p.title)}" loading="lazy"/>
      <div class="a-product-info">
        <strong>${esc(p.title)}</strong>
        <small>${esc(p.category)} &nbsp;·&nbsp; $${p.price} &nbsp;·&nbsp; Stock: ${p.stock} &nbsp;·&nbsp; ⭐${p.rating}</small>
      </div>
      <div class="a-product-actions">
        <button class="a-btn-edit" onclick="app.openEditProduct('${p._id}')"><i class="fas fa-pen"></i> Edit</button>
        <button class="a-btn-del" onclick="app.deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
  try {
    const { products: apiProds } = await apiRequest('/products?limit=50');
    container.innerHTML = apiProds.map(p => `
      <div class="a-product-row">
        <img src="${p.images?.[0]||''}" alt="${esc(p.title)}" loading="lazy"/>
        <div class="a-product-info">
          <strong>${esc(p.title)}</strong>
          <small>${esc(p.category)} · $${p.price} · Stock: ${p.stock}</small>
        </div>
        <div class="a-product-actions">
          <button class="a-btn-edit" onclick="app.openEditProduct('${p._id}')"><i class="fas fa-pen"></i> Edit</button>
          <button class="a-btn-del" onclick="app.deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('');
  } catch {}
}

function renderAdminAnalytics() {
  const catChart = document.getElementById('a-cat-chart');
  const payChart = document.getElementById('a-pay-chart');
  const products = getDemoProducts();
  const cats = {};
  products.forEach(p => { cats[p.category] = (cats[p.category]||0)+1; });
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = sorted[0]?.[1] || 1;
  if (catChart) catChart.innerHTML = sorted.map(([cat,cnt])=>`
    <div class="a-bar-row">
      <span class="a-bar-label">${cat.split(' ')[0]}</span>
      <div class="a-bar-track"><div class="a-bar-fill" style="width:${Math.round(cnt/max*100)}%"></div></div>
      <span class="a-bar-val">${cnt}</span>
    </div>`).join('');
  const pays = [['eSewa',42],['Khalti',28],['Nepali QR',18],['COD',9],['ConnectIPS',3]];
  const maxP = 42;
  if (payChart) payChart.innerHTML = pays.map(([name,pct])=>`
    <div class="a-bar-row">
      <span class="a-bar-label">${name}</span>
      <div class="a-bar-track"><div class="a-bar-fill" style="width:${pct/maxP*100}%;background:${['#60bb46','#5c2d91','#e2231a','#f57c00','#003e7e'][pays.indexOf(pays.find(p=>p[0]===name))]}"></div></div>
      <span class="a-bar-val">${pct}%</span>
    </div>`).join('');
}

function renderAdminUsers() {
  const container = document.getElementById('a-users-list');
  if (!container) return;
  const demoUsers = [
    {name:'Suraj Admin',email:'admin@surajcommerce.com',role:'admin',orders:0},
    {name:'Suraj Seller',email:'seller@surajcommerce.com',role:'seller',orders:24},
    {name:'Anita Sharma',email:'anita@gmail.com',role:'customer',orders:7},
    {name:'Bikash Thapa',email:'bikash@gmail.com',role:'customer',orders:3},
    {name:'Sita KC',email:'sita@gmail.com',role:'customer',orders:12},
    {name:'Ram Bahadur',email:'ram@gmail.com',role:'customer',orders:5},
  ];
  container.innerHTML = demoUsers.map(u=>`
    <div class="a-user-row">
      <div class="a-user-avatar">${u.name[0].toUpperCase()}</div>
      <div class="a-user-info"><strong>${esc(u.name)}</strong><small>${esc(u.email)} · ${u.orders} orders</small></div>
      <span class="a-user-role ${u.role}">${u.role}</span>
    </div>`).join('');
}

function renderAdminOrders() {
  const container = document.getElementById('a-orders-list');
  if (!container) return;
  const statuses = ['delivered','processing','pending','shipped','cancelled','delivered','processing'];
  const names = ['Sita Sharma','Ram Bahadur','Anita KC','Bikash Thapa','Priya Maharjan','Suresh Dai','Maya Gurung'];
  container.innerHTML = Array.from({length:7},(_,i)=>`
    <div class="a-order-row">
      <span class="a-order-id">ORD-${10040+i}</span>
      <span class="a-order-customer">${names[i]}</span>
      <span class="status-pill ${statuses[i]}">${statuses[i]}</span>
      <span class="a-order-amount">$${(Math.random()*300+40).toFixed(2)}</span>
    </div>`).join('');
}

async function loadSellerDashboard() {
  const g = id => document.getElementById(id);
  const products = getDemoProducts().filter(p => p.sellerName === state.user?.name || ['Suraj Boutique','Urban Threads'].includes(p.sellerName));
  const myProds = products.length;
  const revenue = products.reduce((s,p)=>s+p.price*(p.numReviews||5)*0.2,0);
  if (g('seller-revenue')) g('seller-revenue').textContent = '$'+Math.round(revenue).toLocaleString();
  if (g('seller-products')) g('seller-products').textContent = myProds;
  if (g('seller-orders')) g('seller-orders').textContent = Math.floor(Math.random()*80+20);
  if (g('s-earn-total')) g('s-earn-total').textContent = '$'+Math.round(revenue).toLocaleString();
  if (g('s-earn-month')) g('s-earn-month').textContent = '$'+Math.round(revenue*0.12).toLocaleString();
  if (g('s-earn-pending')) g('s-earn-pending').textContent = '$'+Math.round(revenue*0.05).toLocaleString();
  if (g('s-earn-fee')) g('s-earn-fee').textContent = '$'+Math.round(revenue*0.1).toLocaleString();
  // Recent sales
  const recent = document.getElementById('s-recent-sales');
  if (recent) {
    const names=['Anita','Bikash','Sita','Ram','Maya'];
    recent.innerHTML = Array.from({length:5},(_,i)=>`
      <div class="a-order-row">
        <span class="a-order-id">ORD-${20010+i}</span>
        <span class="a-order-customer">${names[i]}</span>
        <span class="status-pill ${['delivered','processing','shipped','pending','delivered'][i]}">${['Delivered','Processing','Shipped','Pending','Delivered'][i]}</span>
        <span class="a-order-amount">$${(Math.random()*150+20).toFixed(2)}</span>
      </div>`).join('');
  }
  try {
    const stats = await apiRequest('/users/seller/dashboard');
    if (g('seller-revenue')) g('seller-revenue').textContent = `$${Math.round(stats.revenue||0).toLocaleString()}`;
    if (g('seller-products')) g('seller-products').textContent = stats.totalProducts||0;
    if (g('seller-orders')) g('seller-orders').textContent = stats.totalOrders||0;
  } catch {}
}

async function loadSellerProducts() {
  const container = document.getElementById('seller-products-list');
  if (!container) return;
  const products = getDemoProducts().slice(0, 30);
  container.innerHTML = products.map(p=>`
    <div class="a-product-row">
      <img src="${p.images?.[0]||''}" alt="${esc(p.title)}" loading="lazy"/>
      <div class="a-product-info">
        <strong>${esc(p.title)}</strong>
        <small>${esc(p.category)} · $${p.price} · Stock: ${p.stock}</small>
      </div>
      <div class="a-product-actions">
        <button class="a-btn-edit" onclick="app.openEditProduct('${p._id}')"><i class="fas fa-pen"></i> Edit</button>
        <button class="a-btn-del" onclick="app.deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

function renderUserWishlist() {
  const container = document.getElementById('u-wishlist-grid');
  if (!container) return;
  if (!state.wishlist.length) { container.innerHTML = '<p class="dash-empty">Your wishlist is empty.</p>'; return; }
  container.innerHTML = state.wishlist.map(p=>`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;cursor:pointer" onclick="app.openProductModal('${p._id}')">
      <img src="${p.images?.[0]||''}" style="width:100%;height:120px;object-fit:cover" loading="lazy"/>
      <div style="padding:8px">
        <p style="font-size:11px;font-weight:700;margin:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</p>
        <p style="font-size:12px;color:var(--pink);font-weight:800;margin:0">$${p.price}</p>
      </div>
    </div>`).join('');
}

async function handleProfileSave(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const data = await apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify({ name: form.name.value, phone: form.phone?.value, currentPassword: form.currentPassword?.value, newPassword: form.newPassword?.value }) });
    state.user = { ...state.user, ...data }; state.token = data.token;
    saveLocal(); updateAuthUI();
    toast('Profile updated!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

/* ============================================================
   PRODUCT FORM (Admin / Seller)
   ============================================================ */
async function handleProductForm(e) {
  e.preventDefault();
  const productId = document.getElementById('product-form-id').value;
  const imageUrl = document.getElementById('pf-image-url').value;
  const payload = {
    title: document.getElementById('pf-title').value,
    description: document.getElementById('pf-desc').value,
    category: document.getElementById('pf-category').value,
    price: parseFloat(document.getElementById('pf-price').value),
    originalPrice: parseFloat(document.getElementById('pf-original-price').value) || undefined,
    stock: parseInt(document.getElementById('pf-stock').value),
    isFeatured: document.getElementById('pf-featured').checked,
    tags: document.getElementById('pf-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    images: imageUrl ? [imageUrl] : [],
  };
  try {
    if (productId) { await apiRequest(`/products/${productId}`, { method: 'PUT', body: JSON.stringify(payload) }); toast('Product updated!', 'success'); }
    else { await apiRequest('/products', { method: 'POST', body: JSON.stringify(payload) }); toast('Product added!', 'success'); }
    closeModal('product-form-modal');
    fetchProducts(); loadAdminProducts();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteProduct(productId) {
  if (!confirm('Delete this product?')) return;
  try { await apiRequest(`/products/${productId}`, { method: 'DELETE' }); toast('Product deleted.', 'info'); fetchProducts(); loadAdminProducts(); }
  catch (err) { toast(err.message, 'error'); }
}

function openEditProduct(productId) {
  const p = state.products.find(x => x._id === productId);
  if (!p) return;
  const g = id => document.getElementById(id);
  if (g('product-form-id')) g('product-form-id').value = productId;
  if (g('product-form-title')) g('product-form-title').textContent = 'Edit Product';
  if (g('pf-title')) g('pf-title').value = p.title;
  if (g('pf-desc')) g('pf-desc').value = p.description || '';
  if (g('pf-category')) g('pf-category').value = p.category;
  if (g('pf-price')) g('pf-price').value = p.price;
  if (g('pf-original-price')) g('pf-original-price').value = p.originalPrice || '';
  if (g('pf-stock')) g('pf-stock').value = p.stock;
  if (g('pf-image-url')) g('pf-image-url').value = p.images?.[0] || '';
  if (g('pf-featured')) g('pf-featured').checked = p.isFeatured || false;
  if (g('product-form-submit')) g('product-form-submit').textContent = 'Update Product';
  openModal('product-form-modal');
}

/* ============================================================
   CHECKOUT
   ============================================================ */
function openCheckout() {
  if (!state.cart.length) { toast('Your cart is empty.', 'error'); return; }
  closeCart();
  goToCheckoutStep(1);
  openModal('checkout-modal');
  try {
    if (!stripe) stripe = Stripe(STRIPE_PK);
    const elements = stripe.elements();
    cardElement = elements.create('card', { style: { base: { fontSize: '15px', color: '#1a1a1a' } } });
    cardElement.mount('#stripe-card-element');
  } catch {}
}

function goToCheckoutStep(step) {
  document.querySelectorAll('.cstep-pane').forEach((s, i) => s.classList.toggle('active', i + 1 === step));
  // Show correct pane by ID
  ['shipping-form', 'payment-step', 'confirm-step'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) { el.classList.toggle('active', i + 1 === step); el.classList.toggle('hidden', i + 1 !== step); }
  });
  document.querySelectorAll('.cstep').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === step);
    s.classList.toggle('done', i + 1 < step);
  });
  if (step === 2) renderCheckoutSummary();
}

function renderCheckoutSummary() {
  const { subtotal, shipping, discount, tax, total } = calcCartTotals();
  const items = state.cart.map(i => `<div class="summary-item"><span>${esc(i.title)} ×${i.quantity}</span><span>${formatPrice(i.price * i.quantity)}</span></div>`).join('');
  const el = document.getElementById('checkout-summary');
  if (el) el.innerHTML = `${items}
    <div class="summary-item" style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px"><span>Shipping</span><span>${shipping === 0 ? 'FREE' : formatPrice(shipping)}</span></div>
    ${discount > 0 ? `<div class="summary-item"><span>Discount</span><span style="color:var(--success)">-${formatPrice(discount)}</span></div>` : ''}
    <div class="summary-item"><span>Tax (13% VAT)</span><span>${formatPrice(tax)}</span></div>
    <div class="summary-item" style="font-weight:700"><span>Total</span><span style="color:var(--pink)">${formatPrice(total)}</span></div>`;
  const pa = document.getElementById('pay-amount');
  if (pa) pa.textContent = formatPrice(total);
  updateNPRAmounts();
}

async function handleShippingForm(e) {
  e.preventDefault();
  const form = e.target;
  state.shippingInfo = { fullName: form.fullName.value, email: form.email.value, phone: form.phone.value, street: form.street.value, city: form.city.value, state: form.state.value, postalCode: form.postalCode.value, country: form.country.value };
  goToCheckoutStep(2);
}

async function handlePayment() {
  // NPR: validate payment method input before processing
  if (getCurrency() === 'NPR') {
    const method = document.querySelector('input[name="npr-payment"]:checked')?.value || 'cod';
    if (method === 'esewa') {
      const id = document.getElementById('esewa-id')?.value.trim();
      if (!id) { toast('Please enter your eSewa ID.', 'error'); return; }
    } else if (method === 'khalti') {
      const id = document.getElementById('khalti-id')?.value.trim();
      if (!id) { toast('Please enter your Khalti ID.', 'error'); return; }
    } else if (method === 'fonepay') {
      const ref = document.getElementById('fonepay-ref')?.value.trim();
      if (!ref) { toast('Please enter the transaction reference ID after QR payment.', 'error'); return; }
    } else if (method === 'imepay') {
      const id = document.getElementById('imepay-id')?.value.trim();
      if (!id) { toast('Please enter your IME Pay number.', 'error'); return; }
    } else if (method === 'connectips') {
      const ref = document.getElementById('cips-ref')?.value.trim();
      if (!ref) { toast('Please enter transaction reference number.', 'error'); return; }
    }
    state.paymentMethod = method;
    // Simulate NPR payment success (integrate real eSewa/Khalti SDK here)
    const demoOrder = { orderNumber: 'ORD-NP-' + Math.floor(Math.random() * 90000 + 10000) };
    state.cart = []; state.coupon = null; saveLocal(); updateCartUI(); renderCartItems();
    showOrderConfirmation(demoOrder); goToCheckoutStep(3);
    launchConfetti();
    const labels = { esewa: 'eSewa', khalti: 'Khalti', connectips: 'ConnectIPS', cod: 'Cash on Delivery' };
    toast(`🎉 Order placed via ${labels[method]}!`, 'success', 6000);
    return;
  }

  const btn = document.getElementById('btn-pay');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }
  const errorEl = document.getElementById('stripe-error');
  if (errorEl) errorEl.classList.add('hidden');

  try {
    const { total } = calcCartTotals();
    const order = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({ items: state.cart.map(i => ({ product: i._id, quantity: i.quantity })), shipping: state.shippingInfo, couponCode: state.coupon?.code }),
    }).catch(() => ({ _id: 'demo-' + Date.now(), orderNumber: 'ORD-' + Math.floor(Math.random() * 90000 + 10000) }));

    currentOrderId = order._id;
    if (stripe && cardElement) {
      const { clientSecret } = await apiRequest('/payments/create-intent', { method: 'POST', body: JSON.stringify({ amount: total, orderId: order._id }) }).catch(() => ({ clientSecret: null }));
      if (clientSecret) {
        const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, billing_details: { name: state.shippingInfo?.fullName } } });
        if (result.error) {
          if (errorEl) { errorEl.textContent = result.error.message; errorEl.classList.remove('hidden'); }
          if (btn) { btn.disabled = false; btn.textContent = 'PAY'; }
          return;
        }
        await apiRequest('/payments/confirm', { method: 'POST', body: JSON.stringify({ orderId: order._id, paymentIntentId: result.paymentIntent.id }) }).catch(() => {});
      }
    }
    state.cart = []; state.coupon = null; saveLocal(); updateCartUI(); renderCartItems();
    showOrderConfirmation(order); goToCheckoutStep(3);
    launchConfetti();
    toast('🎉 Order placed successfully!', 'success', 6000);
  } catch {
    const demoOrder = { orderNumber: 'ORD-' + Math.floor(Math.random() * 90000 + 10000) };
    state.cart = []; state.coupon = null; saveLocal(); updateCartUI(); renderCartItems();
    showOrderConfirmation(demoOrder); goToCheckoutStep(3);
    launchConfetti();
    toast('🎉 Order placed! (Demo mode)', 'success', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'PAY'; }
  }
}

function showOrderConfirmation(order) {
  const g = id => document.getElementById(id);
  const methodLabels = { esewa:'eSewa Wallet', khalti:'Khalti Wallet', fonepay:'Nepali QR (FonePay)', imepay:'IME Pay', connectips:'ConnectIPS', cod:'Cash on Delivery', card:'Credit / Debit Card' };
  const method = methodLabels[state.paymentMethod || 'card'] || state.paymentMethod || 'Card';
  if (g('confirm-order-number')) g('confirm-order-number').textContent = `Order #${order.orderNumber}`;
  if (g('confirm-details')) g('confirm-details').innerHTML = `
    <p><strong>Shipping to:</strong> ${state.shippingInfo?.fullName || 'Customer'}</p>
    <p>${state.shippingInfo?.street || ''}, ${state.shippingInfo?.city || ''}</p>
    <p><strong>Payment:</strong> ${method}</p>
    <p><strong>Estimated delivery:</strong> 3–5 business days</p>`;
}

/* ============================================================
   REVIEWS
   ============================================================ */
async function handleReviewSubmit(e) {
  e.preventDefault();
  if (!state.user) { toast('Please login to write a review.', 'error'); openModal('auth-modal'); return; }
  const rating = parseInt(document.getElementById('review-rating').value);
  if (!rating) { toast('Please select a star rating.', 'error'); return; }
  try {
    await apiRequest('/reviews', { method: 'POST', body: JSON.stringify({ product: document.getElementById('review-product-id').value, rating, title: document.getElementById('review-title').value, body: document.getElementById('review-body').value }) });
    closeModal('review-modal');
    toast('Review submitted!', 'success');
    loadReviews(document.getElementById('review-product-id').value);
  } catch (err) { toast(err.message, 'error'); }
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.getElementById('backdrop').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (!document.querySelector('.modal.open')) document.getElementById('backdrop').classList.remove('active');
}

/* ============================================================
   DRAWER HELPERS
   ============================================================ */
function openCart() {
  renderCartItems();
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('backdrop').classList.add('active');
}

function closeCart() {
  document.getElementById('cart-drawer').classList.remove('open');
  if (!document.querySelector('.drawer.open, .modal.open')) document.getElementById('backdrop').classList.remove('active');
}

function openWishlist() {
  renderWishlistItems();
  document.getElementById('wishlist-drawer').classList.add('open');
  document.getElementById('backdrop').classList.add('active');
}

function closeWishlist() {
  document.getElementById('wishlist-drawer').classList.remove('open');
  if (!document.querySelector('.drawer.open, .modal.open')) document.getElementById('backdrop').classList.remove('active');
}

function closeCheckout() { closeModal('checkout-modal'); openCart(); }

/* ============================================================
   FILTER HELPERS
   ============================================================ */
function filterByCategory(cat) {
  state.filters.category = cat;
  state.pagination.page = 1;
  fetchProducts();
  updateCatPills();
  document.getElementById('shop-main')?.scrollIntoView({ behavior: 'smooth' });
}

function scrollToProducts() {
  document.getElementById('shop-main')?.scrollIntoView({ behavior: 'smooth' });
}

/* ============================================================
   ACCOUNT TABS
   ============================================================ */
function initAccountTabs() {
  document.querySelectorAll('.acc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.acc-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.acc-pane').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
      tab.classList.add('active');
      const pane = document.getElementById(`pane-${tab.dataset.tab}`);
      if (pane) { pane.classList.remove('hidden'); pane.classList.add('active'); }
    });
  });
}

/* ============================================================
   STAR RATING INPUT
   ============================================================ */
function initStarRating() {
  const buttons = document.querySelectorAll('#star-rating-input button');
  let selected = 0;
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', () => buttons.forEach((b, i) => b.classList.toggle('active', i <= parseInt(btn.dataset.val) - 1)));
    btn.addEventListener('mouseleave', () => buttons.forEach((b, i) => b.classList.toggle('active', i < selected)));
    btn.addEventListener('click', () => {
      selected = parseInt(btn.dataset.val);
      const rv = document.getElementById('review-rating');
      if (rv) rv.value = selected;
      buttons.forEach((b, i) => b.classList.toggle('active', i < selected));
    });
  });
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function initEvents() {
  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);

  // Cart / wishlist buttons in header
  on('btn-cart', 'click', openCart);
  on('btn-wishlist', 'click', openWishlist);
  on('btn-login-nav', 'click', () => state.user ? openAccountModal() : openModal('auth-modal'));

  // Hamburger → mobile sidebar
  on('hamburger', 'click', () => {
    document.getElementById('mobile-sidebar').classList.add('open');
    document.getElementById('backdrop').classList.add('active');
  });
  on('close-sidebar', 'click', () => {
    document.getElementById('mobile-sidebar').classList.remove('open');
    if (!document.querySelector('.modal.open, .drawer.open')) document.getElementById('backdrop').classList.remove('active');
  });

  // Backdrop closes all
  on('backdrop', 'click', () => {
    document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    document.getElementById('mobile-sidebar')?.classList.remove('open');
    document.getElementById('backdrop').classList.remove('active');
  });

  // Drawer close buttons
  on('close-cart', 'click', closeCart);
  on('close-wishlist', 'click', closeWishlist);

  // Modal close buttons
  on('close-auth', 'click', () => closeModal('auth-modal'));
  on('close-newsletter', 'click', () => closeModal('newsletter-modal'));
  on('close-product-modal', 'click', () => closeModal('product-modal'));
  on('close-review-modal', 'click', () => closeModal('review-modal'));
  on('close-checkout', 'click', () => closeModal('checkout-modal'));
  on('close-account', 'click', () => closeModal('account-modal'));
  on('close-user-dash', 'click', () => closeDashboard('user-dashboard'));
  on('close-admin-dash', 'click', () => closeDashboard('admin-dashboard'));
  on('close-seller-dash', 'click', () => closeDashboard('seller-dashboard'));
  // Close dashboard on overlay click (outside the panel)
  document.querySelectorAll('.dashboard-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDashboard(overlay.id); });
  });
  initDashboardNav('user-dashboard');
  initDashboardNav('admin-dashboard');
  initDashboardNav('seller-dashboard');
  // Search/filter in admin products
  ['a-product-search','a-product-cat-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', loadAdminDashboardProducts);
  });
  on('close-product-form', 'click', () => closeModal('product-form-modal'));

  // Auth forms
  on('login-form', 'submit', handleLogin);
  on('register-form', 'submit', handleRegister);
  on('forgot-form', 'submit', handleForgotPassword);

  // Auth tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById(`${tab.dataset.tab}-form`)?.classList.remove('hidden');
    });
  });
  document.querySelectorAll('[data-switch]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === btn.dataset.switch));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById(`${btn.dataset.switch}-form`)?.classList.remove('hidden');
    });
  });
  on('btn-forgot', 'click', () => {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
    document.getElementById('forgot-form')?.classList.remove('hidden');
  });

  // Toggle password
  document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling || btn.parentElement?.querySelector('input');
      if (!input) return;
      if (input.type === 'password') { input.type = 'text'; btn.querySelector('i').className = 'fas fa-eye-slash'; }
      else { input.type = 'password'; btn.querySelector('i').className = 'fas fa-eye'; }
    });
  });

  // Search
  on('search-form', 'submit', e => {
    e.preventDefault();
    state.filters.search = document.getElementById('search-input').value.trim();
    state.pagination.page = 1;
    fetchProducts();
    scrollToProducts();
  });

  // Sort
  on('sort-select', 'change', e => { state.filters.sort = e.target.value; fetchProducts(); });

  // Mobile filter toggle
  on('filter-toggle', 'click', () => {
    const panel = document.getElementById('filter-panel');
    panel?.classList.toggle('hidden');
  });

  // Apply filter
  on('btn-apply-filter', 'click', () => {
    state.filters.category = document.getElementById('fp-category')?.value || '';
    state.filters.minPrice = document.getElementById('fp-min')?.value || '';
    state.filters.maxPrice = document.getElementById('fp-max')?.value || '';
    state.pagination.page = 1;
    fetchProducts();
    document.getElementById('filter-panel')?.classList.add('hidden');
  });

  // Clear filters
  on('btn-clear-filters-2', 'click', () => {
    state.filters = { category: '', search: '', sort: 'featured', minPrice: '', maxPrice: '', rating: 0, inStockOnly: false };
    if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
    fetchProducts();
  });

  // Coupon
  on('btn-apply-coupon', 'click', applyCoupon);
  document.getElementById('coupon-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });

  // Checkout flow
  on('btn-checkout', 'click', openCheckout);
  on('shipping-form', 'submit', handleShippingForm);
  on('back-to-shipping', 'click', () => goToCheckoutStep(1));
  on('btn-pay', 'click', handlePayment);

  // Product modal qty
  on('modal-qty-minus', 'click', () => {
    const inp = document.getElementById('modal-qty');
    if (inp && parseInt(inp.value) > 1) inp.value = parseInt(inp.value) - 1;
  });
  on('modal-qty-plus', 'click', () => {
    const inp = document.getElementById('modal-qty');
    if (!inp) return;
    const max = parseInt(inp.max) || 99;
    if (parseInt(inp.value) < max) inp.value = parseInt(inp.value) + 1;
  });
  on('modal-add-cart', 'click', () => {
    if (!state.currentProduct) return;
    const qty = parseInt(document.getElementById('modal-qty')?.value) || 1;
    addToCart(state.currentProduct._id, qty);
    closeModal('product-modal'); openCart();
  });
  on('modal-wishlist', 'click', () => {
    if (!state.currentProduct) return;
    toggleWishlist(state.currentProduct._id);
    const isWished = state.wishlist.includes(state.currentProduct._id);
    const btn = document.getElementById('modal-wishlist');
    if (btn) { btn.innerHTML = `<i class="fa${isWished ? 's' : 'r'} fa-heart"></i>`; btn.style.color = isWished ? 'var(--pink)' : ''; }
  });
  on('modal-write-review', 'click', () => {
    if (!state.user) { toast('Please login to write a review.', 'error'); openModal('auth-modal'); return; }
    closeModal('product-modal'); openModal('review-modal');
  });

  // Review form
  on('review-form', 'submit', handleReviewSubmit);

  // Profile
  on('profile-form', 'submit', handleProfileSave);
  on('btn-logout', 'click', () => { logout(); closeDashboard('user-dashboard'); });
  on('btn-admin-logout', 'click', () => { logout(); closeDashboard('admin-dashboard'); });
  on('btn-seller-logout', 'click', () => { logout(); closeDashboard('seller-dashboard'); });

  // Admin / Seller — add product
  ['btn-add-product', 'btn-seller-add-product'].forEach(id => on(id, 'click', () => {
    const g = eid => document.getElementById(eid);
    if (g('product-form-id')) g('product-form-id').value = '';
    if (g('product-form-title')) g('product-form-title').textContent = 'Add New Product';
    document.getElementById('product-form')?.reset();
    if (g('product-form-submit')) g('product-form-submit').textContent = 'Add Product';
    openModal('product-form-modal');
  }));
  on('product-form', 'submit', handleProductForm);

  // Mobile sidebar links
  on('sidebar-login-btn', 'click', () => {
    document.getElementById('mobile-sidebar').classList.remove('open');
    document.getElementById('backdrop').classList.remove('active');
    state.user ? openAccountModal() : openModal('auth-modal');
  });
  on('sidebar-orders-btn', 'click', () => {
    document.getElementById('mobile-sidebar').classList.remove('open');
    document.getElementById('backdrop').classList.remove('active');
    if (state.user) { openAccountModal(); setTimeout(() => document.querySelector('[data-tab="orders"]')?.click(), 100); }
    else openModal('auth-modal');
  });
  on('sidebar-wishlist-btn', 'click', () => {
    document.getElementById('mobile-sidebar').classList.remove('open');
    document.getElementById('backdrop').classList.remove('active');
    openWishlist();
  });

  // Mobile bottom nav
  on('mbn-menu', 'click', () => {
    document.getElementById('mobile-sidebar').classList.add('open');
    document.getElementById('backdrop').classList.add('active');
  });
  on('mbn-cart', 'click', openCart);
  on('mbn-wishlist', 'click', openWishlist);
  on('mbn-grid', 'click', () => { filterByCategory(''); scrollToProducts(); });

  // Newsletter
  on('newsletter-form', 'submit', e => {
    e.preventDefault();
    toast('Thanks for subscribing! 🎉 Check your inbox for a special discount.', 'success', 5000);
    e.target.reset();
    closeModal('newsletter-modal');
  });

  // Deal add to cart
  on('deal-add-cart', 'click', () => addToCart('d11'));

  // NPR payment method radio toggle
  document.querySelectorAll('input[name="npr-payment"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.pay-detail-box').forEach(b => b.classList.add('hidden'));
      const box = document.querySelector(`.${radio.value}-detail`);
      if (box) box.classList.remove('hidden');
      updateNPRAmounts();
      // Draw QR on first reveal (lazy)
      if (radio.value === 'fonepay') {
        setTimeout(() => drawQR('nepali-qr', '#e2231a', 'nepali'), 50);
      }
    });
  });
  // Show COD detail by default
  const codDetail = document.querySelector('.cod-detail');
  if (codDetail) codDetail.classList.remove('hidden');
  // Init QR canvases
  initNepaliPaymentQR();

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Sticky header shadow
  window.addEventListener('scroll', () => {
    const h = document.getElementById('header');
    if (h) h.style.boxShadow = window.scrollY > 10 ? 'var(--shadow)' : 'var(--shadow-sm)';
  });
}

/* ============================================================
   PUBLIC API
   ============================================================ */
const app = {
  addToCart, removeFromCart, updateQty, toggleWishlist,
  filterByCategory, scrollToProducts, closeCart, closeWishlist, closeCheckout,
  openProductModal, openEditProduct, deleteProduct,
  openModal, closeModal, openCart, openWishlist,
  toggleCompare, clearCompare, openCompareModal,
  openSpinWheel, spinWheel,
  selectSuggestion, toast,
  showSizeGuide, openSizeGuide,
  togglePriceDrop, applyBundleDeal, toggleGiftWrap,
  toggleChatbot, chatSend,
  shareProduct, submitBackInStock, printReceipt, hideStickyBar,
  openCheckout: () => { closeCart(); openModal('checkout-modal'); },
  _currentId: null,
};

/* ============================================================
   INIT
   ============================================================ */
/* ============================================================
   DARK MODE
   ============================================================ */
function initDarkMode() {
  const btn = document.getElementById('dark-toggle');
  const saved = localStorage.getItem('sch-dark') === '1';
  if (saved) { document.body.classList.add('dark-mode'); btn.textContent = '☀️'; }
  btn?.addEventListener('click', () => {
    const on = document.body.classList.toggle('dark-mode');
    localStorage.setItem('sch-dark', on ? '1' : '0');
    btn.textContent = on ? '☀️' : '🌙';
  });
}

/* ============================================================
   SCROLL TO TOP
   ============================================================ */
function initScrollTop() {
  const btn = document.getElementById('scroll-top-btn');
  window.addEventListener('scroll', () => {
    btn?.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ============================================================
   SEARCH AUTOCOMPLETE
   ============================================================ */
function initSearchAutocomplete() {
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-suggestions');
  if (!input || !box) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.classList.add('hidden'); return; }
    timer = setTimeout(() => {
      const all = getDemoProducts();
      const matches = all.filter(p => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)).slice(0, 6);
      if (!matches.length) { box.classList.add('hidden'); return; }
      box.innerHTML = matches.map(p => `
        <div class="search-sugg-item" onclick="app.selectSuggestion('${p._id}')">
          <img src="${p.images?.[0]}" alt="" />
          <div class="search-sugg-info">
            <strong>${esc(p.title)}</strong>
            <span>${formatPrice(p.price)}</span>
          </div>
          <span class="search-sugg-cat">${esc(p.category)}</span>
        </div>`).join('');
      box.classList.remove('hidden');
    }, 200);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) box.classList.add('hidden');
  });
}

function selectSuggestion(id) {
  document.getElementById('search-suggestions')?.classList.add('hidden');
  openProductModal(id);
}

/* ============================================================
   RECENTLY VIEWED
   ============================================================ */
function trackRecentlyViewed(product) {
  state.recentlyViewed = state.recentlyViewed.filter(p => p._id !== product._id);
  state.recentlyViewed.unshift({ _id: product._id, title: product.title, price: product.price, images: product.images, category: product.category });
  if (state.recentlyViewed.length > 8) state.recentlyViewed.pop();
  localStorage.setItem('sch-rv', JSON.stringify(state.recentlyViewed));
  renderRecentlyViewed();
}

function renderRecentlyViewed() {
  const section = document.getElementById('recently-viewed-section');
  const scroll = document.getElementById('recently-viewed-scroll');
  if (!scroll) return;
  const items = state.recentlyViewed;
  if (!items.length) { section?.classList.add('hidden'); return; }
  section?.classList.remove('hidden');
  scroll.innerHTML = items.map(p => `
    <div class="rv-card" onclick="app.openProductModal('${p._id}')">
      <img src="${p.images?.[0] || ''}" alt="${esc(p.title)}" />
      <div class="rv-card-info">
        <div class="rv-card-title">${esc(p.title)}</div>
        <div class="rv-card-price">${formatPrice(p.price)}</div>
      </div>
    </div>`).join('');
}

/* ============================================================
   YOU MAY ALSO LIKE (AI-style recommendation)
   ============================================================ */
function renderYouMayLike(product) {
  const section = document.getElementById('you-may-like-section');
  const scroll = document.getElementById('you-may-like-scroll');
  if (!scroll || !product) return;
  const all = getDemoProducts();
  // Score: same category first, then similar price range, exclude current
  const scored = all
    .filter(p => p._id !== product._id)
    .map(p => ({
      ...p,
      score: (p.category === product.category ? 10 : 0) +
             (Math.abs(p.price - product.price) < 30 ? 5 : 0) +
             (p.isFeatured ? 2 : 0) +
             (p.rating >= 4.5 ? 3 : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (!scored.length) return;
  section?.classList.remove('hidden');
  scroll.innerHTML = scored.map(p => productCardHTML(p)).join('');
  // Bind events for the mini cards
  scroll.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProductModal(card.dataset.id));
    card.querySelector('.card-add-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      addToCart(card.dataset.id);
    });
    card.querySelector('.card-wishlist')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleWishlist(card.dataset.id);
    });
  });
}

/* ============================================================
   PRODUCT COMPARISON
   ============================================================ */
function toggleCompare(id) {
  const list = state.compareList;
  const idx = list.indexOf(id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    if (list.length >= 3) { toast('Max 3 products to compare', 'info'); return; }
    list.push(id);
  }
  updateCompareBar();
  renderProducts(state.products.length ? state.products : getDemoProducts());
}

function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  const itemsEl = document.getElementById('compare-bar-items');
  if (!bar || !itemsEl) return;
  const all = [...(state.products.length ? state.products : getDemoProducts()), ...getDemoProducts()];
  const unique = {};
  all.forEach(p => { unique[p._id] = p; });
  bar.classList.toggle('visible', state.compareList.length > 0);
  itemsEl.innerHTML = state.compareList.map(id => {
    const p = unique[id];
    if (!p) return '';
    return `<div class="compare-bar-item">
      <img src="${p.images?.[0]}" alt="" />
      <span>${esc(p.title)}</span>
      <span class="remove-compare" onclick="app.toggleCompare('${id}')">✕</span>
    </div>`;
  }).join('');
}

function clearCompare() {
  state.compareList = [];
  updateCompareBar();
  renderProducts(state.products.length ? state.products : getDemoProducts());
}

function openCompareModal() {
  if (state.compareList.length < 2) { toast('Select at least 2 products to compare', 'info'); return; }
  const all = [...(state.products.length ? state.products : []), ...getDemoProducts()];
  const unique = {};
  all.forEach(p => { unique[p._id] = p; });
  const products = state.compareList.map(id => unique[id]).filter(Boolean);
  const rows = [
    ['Image', p => `<img src="${p.images?.[0]}" alt="" />`],
    ['Name', p => esc(p.title)],
    ['Category', p => esc(p.category)],
    ['Price', p => formatPrice(p.price)],
    ['Rating', p => starsHTML(p.rating)],
    ['Reviews', p => p.numReviews || 0],
    ['Stock', p => p.stock > 0 ? `<span style="color:var(--success)">${p.stock} in stock</span>` : '<span style="color:var(--danger)">Out of stock</span>'],
    ['Discount', p => p.originalPrice ? `<span class="compare-win">-${Math.round((1-p.price/p.originalPrice)*100)}%</span>` : '—'],
  ];
  const html = `<table class="compare-table">
    <thead><tr><th>Feature</th>${products.map(p => `<th>${esc(p.title)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, fn]) => `<tr><td>${label}</td>${products.map(p => `<td>${fn(p)}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td></td>${products.map(p => `<td><button class="card-add-btn" style="width:100%" onclick="app.addToCart('${p._id}');app.closeModal('compare-modal')"><i class="fas fa-shopping-bag"></i> Add to Cart</button></td>`).join('')}</tr></tfoot>
  </table>`;
  document.getElementById('compare-table-wrap').innerHTML = html;
  openModal('compare-modal');
}

/* ============================================================
   CONFETTI
   ============================================================ */
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 200,
    w: 8 + Math.random() * 8,
    h: 4 + Math.random() * 4,
    color: ['#e8354a','#ffd700','#00b894','#0984e3','#a29bfe','#fd79a8'][Math.floor(Math.random()*6)],
    rot: Math.random() * Math.PI * 2,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 3,
    vr: (Math.random() - 0.5) * 0.2,
  }));
  let frame;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    const alive = pieces.some(p => p.y < canvas.height + 20);
    if (alive) frame = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  tick();
  setTimeout(() => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 4000);
}

/* ============================================================
   SPIN WHEEL
   ============================================================ */
const SPIN_PRIZES = [
  { label: 'WELCOME10', color: '#e8354a', text: '10% OFF' },
  { label: 'SAVE20', color: '#0984e3', text: '$20 OFF' },
  { label: 'TRY AGAIN', color: '#636e72', text: 'Try Again' },
  { label: 'SUMMER25', color: '#00b894', text: '25% OFF' },
  { label: 'TRY AGAIN', color: '#a29bfe', text: 'Try Again' },
  { label: 'WELCOME10', color: '#fd79a8', text: '10% OFF' },
  { label: 'SAVE20', color: '#fdcb6e', text: '$20 OFF' },
  { label: 'TRY AGAIN', color: '#55efc4', text: 'Try Again' },
];

function drawSpinWheel(rotation) {
  const canvas = document.getElementById('spin-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 130, cy = 130, r = 124;
  const arc = (Math.PI * 2) / SPIN_PRIZES.length;
  ctx.clearRect(0, 0, 260, 260);
  SPIN_PRIZES.forEach((prize, i) => {
    const start = rotation + i * arc;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + arc);
    ctx.fillStyle = prize.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + arc / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Poppins,sans-serif';
    ctx.fillText(prize.text, r - 10, 4);
    ctx.restore();
  });
  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#e8354a';
  ctx.font = 'bold 9px Poppins,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPIN', cx, cy + 3);
}

let spinRotation = 0;
let spinAnimating = false;

function openSpinWheel() {
  openModal('spin-modal');
  drawSpinWheel(spinRotation);
  document.getElementById('spin-result').style.display = 'none';
  const btn = document.getElementById('spin-btn');
  if (btn) btn.disabled = state.spinUsed;
  if (state.spinUsed && btn) btn.textContent = 'Already Spun Today!';
}

function spinWheel() {
  if (spinAnimating || state.spinUsed) return;
  spinAnimating = true;
  const btn = document.getElementById('spin-btn');
  if (btn) btn.disabled = true;
  const spins = 5 + Math.random() * 5;
  const extra = Math.random() * Math.PI * 2;
  const total = spins * Math.PI * 2 + extra;
  const duration = 4000;
  const start = performance.now();
  const startRot = spinRotation;
  const animate = (now) => {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    spinRotation = startRot + total * ease;
    drawSpinWheel(spinRotation);
    if (t < 1) { requestAnimationFrame(animate); return; }
    spinAnimating = false;
    // Determine prize: pointer at top = -Math.PI/2
    const arc = (Math.PI * 2) / SPIN_PRIZES.length;
    const normalised = (((-spinRotation - Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.floor(normalised / arc) % SPIN_PRIZES.length;
    const prize = SPIN_PRIZES[idx];
    const resultEl = document.getElementById('spin-result');
    if (resultEl) {
      resultEl.style.display = 'block';
      if (prize.label === 'TRY AGAIN') {
        resultEl.innerHTML = `<div style="font-size:16px;color:var(--text-2)">Better luck next time! 😅</div>`;
      } else {
        resultEl.innerHTML = `<div>🎉 You won!</div><div class="spin-result-code" title="Click to copy" onclick="navigator.clipboard?.writeText('${prize.label}');app.toast('Coupon copied!','success')">${prize.label}</div><p style="font-size:11px;color:var(--text-3);margin-top:8px">Tap code to copy · Use at checkout</p>`;
        launchConfetti();
      }
    }
    state.spinUsed = true;
    localStorage.setItem('sch-spin-used', '1');
    if (btn) { btn.textContent = 'Already Spun Today!'; }
  };
  requestAnimationFrame(animate);
}

/* ============================================================
   CART BADGE BOUNCE
   ============================================================ */
function bounceCartBadge() {
  const badge = document.querySelector('#btn-cart .hbadge');
  if (!badge) return;
  badge.classList.remove('bounce');
  void badge.offsetWidth;
  badge.classList.add('bounce');
  setTimeout(() => badge.classList.remove('bounce'), 600);
}

/* ============================================================
   CATEGORY PILLS ACTIVE STATE
   ============================================================ */
function updateCatPills() {
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.classList.remove('active');
  });
  const active = document.querySelector(`.cat-pill[onclick*="${state.filters.category}"]`);
  if (active) active.classList.add('active');
  else document.querySelector('.cat-pill')?.classList.add('active');
}

/* ============================================================
   LIVE NOTIFICATION (dynamic)
   ============================================================ */
function initLiveNotifDynamic() {
  const products = getDemoProducts();
  const locations = ['New York', 'London', 'Kathmandu', 'Sydney', 'Paris', 'Toronto', 'Dubai', 'Tokyo'];
  const times = ['Just now', '2 min ago', '5 min ago', '8 min ago', '12 min ago'];
  let notifIdx = 0;
  const show = () => {
    const notif = document.getElementById('live-notif');
    if (!notif) return;
    const p = products[notifIdx % products.length];
    const loc = locations[Math.floor(Math.random() * locations.length)];
    const time = times[Math.floor(Math.random() * times.length)];
    const img = notif.querySelector('img');
    const productSpan = document.getElementById('live-notif-product');
    const timeSpan = document.getElementById('live-notif-time');
    const strong = notif.querySelector('strong');
    if (img) img.src = p.images?.[0] || '';
    if (productSpan) productSpan.textContent = p.title;
    if (timeSpan) timeSpan.textContent = time;
    if (strong) strong.textContent = `Someone in ${loc} just bought`;
    notif.style.display = 'flex';
    notif.style.animation = 'none';
    void notif.offsetWidth;
    notif.style.animation = 'slideInLeft 0.5s ease';
    setTimeout(() => { notif.style.display = 'none'; }, 7000);
    notifIdx++;
  };
  setTimeout(show, 4000);
  setInterval(show, 20000);
}

/* ============================================================
   AI CHATBOT
   ============================================================ */
const CHAT_KB = [
  { q: ['dress','frock','women','girl'], a: "We have gorgeous dresses! 👗 Check our Dress & Frock collection.", action: () => { filterByCategory('Dress & Frock'); scrollToProducts(); } },
  { q: ['jacket','coat','winter'], a: "Warm up in style! 🧥 Showing jackets and winter wear for you.", action: () => { filterByCategory('Jackets'); scrollToProducts(); } },
  { q: ['shoe','sneaker','footwear','boot'], a: "Step up your shoe game! 👟 Here's our footwear collection.", action: () => { filterByCategory('Shoes & Footwear'); scrollToProducts(); } },
  { q: ['watch','jewelry','jewel'], a: "Accessorize perfectly! ⌚ Browse watches and jewelry.", action: () => { filterByCategory('Watches & Jewelry'); scrollToProducts(); } },
  { q: ['deal','sale','discount','offer','cheap'], a: "🔥 Hot deals today! Use coupon codes: WELCOME10 (10% off), SUMMER25 (25% off), SAVE20 ($20 off orders $100+)." },
  { q: ['coupon','code','promo'], a: "🎟️ Active coupon codes:\n• WELCOME10 — 10% off\n• SUMMER25 — 25% off (max $50)\n• SAVE20 — $20 off orders over $100" },
  { q: ['track','order','status','delivery'], a: "📦 Your order is currently being processed! Expected delivery: 3–5 business days. Track in your account → Orders tab." },
  { q: ['return','refund','exchange'], a: "🔄 Easy returns within 30 days! Free exchange on defective items. Contact us at support@surajcommerce.com" },
  { q: ['pay','payment','esewa','khalti','stripe','card'], a: "💳 We accept Stripe (international cards), eSewa, Khalti, ConnectIPS, and Cash on Delivery (Nepal). Select NPR currency for Nepali payment options!" },
  { q: ['ship','shipping','free'], a: "🚚 Free shipping on orders over $100 (रू 13,300). Standard shipping: $12 / रू 100–350." },
  { q: ['size','fit','measurement'], a: "📏 Check our Size Guide! Click the ruler icon on any product page for detailed size charts for clothing, shoes, and jewelry." },
  { q: ['hello','hi','hey','help','start'], a: "👋 Hi! I'm Suraj Assistant. I can help you find products, check deals, track orders, or answer any shopping questions!" },
  { q: ['perfume','fragrance'], a: "🌸 Our Rose Gold Perfume is trending! 100ml EDP with floral musk — shop Perfume & Fragrance.", action: () => { filterByCategory('Perfume & Fragrance'); scrollToProducts(); } },
  { q: ['bag','purse','handbag'], a: "👜 Premium leather bags await you!", action: () => { filterByCategory('Bags & Accessories'); scrollToProducts(); } },
  { q: ['sport','gym','yoga','fitness'], a: "💪 Workout in style!", action: () => { filterByCategory('Sports'); scrollToProducts(); } },
  { q: ['nepal','npr','rupee','kathmandu'], a: "🇳🇵 Namaste! Switch to NPR currency (top of page) to pay with eSewa, Khalti, ConnectIPS, or Cash on Delivery anywhere in Nepal!" },
];

let chatOpen = false;
let chatInitialized = false;

function toggleChatbot() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chatbot-window');
  const badge = document.querySelector('.chatbot-trigger .chat-badge');
  win?.classList.toggle('open', chatOpen);
  if (badge) badge.style.display = 'none';
  if (chatOpen && !chatInitialized) {
    chatInitialized = true;
    chatBotMsg("👋 Hi! I'm Suraj Assistant. How can I help you today?\n\nTry asking about products, deals, shipping, or returns!");
  }
}

function chatBotMsg(text) {
  const msgs = document.getElementById('chatbot-msgs');
  if (!msgs) return;
  const typing = document.createElement('div');
  typing.className = 'chat-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;
  setTimeout(() => {
    typing.remove();
    const el = document.createElement('div');
    el.className = 'chat-msg bot';
    el.style.whiteSpace = 'pre-line';
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }, 800 + Math.random() * 400);
}

function chatUserMsg(text) {
  const msgs = document.getElementById('chatbot-msgs');
  if (!msgs) return;
  const el = document.createElement('div');
  el.className = 'chat-msg user';
  el.textContent = text;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function chatSend(text) {
  text = (text || '').trim();
  const input = document.getElementById('chatbot-input');
  if (input) input.value = '';
  if (!text) return;
  if (!chatOpen) toggleChatbot();
  chatUserMsg(text);
  const lower = text.toLowerCase();
  const match = CHAT_KB.find(entry => entry.q.some(kw => lower.includes(kw)));
  if (match) {
    chatBotMsg(match.a);
    if (match.action) setTimeout(() => { match.action(); toggleChatbot(); }, 1500);
  } else {
    chatBotMsg(`🔍 Let me search for "${text}" for you...`);
    setTimeout(() => {
      state.filters.search = text;
      state.pagination.page = 1;
      fetchProducts();
      scrollToProducts();
      if (chatOpen) toggleChatbot();
    }, 1200);
  }
}

/* ============================================================
   FLASH SALE COUNTDOWN
   ============================================================ */
function initFlashSale() {
  const saved = localStorage.getItem('sch-flash-end');
  let endTime = saved ? parseInt(saved) : Date.now() + 2.5 * 60 * 60 * 1000;
  if (!saved) localStorage.setItem('sch-flash-end', endTime);
  const tick = () => {
    const diff = Math.max(0, endTime - Date.now());
    const h = String(Math.floor(diff / 3600000)).padStart(2,'0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2,'0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2,'0');
    const fh = document.getElementById('fs-h');
    const fm = document.getElementById('fs-m');
    const fs = document.getElementById('fs-s');
    if (fh) fh.textContent = h;
    if (fm) fm.textContent = m;
    if (fs) fs.textContent = s;
    if (diff === 0) { localStorage.removeItem('sch-flash-end'); }
  };
  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   STICKY ADD-TO-CART BAR
   ============================================================ */
function initStickyCartBar() {
  const modal = document.getElementById('product-modal');
  if (!modal) return;
  const bar = document.getElementById('sticky-cart-bar');
  let ticking = false;
  modal.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const actionsEl = modal.querySelector('.prod-actions');
        if (actionsEl && bar) {
          const rect = actionsEl.getBoundingClientRect();
          bar.classList.toggle('visible', rect.bottom < 0);
        }
        ticking = false;
      });
      ticking = true;
    }
  });
}

function updateStickyBar(product) {
  if (!product) return;
  const img = document.getElementById('sticky-cart-img');
  const title = document.getElementById('sticky-cart-title');
  const price = document.getElementById('sticky-cart-price');
  if (img) img.src = product.images?.[0] || '';
  if (title) title.textContent = product.title;
  if (price) price.textContent = formatPrice(product.price);
}

function hideStickyBar() {
  document.getElementById('sticky-cart-bar')?.classList.remove('visible');
}

/* ============================================================
   PRODUCT VARIANTS (color + size)
   ============================================================ */
const PRODUCT_VARIANTS = {
  'Dress & Frock': { colors: ['#e8354a','#764ba2','#0984e3','#00b894','#f9ca24'], sizes: ['XS','S','M','L','XL'] },
  'T-Shirts': { colors: ['#ffffff','#1a1a1a','#e8354a','#0984e3','#f9ca24'], sizes: ['XS','S','M','L','XL','XXL'] },
  'Jackets': { colors: ['#1a1a1a','#8B4513','#2d3436','#764ba2'], sizes: ['S','M','L','XL'] },
  'Winter Wear': { colors: ['#1a1a1a','#636e72','#e8354a','#0984e3'], sizes: ['S','M','L','XL'] },
  'Shorts & Jeans': { colors: ['#1a68c0','#1a1a1a','#7f8c8d'], sizes: ['28','30','32','34','36'] },
  'Shoes & Footwear': { colors: ['#1a1a1a','#ffffff','#e8354a','#8B4513'], sizes: ['6','7','8','9','10','11'] },
  'Sports': { colors: ['#e8354a','#1a1a1a','#0984e3','#00b894'], sizes: ['XS','S','M','L','XL'] },
};

function renderVariants(category) {
  const container = document.getElementById('modal-variants');
  if (!container) return;
  const vars = PRODUCT_VARIANTS[category];
  if (!vars) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div style="margin:8px 0">
      <div class="variant-label">Color</div>
      <div class="variant-row">${vars.colors.map((c,i) => `<div class="color-dot ${i===0?'active':''}" style="background:${c}" onclick="this.closest('.variant-row').querySelectorAll('.color-dot').forEach(d=>d.classList.remove('active'));this.classList.add('active')" title="${c}"></div>`).join('')}</div>
      <div class="variant-label" style="margin-top:8px">Size</div>
      <div class="variant-row">${vars.sizes.map((s,i) => `<div class="size-chip ${i===0?'active':''}" onclick="this.closest('.variant-row').querySelectorAll('.size-chip').forEach(d=>d.classList.remove('active'));this.classList.add('active')">${s}</div>`).join('')}</div>
    </div>`;
}

/* ============================================================
   SOCIAL SHARE
   ============================================================ */
function shareProduct(platform) {
  const p = state.currentProduct;
  if (!p) return;
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent(`Check out ${p.title} — ${formatPrice(p.price)} on Suraj Commerce Hub!`);
  const links = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    whatsapp: `https://api.whatsapp.com/send?text=${text}%20${url}`,
    copy: null,
  };
  if (platform === 'copy') {
    navigator.clipboard?.writeText(`${p.title} — ${formatPrice(p.price)}\n${window.location.href}`)
      .then(() => toast('🔗 Link copied to clipboard!', 'success'));
    return;
  }
  if (navigator.share && (platform === 'facebook' || platform === 'twitter')) {
    navigator.share({ title: p.title, text: `${p.title} — ${formatPrice(p.price)}`, url: window.location.href }).catch(() => {});
    return;
  }
  window.open(links[platform], '_blank', 'width=600,height=400');
}

/* ============================================================
   BACK IN STOCK
   ============================================================ */
function submitBackInStock() {
  const email = document.getElementById('bis-email')?.value.trim();
  if (!email) { toast('Please enter your email', 'error'); return; }
  const bisItems = JSON.parse(localStorage.getItem('sch-bis') || '[]');
  bisItems.push({ productId: app._currentId, email, title: state.currentProduct?.title });
  localStorage.setItem('sch-bis', JSON.stringify(bisItems));
  toast(`📬 We'll notify ${email} when back in stock!`, 'success');
  document.getElementById('bis-email').value = '';
}

/* ============================================================
   SOCIAL PROOF (viewers counter)
   ============================================================ */
function initViewersCounter() {
  const updateCount = () => {
    const el = document.getElementById('viewers-count');
    if (el) el.textContent = Math.floor(8 + Math.random() * 25);
  };
  updateCount();
  setInterval(updateCount, 5000);
}

/* ============================================================
   PRINT RECEIPT
   ============================================================ */
function printReceipt() {
  const orderNum = document.getElementById('confirm-order-number')?.textContent || '';
  const details = document.getElementById('confirm-details')?.innerHTML || '';
  const printArea = document.getElementById('print-area');
  if (!printArea) return;
  printArea.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <h1 style="font-size:24px;font-weight:900;color:#e8354a">SURAJ COMMERCE HUB</h1>
      <p style="color:#888">Order Receipt</p>
    </div>
    <hr style="margin:10px 0"/>
    <p><strong>${orderNum}</strong></p>
    <p>Date: ${new Date().toLocaleString()}</p>
    <hr style="margin:10px 0"/>
    ${state.cart.map(i => `<div style="display:flex;justify-content:space-between;margin:6px 0"><span>${i.title} ×${i.quantity}</span><span>${formatPrice(i.price*i.quantity)}</span></div>`).join('')}
    <hr style="margin:10px 0"/>
    ${details}
    <hr style="margin:10px 0"/>
    <p style="text-align:center;font-size:11px;color:#aaa;margin-top:20px">Thank you for shopping with Suraj Commerce Hub!</p>`;
  printArea.style.display = 'block';
  window.print();
  printArea.style.display = 'none';
}

/* ============================================================
   3D CARD TILT
   ============================================================ */
function initCardTilt() {
  document.addEventListener('mousemove', e => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(600px) rotateY(${x*12}deg) rotateX(${-y*12}deg) translateZ(4px)`;
  });
  document.addEventListener('mouseleave', e => {
    const card = e.target.closest?.('.product-card');
    if (card) card.style.transform = '';
  }, true);
  document.addEventListener('mouseout', e => {
    const card = e.target.closest?.('.product-card');
    if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
  });
}

/* ============================================================
   DYNAMIC CATEGORY COUNTS
   ============================================================ */
function updateCategoryCounts() {
  const all = getDemoProducts();
  const counts = {};
  all.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
  // Update left sidebar category list
  document.querySelectorAll('.cat-item').forEach(item => {
    const label = item.querySelector('.cat-label')?.textContent?.trim();
    if (!label) return;
    const match = Object.entries(counts).find(([k]) => k.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(k.split(' ')[0].toLowerCase()));
    if (match) {
      let badge = item.querySelector('.cat-count-badge');
      if (!badge) { badge = document.createElement('span'); badge.className = 'cat-count-badge'; item.appendChild(badge); }
      badge.textContent = `(${match[1]})`;
    }
  });
}

/* ============================================================
   VOICE SEARCH
   ============================================================ */
function initVoiceSearch() {
  const btn = document.getElementById('voice-search-btn');
  const input = document.getElementById('search-input');
  if (!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.style.display = 'none'; return; }
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = e => {
    const q = e.results[0][0].transcript;
    input.value = q;
    btn.classList.remove('listening');
    btn.innerHTML = '<i class="fas fa-microphone"></i>';
    state.filters.search = q;
    state.pagination.page = 1;
    fetchProducts();
    scrollToProducts();
    toast(`🎤 Searching for "${q}"`, 'info');
  };
  rec.onerror = () => { btn.classList.remove('listening'); btn.innerHTML = '<i class="fas fa-microphone"></i>'; };
  rec.onend = () => { btn.classList.remove('listening'); btn.innerHTML = '<i class="fas fa-microphone"></i>'; };
  btn.addEventListener('click', () => {
    if (btn.classList.contains('listening')) { rec.stop(); return; }
    btn.classList.add('listening');
    btn.innerHTML = '<i class="fas fa-circle" style="color:var(--danger)"></i>';
    rec.start();
  });
}

/* ============================================================
   IMAGE MAGNIFIER
   ============================================================ */
function initImageMagnifier() {
  const img = document.getElementById('gallery-main-img');
  if (!img) return;
  const wrap = img.parentElement;
  wrap.classList.add('magnifier-wrap');
  let lens = document.querySelector('.magnifier-lens');
  if (!lens) {
    lens = document.createElement('div');
    lens.className = 'magnifier-lens';
    wrap.appendChild(lens);
  }
  wrap.addEventListener('mousemove', e => {
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const lw = lens.offsetWidth, lh = lens.offsetHeight;
    const cx = Math.max(lw/2, Math.min(x, rect.width - lw/2));
    const cy = Math.max(lh/2, Math.min(y, rect.height - lh/2));
    lens.style.left = (cx - lw/2) + 'px';
    lens.style.top = (cy - lh/2) + 'px';
    const bgX = ((cx / rect.width) * 100).toFixed(1);
    const bgY = ((cy / rect.height) * 100).toFixed(1);
    lens.style.backgroundImage = `url(${img.src})`;
    lens.style.backgroundPosition = `${bgX}% ${bgY}%`;
    lens.style.backgroundSize = `${rect.width * 4}px ${rect.height * 4}px`;
    lens.style.display = 'block';
  });
  wrap.addEventListener('mouseleave', () => { lens.style.display = 'none'; });
}

/* ============================================================
   MINI CART PREVIEW
   ============================================================ */
function renderMiniCartPreview() {
  const container = document.getElementById('mini-cart-preview-items');
  if (!container) return;
  if (!state.cart.length) {
    container.innerHTML = '<div class="mini-cart-preview-empty"><i class="fas fa-shopping-bag" style="font-size:24px;color:var(--border);display:block;margin-bottom:6px"></i>Your cart is empty</div>';
    return;
  }
  const items = state.cart.slice(0, 3);
  container.innerHTML = items.map(i => `
    <div class="mini-cart-preview-item">
      <img src="${i.image || ''}" alt="${esc(i.title)}" />
      <span class="mini-cart-preview-name">${esc(i.title)} ×${i.quantity}</span>
      <span class="mini-cart-preview-price">${formatPrice(i.price * i.quantity)}</span>
    </div>`).join('') +
    (state.cart.length > 3 ? `<div style="font-size:11px;color:var(--text-3);text-align:center;padding:6px">+${state.cart.length - 3} more items</div>` : '');
}

/* ============================================================
   BUNDLE DEAL
   ============================================================ */
function checkBundleDeal() {
  const banner = document.getElementById('bundle-deal-banner');
  if (!banner) return;
  banner.style.display = state.cart.length === 1 ? 'flex' : 'none';
}

function applyBundleDeal() {
  state.filters.category = '';
  fetchProducts();
  closeCart();
  scrollToProducts();
  toast('🛍️ Add another item to unlock 10% off!', 'info');
}

/* ============================================================
   GIFT WRAP
   ============================================================ */
function toggleGiftWrap(checked) {
  state.giftWrap = checked;
  const row = document.getElementById('gift-wrap-row');
  const priceEl = document.getElementById('cart-gift-wrap');
  if (row) row.classList.toggle('hidden', !checked);
  if (priceEl) priceEl.textContent = formatPrice(2);
  renderCartItems();
}

/* ============================================================
   SIZE GUIDE
   ============================================================ */
const SIZE_GUIDES = {
  clothing: {
    headers: ['Size', 'Chest (in)', 'Waist (in)', 'Hips (in)'],
    rows: [['XS','31–32','24–25','33–34'],['S','33–34','26–27','35–36'],['M','35–36','28–29','37–38'],['L','37–39','30–31','39–41'],['XL','40–42','32–34','42–44'],['XXL','43–45','35–37','45–47']],
  },
  shoes: {
    headers: ['US', 'UK', 'EU', 'CM'],
    rows: [['6','5.5','38','24'],['7','6.5','40','25'],['8','7.5','41','26'],['9','8.5','42','27'],['10','9.5','43','28'],['11','10.5','44','29'],['12','11.5','46','30']],
  },
  jewelry: {
    headers: ['Size', 'Ring Circumference (mm)', 'Wrist (cm)'],
    rows: [['XS','47','14'],['S','50','15'],['M','53','16'],['L','57','17'],['XL','60','18'],['XXL','63','19']],
  },
};

function showSizeGuide(type, btn) {
  document.querySelectorAll('.sg-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const guide = SIZE_GUIDES[type];
  const content = document.getElementById('size-guide-content');
  if (!content || !guide) return;
  content.innerHTML = `<table class="size-guide-table">
    <thead><tr>${guide.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${guide.rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function openSizeGuide() {
  showSizeGuide('clothing', document.querySelector('.sg-tab'));
  openModal('size-guide-modal');
}

/* ============================================================
   PRICE DROP ALERT
   ============================================================ */
function togglePriceDrop(productId, btn) {
  const alerts = JSON.parse(localStorage.getItem('sch-price-alerts') || '[]');
  const idx = alerts.indexOf(productId);
  if (idx >= 0) {
    alerts.splice(idx, 1);
    toast('Price alert removed', 'info');
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-bell"></i> Notify me if price drops';
  } else {
    alerts.push(productId);
    toast('🔔 We\'ll alert you if the price drops!', 'success');
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-bell-slash"></i> Alert set ✓';
  }
  localStorage.setItem('sch-price-alerts', JSON.stringify(alerts));
}

/* ============================================================
   ORDER TRACKING TIMELINE
   ============================================================ */
function renderOrderTimeline(status = 'processing') {
  const steps = [
    { key: 'placed', label: 'Order Placed', icon: 'fa-check', desc: 'Your order has been received' },
    { key: 'processing', label: 'Processing', icon: 'fa-cog', desc: 'We\'re preparing your items' },
    { key: 'shipped', label: 'Shipped', icon: 'fa-truck', desc: 'Your order is on the way' },
    { key: 'delivery', label: 'Out for Delivery', icon: 'fa-motorcycle', desc: 'Almost there!' },
    { key: 'delivered', label: 'Delivered', icon: 'fa-home', desc: 'Enjoy your purchase!' },
  ];
  const order = ['placed','processing','shipped','delivery','delivered'];
  const currentIdx = order.indexOf(status);
  const container = document.getElementById('order-timeline');
  if (!container) return;
  container.innerHTML = steps.map((step, i) => {
    const done = i < currentIdx;
    const active = i === currentIdx;
    return `<div class="timeline-step">
      <div class="timeline-dot-wrap">
        <div class="timeline-dot ${done ? 'done' : active ? 'active' : ''}">
          <i class="fas ${done ? 'fa-check' : step.icon}"></i>
        </div>
        ${i < steps.length - 1 ? `<div class="timeline-line ${done ? 'done' : ''}"></div>` : ''}
      </div>
      <div class="timeline-content">
        <h5 style="${done||active ? '' : 'color:var(--text-3)'}">${step.label}</h5>
        <p>${active ? step.desc : done ? '✓ Completed' : 'Pending'}</p>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   FOR YOU (personalized) SECTION
   ============================================================ */
function renderForYou() {
  const section = document.getElementById('for-you-section');
  const scroll = document.getElementById('for-you-scroll');
  if (!scroll) return;
  // Track category interest counts
  const interests = JSON.parse(localStorage.getItem('sch-interests') || '{}');
  const topCat = Object.entries(interests).sort((a,b) => b[1]-a[1])[0]?.[0];
  const all = getDemoProducts();
  let picks = topCat ? all.filter(p => p.category === topCat) : [];
  if (picks.length < 3) picks = [...picks, ...all.filter(p => p.isFeatured && !picks.includes(p))].slice(0,6);
  if (!picks.length) return;
  section?.classList.remove('hidden');
  scroll.innerHTML = picks.map(p => productCardHTML(p)).join('');
  scroll.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProductModal(card.dataset.id));
    card.querySelector('.card-add-btn')?.addEventListener('click', e => { e.stopPropagation(); addToCart(card.dataset.id); });
    card.querySelector('.card-wishlist')?.addEventListener('click', e => { e.stopPropagation(); toggleWishlist(card.dataset.id); });
  });
}

function trackInterest(category) {
  if (!category) return;
  const interests = JSON.parse(localStorage.getItem('sch-interests') || '{}');
  interests[category] = (interests[category] || 0) + 1;
  localStorage.setItem('sch-interests', JSON.stringify(interests));
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
function initKeyboardShortcuts() {
  let hintTimer;
  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName.toLowerCase();
    if (['input','textarea','select'].includes(tag)) return;
    switch(e.key) {
      case 's': case 'S':
        e.preventDefault();
        document.getElementById('search-input')?.focus();
        break;
      case 'c': case 'C':
        openCart();
        break;
      case 'w': case 'W':
        openWishlist();
        break;
      case 'd': case 'D':
        document.getElementById('dark-toggle')?.click();
        break;
      case 't': case 'T':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'Escape':
        document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
        document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open'));
        document.getElementById('backdrop')?.classList.remove('active');
        break;
      case 'ArrowLeft':
        document.querySelector('.hero-arrow.prev')?.click();
        break;
      case 'ArrowRight':
        document.querySelector('.hero-arrow.next')?.click();
        break;
      case '?':
        const hint = document.getElementById('shortcuts-toast');
        if (hint) { hint.classList.toggle('visible'); clearTimeout(hintTimer); if (hint.classList.contains('visible')) hintTimer = setTimeout(() => hint.classList.remove('visible'), 4000); }
        break;
    }
  });
}

/* ============================================================
   INFINITE SCROLL
   ============================================================ */
function initInfiniteScroll() {
  const loader = document.getElementById('infinite-loader');
  if (!loader) return;
  // Move loader after product-grid
  document.getElementById('product-grid')?.insertAdjacentElement('afterend', loader);
  let loading = false;
  const observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting || loading) return;
    if (state.pagination.page >= state.pagination.pages) return;
    loading = true;
    loader.classList.add('visible');
    setTimeout(() => {
      state.pagination.page++;
      fetchProducts().finally(() => { loading = false; loader.classList.remove('visible'); });
    }, 600);
  }, { threshold: 0.1 });
  observer.observe(loader);
}

/* ============================================================
   PAGE TRANSITION (product grid fade)
   ============================================================ */
const _origFetch = fetchProducts;
async function fetchProductsWithFade() {
  const grid = document.getElementById('product-grid');
  grid?.classList.add('fading');
  await new Promise(r => setTimeout(r, 200));
  const result = await _origFetch();
  grid?.classList.remove('fading');
  return result;
}

/* ============================================================
   BLUR-UP IMAGE LOADING
   ============================================================ */
function initBlurUpImages() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      img.classList.add('loading');
      const real = new Image();
      real.onload = () => { img.src = real.src; img.classList.remove('loading'); };
      real.src = img.dataset.src || img.src;
      observer.unobserve(img);
    });
  });
  document.querySelectorAll('.product-card-img img[loading="lazy"]').forEach(img => observer.observe(img));
}

document.addEventListener('DOMContentLoaded', () => {
  initCurrencySelector();
  initDarkMode();
  initScrollTop();
  initHero();
  initDealOfDay();
  initLiveNotifDynamic();
  initNewsletterModal();
  initSearchAutocomplete();
  initVoiceSearch();
  initKeyboardShortcuts();
  initFlashSale();
  initCardTilt();
  initViewersCounter();
  initStickyCartBar();
  initEvents();
  initAccountTabs();
  initStarRating();

  updateCartUI();
  updateWishlistUI();
  updateAuthUI();
  renderRecentlyViewed();
  renderForYou();
  renderOrderTimeline('processing');
  renderMiniCartPreview();
  updateCategoryCounts();

  // Draw spin wheel on open
  document.getElementById('spin-modal')?.addEventListener('transitionend', () => drawSpinWheel(spinRotation));

  // Show shortcut hint once
  if (!localStorage.getItem('sch-hint-shown')) {
    setTimeout(() => {
      const hint = document.getElementById('shortcuts-toast');
      hint?.classList.add('visible');
      setTimeout(() => hint?.classList.remove('visible'), 5000);
      localStorage.setItem('sch-hint-shown', '1');
    }, 3000);
  }

  fetchProducts().then(() => {
    renderShowcaseLists();
    renderYouMayLike(getDemoProducts()[0]);
    initInfiniteScroll();
    initBlurUpImages();
  });
});
