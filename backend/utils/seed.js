require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/suraj-commerce-hub');
  console.log('Connected to DB');

  await User.deleteMany({});
  await Product.deleteMany({});
  await Coupon.deleteMany({});

  const admin = await User.create({ name: 'Admin User', email: 'admin@surajcommerce.com', password: 'admin123', role: 'admin' });
  const seller = await User.create({ name: 'Suraj Boutique', email: 'seller@surajcommerce.com', password: 'seller123', role: 'seller', sellerInfo: { shopName: 'Suraj Boutique', bio: 'Premium fashion house', isApproved: true } });
  const seller2 = await User.create({ name: 'Urban Threads', email: 'urban@surajcommerce.com', password: 'seller123', role: 'seller', sellerInfo: { shopName: 'Urban Threads', bio: 'Modern streetwear', isApproved: true } });
  await User.create({ name: 'Jane Customer', email: 'customer@surajcommerce.com', password: 'customer123', role: 'customer' });

  const products = [
    { title: 'Floral Summer Dress', category: 'Dress & Frock', description: 'Light and breezy floral dress perfect for summer outings. Made from 100% breathable cotton.', price: 49.99, originalPrice: 69.99, stock: 25, images: ['https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500'], isFeatured: true, rating: 4.5, numReviews: 12, tags: ['summer', 'floral', 'cotton'] },
    { title: 'Classic Winter Coat', category: 'Winter Wear', description: 'Premium wool blend coat with double-breasted buttons. Keeps you warm and stylish all winter.', price: 129.99, originalPrice: 179.99, stock: 12, images: ['https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=500'], isFeatured: true, rating: 4.8, numReviews: 28, tags: ['winter', 'wool', 'coat'] },
    { title: 'Aviator Sunglasses', category: 'Glasses & Lens', description: 'Classic gold-frame aviator sunglasses with UV400 protection. Timeless style meets modern protection.', price: 34.99, originalPrice: 49.99, stock: 50, images: ['https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500'], rating: 4.3, numReviews: 45, tags: ['sunglasses', 'uv protection'] },
    { title: 'Slim Fit Denim Jeans', category: 'Shorts & Jeans', description: 'Premium stretch denim in slim fit. Comfortable for all-day wear with a modern tapered leg.', price: 59.99, stock: 30, images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?w=500'], isFeatured: true, rating: 4.6, numReviews: 34, tags: ['denim', 'jeans', 'slim fit'] },
    { title: 'Graphic Print Tee', category: 'T-Shirts', description: 'Soft cotton jersey tee with original graphic print. Unisex cut available in multiple colors.', price: 24.99, stock: 100, images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500'], rating: 4.2, numReviews: 67, tags: ['cotton', 'graphic', 'casual'] },
    { title: 'Leather Biker Jacket', category: 'Jackets', description: 'Genuine leather jacket with asymmetric zip. A wardrobe staple that gets better with age.', price: 199.99, originalPrice: 259.99, stock: 8, images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500'], isFeatured: true, rating: 4.9, numReviews: 15, tags: ['leather', 'biker', 'jacket'] },
    { title: 'Chronograph Watch', category: 'Watches & Jewelry', description: 'Stainless steel chronograph watch with sapphire crystal glass. Water resistant to 50m.', price: 149.99, originalPrice: 199.99, stock: 15, images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500'], isFeatured: true, rating: 4.7, numReviews: 22, tags: ['watch', 'chronograph', 'steel'] },
    { title: 'Wool Fedora Hat', category: 'Hats & Caps', description: 'Classic wool fedora with grosgrain ribbon band. Shape-retaining brim with water-resistant finish.', price: 39.99, stock: 40, images: ['https://images.unsplash.com/photo-1521369909029-2afed882baee?w=500'], rating: 4.4, numReviews: 18, tags: ['hat', 'wool', 'fedora'] },
    { title: 'Leather Crossbody Bag', category: 'Bags & Accessories', description: 'Full-grain leather crossbody with adjustable strap. Multiple compartments for everyday essentials.', price: 89.99, originalPrice: 119.99, stock: 20, images: ['https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500'], isFeatured: true, rating: 4.6, numReviews: 31, tags: ['leather', 'bag', 'crossbody'] },
    { title: 'Running Sneakers', category: 'Shoes & Footwear', description: 'Lightweight mesh running shoe with responsive foam sole. Engineered for performance and comfort.', price: 79.99, stock: 35, images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500'], rating: 4.5, numReviews: 52, tags: ['running', 'shoes', 'sport'] },
    { title: 'Rose Gold Perfume', category: 'Perfume & Fragrance', description: 'Luxurious floral musk fragrance with notes of rose, jasmine, and sandalwood. Long-lasting 100ml EDP.', price: 69.99, stock: 25, images: ['https://images.unsplash.com/photo-1541643600914-78b084683702?w=500'], rating: 4.8, numReviews: 40, tags: ['perfume', 'floral', 'luxury'] },
    { title: 'Yoga Leggings', category: 'Sports', description: 'High-waist compression leggings with moisture-wicking fabric. Four-way stretch for full range of motion.', price: 44.99, stock: 60, images: ['https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=500'], rating: 4.6, numReviews: 88, tags: ['yoga', 'leggings', 'sport', 'women'] },
  ];

  for (const p of products) {
    const sellerDoc = Math.random() > 0.5 ? seller : seller2;
    await Product.create({ ...p, seller: sellerDoc._id, sellerName: sellerDoc.sellerInfo.shopName });
  }

  await Coupon.create([
    { code: 'WELCOME10', description: '10% off your first order', type: 'percentage', value: 10, minOrderAmount: 20, validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    { code: 'SAVE20', description: '$20 off orders over $100', type: 'fixed', value: 20, minOrderAmount: 100, validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
    { code: 'SUMMER25', description: '25% off summer collection', type: 'percentage', value: 25, maxDiscount: 50, validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  ]);

  console.log('✅ Seed complete');
  console.log('Admin: admin@surajcommerce.com / admin123');
  console.log('Seller: seller@surajcommerce.com / seller123');
  console.log('Customer: customer@surajcommerce.com / customer123');
  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
