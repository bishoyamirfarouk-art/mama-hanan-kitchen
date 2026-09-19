const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const fileUpload = require('express-fileupload');
const jwt = require('jsonwebtoken');
const serverless = require('serverless-http');
require('dotenv').config();

const app = express();
const ROOT = path.join(__dirname, '..');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ useTempFiles: true, tempFileDir: '/tmp', limits: { fileSize: 8 * 1024 * 1024 } }));

const hasCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

let connectionPromise = null;
async function ensureDBConnection() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      dbName: process.env.MONGODB_DB_NAME || 'mama_hanan_kitchen',
      serverSelectionTimeoutMS: 12000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 12000
    }).then(async () => {
      await initAdminFromEnv();
      await ensureInitialContent();
    }).catch(err => {
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, original] = String(stored || '').split(':');
  if (!salt || !original) return false;
  const current = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(original, 'hex');
  return current.length === originalBuffer.length && crypto.timingSafeEqual(current, originalBuffer);
}
function cleanString(v, max = 500) { return String(v ?? '').trim().slice(0, max); }
function slugify(value) {
  return cleanString(value, 120)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\u0600-\u06ff\w\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const adminUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'manager' },
  permissions: { type: [String], default: ['all'] },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema);

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  image: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 }
}, { _id: false });

const productSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  category: { type: String, required: true, trim: true, index: true },
  shortDescription: { type: String, default: '' },
  description: { type: String, default: '' },
  mainImage: { type: String, required: true },
  mainImagePublicId: { type: String, default: '' },
  additionalImages: [{ url: String, publicId: String }],
  variants: { type: [variantSchema], default: [] },
  price: { type: Number, required: true, min: 0 },
  oldPrice: { type: Number, min: 0 },
  offerLabel: { type: String, default: '' },
  offerExpiresAt: { type: Date, default: null },
  isAvailable: { type: Boolean, default: true },
  availableToday: { type: Boolean, default: true, index: true },
  featured: { type: Boolean, default: false, index: true },
  isHidden: { type: Boolean, default: false, index: true },
  preparationTime: { type: String, default: '' },
  serves: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
productSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

const gallerySchema = new mongoose.Schema({
  image: { type: String, required: true },
  cloudinaryPublicId: { type: String, default: '' },
  title: { type: String, default: '' },
  category: { type: String, default: 'الكل', index: true },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now }
});
const Gallery = mongoose.models.Gallery || mongoose.model('Gallery', gallerySchema);

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  storeName: { type: String, default: 'مطبخ ماما حنان' },
  tagline: { type: String, default: 'أكل بيتي بطعم زمان' },
  heroTitle: { type: String, default: 'أكل بيتي بطعم زمان' },
  heroSubtitle: { type: String, default: 'وصفات أصيلة، مكونات طازة، وأكل بيتعمل مخصوص علشان يوصلك بنفس إحساس لمة البيت.' },
  heroImage: { type: String, default: '/assets/brand/hero-home.webp' },
  storeLogo: { type: String, default: '/assets/brand/logo-horizontal.png' },
  whatsappNumber: { type: String, default: '' },
  whatsappGroupUrl: { type: String, default: 'https://chat.whatsapp.com/KNTdkIdvpmAE4xasykWImf?s=sh&p=a&mlu=0&ilr=4' },
  phoneNumber: { type: String, default: '01211377826' },
  address: { type: String, default: '' },
  googleMapsUrl: { type: String, default: '' },
  openingHours: { type: String, default: '' },
  facebookUrl: { type: String, default: '' },
  instagramUrl: { type: String, default: '' },
  tiktokUrl: { type: String, default: '' },
  deliveryEnabled: { type: Boolean, default: true },
  pickupEnabled: { type: Boolean, default: true },
  deliveryFee: { type: Number, default: 0 },
  minimumOrder: { type: Number, default: 0 },
  currency: { type: String, default: 'ج.م' },
  updatedAt: { type: Date, default: Date.now }
});
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  title: { type: String, required: true },
  selectedVariant: { type: String, default: '' },
  unitPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  lineTotal: { type: Number, required: true, min: 0 },
  notes: { type: String, default: '' }
}, { _id: false });
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerAddress: { type: String, default: '' },
  area: { type: String, default: '' },
  notes: { type: String, default: '' },
  fulfillment: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },
  items: { type: [orderItemSchema], required: true },
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: { type: String, enum: ['new', 'contacted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'], default: 'new', index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

const reviewSchema = new mongoose.Schema({
  name: { type: String, required: true },
  text: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);

const analyticsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  totalVisits: { type: Number, default: 0 },
  productViews: { type: Object, default: {} },
  cartAdds: { type: Object, default: {} },
  pageVisits: { type: Object, default: {} },
  orderStarts: { type: Number, default: 0 },
  whatsappOpens: { type: Number, default: 0 },
  dailyVisits: { type: Object, default: {} },
  updatedAt: { type: Date, default: Date.now }
});
const Analytics = mongoose.models.Analytics || mongoose.model('Analytics', analyticsSchema);

const activityLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  details: { type: String, default: '' },
  user: { type: String, default: 'system' },
  createdAt: { type: Date, default: Date.now, index: true }
});
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

const BRAND_DEFAULTS = Object.freeze({
  storeName: 'مطبخ ماما حنان',
  tagline: 'أكل بيتي بطعم زمان',
  heroTitle: 'أكل بيتي بطعم زمان',
  heroSubtitle: 'وصفات أصيلة، مكونات طازة، وأكل بيتعمل مخصوص علشان يوصلك بنفس إحساس لمة البيت.',
  heroImage: '/assets/brand/hero-home.webp',
  storeLogo: '/assets/brand/logo-horizontal.png',
  phoneNumber: '01211377826',
  whatsappGroupUrl: 'https://chat.whatsapp.com/KNTdkIdvpmAE4xasykWImf?s=sh&p=a&mlu=0&ilr=4'
});

async function initAdminFromEnv() {
  const username = cleanString(process.env.ADMIN_USERNAME, 80);
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!username || !password) return;
  const existing = await AdminUser.findOne({ username });
  if (!existing) {
    await AdminUser.create({ username, passwordHash: hashPassword(password), role: 'owner', permissions: ['all'] });
    return;
  }
  // Environment Variables are the source of truth for the bootstrap admin.
  // Changing ADMIN_PASSWORD in Vercel and redeploying updates this account safely.
  if (!verifyPassword(password, existing.passwordHash)) {
    existing.passwordHash = hashPassword(password);
    existing.role = 'owner';
    existing.permissions = ['all'];
    existing.isActive = true;
    await existing.save();
  }
}

async function ensureInitialContent() {
  const settings = await Settings.findOne({ key: 'main' });
  if (!settings) {
    await Settings.create({ key: 'main', ...BRAND_DEFAULTS });
  } else {
    const update = {};
    if (!settings.storeName || settings.storeName === 'بيت ومشويات') update.storeName = BRAND_DEFAULTS.storeName;
    if (!settings.tagline || settings.tagline === 'طعم البيت... معمول بحب') update.tagline = BRAND_DEFAULTS.tagline;
    if (!settings.heroTitle || settings.heroTitle.includes('طعم البيت')) update.heroTitle = BRAND_DEFAULTS.heroTitle;
    if (!settings.heroSubtitle || settings.heroSubtitle.includes('أكل بيتي طازة يوميًا')) update.heroSubtitle = BRAND_DEFAULTS.heroSubtitle;
    if (!settings.heroImage || settings.heroImage === '/assets/food/meal.svg') update.heroImage = BRAND_DEFAULTS.heroImage;
    if (!settings.storeLogo || settings.storeLogo === '/assets/food/logo.svg') update.storeLogo = BRAND_DEFAULTS.storeLogo;
    if (!settings.phoneNumber) update.phoneNumber = BRAND_DEFAULTS.phoneNumber;
    if (!settings.whatsappGroupUrl) update.whatsappGroupUrl = BRAND_DEFAULTS.whatsappGroupUrl;
    if (Object.keys(update).length) {
      update.updatedAt = new Date();
      await Settings.updateOne({ _id: settings._id }, { $set: update });
    }
  }

  if (await Category.countDocuments() === 0) {
    await Category.insertMany([
      { name:'مشويات', slug:'grills', image:'/assets/food/photos/grill.webp', sortOrder:1 },
      { name:'محاشي', slug:'mahshi', image:'/assets/food/photos/mahshi.webp', sortOrder:2 },
      { name:'طواجن', slug:'tajin', image:'/assets/food/photos/tajin.webp', sortOrder:3 },
      { name:'أكل بيتي', slug:'home-food', image:'/assets/food/photos/chicken.webp', sortOrder:4 },
      { name:'مخبوزات', slug:'bakery', image:'/assets/food/photos/feteer.webp', sortOrder:5 },
      { name:'حلويات', slug:'dessert', image:'/assets/food/photos/dessert.webp', sortOrder:6 }
    ]);
  }

  if (await Product.countDocuments() === 0) {
    await Product.insertMany([
      { title:'مشويات مشكلة', slug:'mixed-grills', category:'مشويات', shortDescription:'تشكيلة مشويات بتتبيلة ماما حنان مع إضافات البيت.', mainImage:'/assets/food/photos/grill.webp', price:220, oldPrice:250, offerLabel:'عرض اليوم', variants:[{name:'نصف كيلو',price:220},{name:'كيلو',price:420}], availableToday:true, featured:true, isAvailable:true, preparationTime:'45-60 دقيقة', serves:'2-4 أفراد', sortOrder:1 },
      { title:'محشي مشكل', slug:'mixed-mahshi', category:'محاشي', shortDescription:'ورق عنب وكوسة وفلفل بخلطة بيتي ووصفة أصيلة.', mainImage:'/assets/food/photos/mahshi.webp', price:160, variants:[{name:'نصف كيلو',price:160},{name:'كيلو',price:300}], availableToday:true, featured:true, isAvailable:true, preparationTime:'60 دقيقة', serves:'2-3 أفراد', sortOrder:2 },
      { title:'طاجن لحمة بالخضار', slug:'meat-tajin', category:'طواجن', shortDescription:'طاجن لحمة بصوص غني وخضار طازة بطعم البيت.', mainImage:'/assets/food/photos/tajin.webp', price:180, variants:[{name:'فرد',price:180},{name:'صينية كبيرة',price:520}], availableToday:true, featured:true, isAvailable:true, preparationTime:'50 دقيقة', serves:'1-4 أفراد', sortOrder:3 },
      { title:'وجبة فراخ بيتي', slug:'home-chicken-meal', category:'أكل بيتي', shortDescription:'وجبة كاملة بفراخ وتتبيلة البيت وإضافات اليوم.', mainImage:'/assets/food/photos/chicken.webp', price:145, variants:[{name:'فرد',price:145},{name:'وجبة عائلية',price:480}], availableToday:true, featured:true, isAvailable:true, preparationTime:'35-45 دقيقة', serves:'1-4 أفراد', sortOrder:4 },
      { title:'فطير بيتي', slug:'home-feteer', category:'مخبوزات', shortDescription:'فطير طازة مناسب للفطار أو العزومات.', mainImage:'/assets/food/photos/feteer.webp', price:120, variants:[{name:'قطعة',price:120}], availableToday:true, featured:false, isAvailable:true, preparationTime:'30 دقيقة', serves:'2 أفراد', sortOrder:5 },
      { title:'حلو اليوم', slug:'dessert-of-the-day', category:'حلويات', shortDescription:'اختيار يومي من حلويات البيت.', mainImage:'/assets/food/photos/dessert.webp', price:90, variants:[{name:'علبة',price:90},{name:'علبة كبيرة',price:160}], availableToday:true, featured:false, isAvailable:true, preparationTime:'حسب المتاح', sortOrder:6 }
    ]);
  }

  if (await Gallery.countDocuments() === 0) {
    await Gallery.insertMany([
      { image:'/assets/food/photos/chicken.webp', title:'من أكل البيت', category:'أكل بيتي', sortOrder:1 },
      { image:'/assets/food/photos/mahshi.webp', title:'محاشي ماما حنان', category:'محاشي', sortOrder:2 },
      { image:'/assets/food/photos/grill.webp', title:'مشويات', category:'مشويات', sortOrder:3 },
      { image:'/assets/food/photos/tajin.webp', title:'طواجن', category:'طواجن', sortOrder:4 },
      { image:'/assets/food/photos/feteer.webp', title:'تجهيز عزومات', category:'عزومات', sortOrder:5 },
      { image:'/assets/food/photos/dessert.webp', title:'حلويات البيت', category:'حلويات', sortOrder:6 }
    ]);
  }

  // Replace only our original local SVG placeholders. Any image uploaded from Admin/Cloudinary is left untouched.
  const placeholderImageMap = {
    '/assets/food/grill.svg':'/assets/food/photos/grill.webp',
    '/assets/food/mahshi.svg':'/assets/food/photos/mahshi.webp',
    '/assets/food/tajin.svg':'/assets/food/photos/tajin.webp',
    '/assets/food/home.svg':'/assets/food/photos/chicken.webp',
    '/assets/food/bakery.svg':'/assets/food/photos/feteer.webp',
    '/assets/food/dessert.svg':'/assets/food/photos/dessert.webp',
    '/assets/food/gallery1.svg':'/assets/food/photos/chicken.webp',
    '/assets/food/gallery2.svg':'/assets/food/photos/feteer.webp',
    '/assets/food/gallery3.svg':'/assets/food/photos/dessert.webp'
  };
  await Promise.all(Object.entries(placeholderImageMap).flatMap(([oldPath,newPath]) => [
    Product.updateMany({ mainImage: oldPath }, { $set: { mainImage: newPath, updatedAt: new Date() } }),
    Category.updateMany({ image: oldPath }, { $set: { image: newPath } }),
    Gallery.updateMany({ image: oldPath }, { $set: { image: newPath, updatedAt: new Date() } })
  ]));

  if (await Review.countDocuments() === 0) {
    await Review.insertMany([
      { name:'عميلة ماما حنان', text:'الأكل وصل مرتب وساخن والطعم بيتي فعلًا.', rating:5, sortOrder:1 },
      { name:'طلب عزومة', text:'الكميات كانت مناسبة والتجهيز منظم والطعم ممتاز.', rating:5, sortOrder:2 },
      { name:'عميل متكرر', text:'سهولة الطلب ممتازة ومنيو اليوم واضحة جدًا.', rating:5, sortOrder:3 }
    ]);
  }
}

async function getSettings() {
  const doc = await Settings.findOneAndUpdate(
    { key: 'main' },
    { $setOnInsert: { key: 'main', ...BRAND_DEFAULTS } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return doc;
}
async function logActivity(action, details, user = 'system') {
  try { await ActivityLog.create({ action, details, user }); } catch (_) {}
}
function signToken(user) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ sub: user._id.toString(), username: user.username, role: user.role, permissions: user.permissions }, process.env.JWT_SECRET, { expiresIn: '12h' });
}
async function auth(req, res, next) {
  try {
    if (!process.env.JWT_SECRET) return res.status(503).json({ error: 'Admin authentication is not configured' });
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    await ensureDBConnection();
    const user = await AdminUser.findById(payload.sub).lean();
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid account' });
    req.user = user;
    next();
  } catch (err) { return res.status(401).json({ error: 'Invalid or expired session' }); }
}

function api(handler) {
  return async (req, res, next) => {
    try { await ensureDBConnection(); await handler(req, res, next); }
    catch (err) {
      console.error(err);
      const status = /not configured/i.test(err.message) ? 503 : 500;
      res.status(status).json({ error: status === 503 ? err.message : 'Server error' });
    }
  };
}

app.get('/api/health', async (req, res) => {
  let db = 'disconnected';
  if (process.env.MONGODB_URI) {
    try { await ensureDBConnection(); db = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'; } catch (_) { db = 'error'; }
  }
  res.json({ ok: true, database: db, cloudinary: hasCloudinary ? 'configured' : 'not_configured', environment: process.env.VERCEL ? 'production' : 'development' });
});

app.post('/api/auth/login', api(async (req, res) => {
  const username = cleanString(req.body.username, 80);
  const password = String(req.body.password || '');
  const user = await AdminUser.findOne({ username });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  await logActivity('login', 'Admin login', username);
  res.json({ token: signToken(user), user: { username: user.username, role: user.role, permissions: user.permissions } });
}));
app.get('/api/auth/me', auth, (req, res) => res.json({ username: req.user.username, role: req.user.role, permissions: req.user.permissions }));

app.get('/api/settings', api(async (req, res) => res.json(await getSettings())));
app.put('/api/settings', auth, api(async (req, res) => {
  const allowed = ['storeName','tagline','heroTitle','heroSubtitle','heroImage','storeLogo','whatsappNumber','whatsappGroupUrl','phoneNumber','address','googleMapsUrl','openingHours','facebookUrl','instagramUrl','tiktokUrl','deliveryEnabled','pickupEnabled','deliveryFee','minimumOrder','currency'];
  const update = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
  update.updatedAt = new Date();
  const doc = await Settings.findOneAndUpdate({ key: 'main' }, { $set: update, $setOnInsert: { key: 'main' } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  await logActivity('settings_update', 'Store settings updated', req.user.username);
  res.json(doc);
}));

app.get('/api/categories', api(async (req, res) => {
  res.json(await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean());
}));
app.get('/api/admin/categories', auth, api(async (req, res) => {
  res.json(await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean());
}));
app.post('/api/categories', auth, api(async (req, res) => {
  const name = cleanString(req.body.name, 100); if (!name) return res.status(400).json({ error: 'اسم القسم مطلوب' });
  const slug = slugify(req.body.slug || name) || `category-${Date.now()}`;
  const doc = await Category.create({ name, slug, image: cleanString(req.body.image, 1000), sortOrder: Number(req.body.sortOrder || 0), isActive: req.body.isActive !== false });
  await logActivity('category_create', name, req.user.username); res.status(201).json(doc);
}));
app.put('/api/categories/:id', auth, api(async (req, res) => {
  const update = { ...req.body }; delete update._id; delete update.createdAt;
  if (update.name) update.name = cleanString(update.name, 100);
  if (update.slug) update.slug = slugify(update.slug);
  const doc = await Category.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ error: 'القسم غير موجود' }); res.json(doc);
}));
app.delete('/api/categories/:id', auth, api(async (req, res) => {
  const doc = await Category.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'القسم غير موجود' }); res.json({ ok: true });
}));

app.get('/api/products', api(async (req, res) => {
  const filter = { isHidden: false };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.featured === '1') filter.featured = true;
  if (req.query.today === '1') filter.availableToday = true;
  if (req.query.q) filter.$or = [
    { title: new RegExp(escapeRegex(req.query.q), 'i') },
    { shortDescription: new RegExp(escapeRegex(req.query.q), 'i') }
  ];
  res.json(await Product.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean());
}));
app.get('/api/admin/products', auth, api(async (req, res) => {
  res.json(await Product.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean());
}));
app.get('/api/products/:id', api(async (req, res) => {
  const doc = await Product.findOne({ _id: req.params.id, isHidden: false }).lean(); if (!doc) return res.status(404).json({ error: 'الوجبة غير موجودة' }); res.json(doc);
}));
app.post('/api/products', auth, api(async (req, res) => {
  const title = cleanString(req.body.title, 160); const category = cleanString(req.body.category, 100);
  if (!title || !category || !req.body.mainImage) return res.status(400).json({ error: 'الاسم والقسم والصورة مطلوبون' });
  const variants = Array.isArray(req.body.variants) ? req.body.variants.filter(v => v && v.name && Number(v.price) >= 0).map(v => ({ name: cleanString(v.name, 80), price: Number(v.price) })) : [];
  const basePrice = Number(req.body.price ?? variants[0]?.price ?? 0);
  const doc = await Product.create({ ...req.body, title, category, slug: slugify(req.body.slug || title) || `meal-${Date.now()}`, variants, price: basePrice, updatedAt: new Date() });
  await logActivity('product_create', title, req.user.username); res.status(201).json(doc);
}));
app.put('/api/products/:id', auth, api(async (req, res) => {
  const update = { ...req.body, updatedAt: new Date() }; delete update._id; delete update.createdAt;
  if (update.title) update.title = cleanString(update.title, 160);
  if (update.slug) update.slug = slugify(update.slug);
  if (Array.isArray(update.variants)) update.variants = update.variants.filter(v => v && v.name && Number(v.price) >= 0).map(v => ({ name: cleanString(v.name, 80), price: Number(v.price) }));
  const doc = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ error: 'الوجبة غير موجودة' }); await logActivity('product_update', doc.title, req.user.username); res.json(doc);
}));
app.delete('/api/products/:id', auth, api(async (req, res) => {
  const doc = await Product.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'الوجبة غير موجودة' });
  if (hasCloudinary && doc.mainImagePublicId) cloudinary.uploader.destroy(doc.mainImagePublicId).catch(() => {});
  await logActivity('product_delete', doc.title, req.user.username); res.json({ ok: true });
}));

app.get('/api/gallery', api(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category && req.query.category !== 'الكل') filter.category = req.query.category;
  res.json(await Gallery.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean());
}));
app.get('/api/admin/gallery', auth, api(async (req, res) => {
  res.json(await Gallery.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean());
}));
app.post('/api/gallery', auth, api(async (req, res) => {
  if (!req.body.image) return res.status(400).json({ error: 'الصورة مطلوبة' });
  const doc = await Gallery.create({ image: req.body.image, cloudinaryPublicId: cleanString(req.body.cloudinaryPublicId, 300), title: cleanString(req.body.title, 160), category: cleanString(req.body.category || 'الكل', 100), sortOrder: Number(req.body.sortOrder || 0), isActive: req.body.isActive !== false });
  res.status(201).json(doc);
}));
app.put('/api/gallery/:id', auth, api(async (req, res) => {
  const update = { ...req.body }; delete update._id; delete update.createdAt;
  const doc = await Gallery.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }); if (!doc) return res.status(404).json({ error: 'الصورة غير موجودة' }); res.json(doc);
}));
app.delete('/api/gallery/:id', auth, api(async (req, res) => {
  const doc = await Gallery.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'الصورة غير موجودة' });
  if (hasCloudinary && doc.cloudinaryPublicId) cloudinary.uploader.destroy(doc.cloudinaryPublicId).catch(() => {}); res.json({ ok: true });
}));

app.post('/api/upload', auth, api(async (req, res) => {
  if (!hasCloudinary) return res.status(503).json({ error: 'Cloudinary غير مربوط بعد' });
  const file = req.files?.image;
  if (!file) return res.status(400).json({ error: 'اختر صورة' });
  if (!/^image\//i.test(file.mimetype || '')) return res.status(400).json({ error: 'الملف يجب أن يكون صورة' });
  const folder = cleanString(req.body.folder || 'mama-hanan-kitchen/misc', 100).replace(/[^a-zA-Z0-9/_-]/g, '');
  const result = await cloudinary.uploader.upload(file.tempFilePath, { folder, resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] });
  res.json({ url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height });
}));

app.get('/api/reviews', api(async (req, res) => res.json(await Review.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).limit(12).lean())));

app.post('/api/orders', api(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!cleanString(req.body.customerName, 120) || !cleanString(req.body.customerPhone, 50) || items.length === 0) return res.status(400).json({ error: 'بيانات العميل والطلب مطلوبة' });
  const ids = items.map(i => i.productId).filter(id => mongoose.Types.ObjectId.isValid(id));
  const products = await Product.find({ _id: { $in: ids }, isHidden: false }).lean();
  const map = new Map(products.map(p => [String(p._id), p]));
  const safeItems = [];
  for (const item of items) {
    const product = map.get(String(item.productId)); if (!product || !product.isAvailable) continue;
    const variantName = cleanString(item.selectedVariant, 80);
    const variant = product.variants.find(v => v.name === variantName);
    const unitPrice = Number(variant ? variant.price : product.price);
    const quantity = Math.max(1, Math.min(99, Number(item.quantity || 1)));
    safeItems.push({ productId: product._id, title: product.title, selectedVariant: variant?.name || '', unitPrice, quantity, lineTotal: unitPrice * quantity, notes: cleanString(item.notes, 300) });
  }
  if (!safeItems.length) return res.status(400).json({ error: 'لا توجد أصناف متاحة في الطلب' });
  const settings = await getSettings();
  const subtotal = safeItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const fulfillment = req.body.fulfillment === 'pickup' ? 'pickup' : 'delivery';
  const deliveryFee = fulfillment === 'delivery' && settings.deliveryEnabled ? Number(settings.deliveryFee || 0) : 0;
  if (Number(settings.minimumOrder || 0) > 0 && subtotal < Number(settings.minimumOrder)) return res.status(400).json({ error: `الحد الأدنى للطلب ${settings.minimumOrder} ${settings.currency}` });
  const orderNumber = `MH-${Date.now().toString().slice(-8)}-${crypto.randomInt(10, 99)}`;
  const doc = await Order.create({ orderNumber, customerName: cleanString(req.body.customerName, 120), customerPhone: cleanString(req.body.customerPhone, 50), customerAddress: cleanString(req.body.customerAddress, 300), area: cleanString(req.body.area, 120), notes: cleanString(req.body.notes, 700), fulfillment, items: safeItems, subtotal, deliveryFee, total: subtotal + deliveryFee });
  await logActivity('order_create', orderNumber, 'customer');
  res.status(201).json({ orderNumber: doc.orderNumber, subtotal: doc.subtotal, deliveryFee: doc.deliveryFee, total: doc.total, status: doc.status, whatsappNumber: settings.whatsappNumber, currency: settings.currency });
}));
app.get('/api/orders', auth, api(async (req, res) => {
  const filter = {}; if (req.query.status) filter.status = req.query.status;
  res.json(await Order.find(filter).sort({ createdAt: -1 }).limit(250).lean());
}));
app.put('/api/orders/:id', auth, api(async (req, res) => {
  const allowedStatuses = ['new','contacted','preparing','out_for_delivery','delivered','cancelled'];
  if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
  const doc = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status, updatedAt: new Date() }, { new: true }); if (!doc) return res.status(404).json({ error: 'الطلب غير موجود' }); res.json(doc);
}));

app.post('/api/analytics/track', api(async (req, res) => {
  const type = cleanString(req.body.type, 40); const key = cleanString(req.body.key, 120);
  const today = new Date().toISOString().slice(0, 10);
  const inc = {};
  if (type === 'visit') {
    inc.totalVisits = 1;
    inc[`dailyVisits.${today}`] = 1;
    if (key) inc[`pageVisits.${key.replace(/[.$]/g, '_')}`] = 1;
  }
  if (type === 'product_view' && key) inc[`productViews.${key.replace(/[.$]/g, '_')}`] = 1;
  if (type === 'cart_add' && key) inc[`cartAdds.${key.replace(/[.$]/g, '_')}`] = 1;
  if (type === 'order_start') inc.orderStarts = 1;
  if (type === 'whatsapp_open') inc.whatsappOpens = 1;
  if (Object.keys(inc).length) await Analytics.findOneAndUpdate({ key: 'main' }, { $inc: inc, $set: { updatedAt: new Date() } }, { upsert: true, setDefaultsOnInsert: true });
  res.json({ ok: true });
}));
app.get('/api/analytics', auth, api(async (req, res) => {
  res.json(await Analytics.findOne({ key: 'main' }).lean() || { key: 'main' });
}));


app.get('/api/reports/summary', auth, api(async (req, res) => {
  const daysRaw = Number(req.query.days || 30);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 3650) : 30;
  const since = new Date(Date.now() - days * 86400000);
  const analytics = await Analytics.findOne({ key: 'main' }).lean() || {};
  const orders = await Order.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).lean();
  const validOrders = orders.filter(o => o.status !== 'cancelled');
  const revenue = validOrders.reduce((sum,o)=>sum+Number(o.total||0),0);
  const deliveredRevenue = orders.filter(o=>o.status==='delivered').reduce((sum,o)=>sum+Number(o.total||0),0);
  const statuses = {};
  for (const o of orders) statuses[o.status] = (statuses[o.status]||0)+1;
  const itemMap = new Map();
  for (const o of validOrders) for (const i of (o.items||[])) {
    const name = i.title || 'بدون اسم';
    const cur = itemMap.get(name) || { title:name, quantity:0, revenue:0 };
    cur.quantity += Number(i.quantity||0); cur.revenue += Number(i.lineTotal||0); itemMap.set(name,cur);
  }
  const topOrdered = [...itemMap.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,12);
  const topMap = obj => Object.entries(obj||{}).map(([title,count])=>({title, count:Number(count||0)})).sort((a,b)=>b.count-a.count).slice(0,12);
  const dailyVisits = Object.entries(analytics.dailyVisits||{}).filter(([date])=>new Date(date+'T00:00:00Z')>=since).sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,count:Number(count||0)}));
  res.json({
    periodDays: days,
    generatedAt: new Date().toISOString(),
    metrics: {
      totalVisits: Number(analytics.totalVisits||0),
      periodVisits: dailyVisits.reduce((sum,d)=>sum+d.count,0),
      cartAdds: Object.values(analytics.cartAdds||{}).reduce((sum,n)=>sum+Number(n||0),0),
      orderStarts: Number(analytics.orderStarts||0),
      whatsappOpens: Number(analytics.whatsappOpens||0),
      orders: orders.length,
      validOrders: validOrders.length,
      revenue,
      deliveredRevenue,
      averageOrder: validOrders.length ? revenue/validOrders.length : 0
    },
    statuses,
    topViews: topMap(analytics.productViews),
    topCartAdds: topMap(analytics.cartAdds),
    pageVisits: topMap(analytics.pageVisits),
    topOrdered,
    dailyVisits
  });
}));

app.get('/api/admin/dashboard', auth, api(async (req, res) => {
  const [products, categories, gallery, orders, newOrders, latestOrder] = await Promise.all([
    Product.countDocuments(), Category.countDocuments(), Gallery.countDocuments(), Order.countDocuments(), Order.countDocuments({ status: 'new' }), Order.findOne().sort({ createdAt: -1 }).lean()
  ]);
  res.json({ products, categories, gallery, orders, newOrders, latestOrder, cloud: { database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', cloudinary: hasCloudinary ? 'configured' : 'not_configured', pos: process.env.POS_API_KEY ? 'ready' : 'needs_key', environment: process.env.VERCEL ? 'production' : 'development' } });
}));


function posAuth(req, res, next) {
  const configured = String(process.env.POS_API_KEY || '');
  if (!configured) return res.status(503).json({ error: 'POS integration is not configured' });
  const supplied = String(req.headers['x-pos-key'] || '').trim() || String(req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
  if (!supplied) return res.status(401).json({ error: 'POS authentication required' });
  const a=Buffer.from(configured), b=Buffer.from(supplied);
  if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({ error: 'Invalid POS key' });
  next();
}

app.get('/api/pos/status', auth, (req,res)=>res.json({ configured:Boolean(process.env.POS_API_KEY), apiVersion:'v1', endpoints:['/api/pos/catalog','/api/pos/sync','/api/pos/orders/:id/status'] }));
app.get('/api/pos/catalog', posAuth, api(async (req,res)=>{
  const [products,categories,settings]=await Promise.all([
    Product.find({ isHidden:false }).sort({sortOrder:1,title:1}).lean(),
    Category.find({isActive:true}).sort({sortOrder:1,name:1}).lean(),
    getSettings()
  ]);
  res.json({ apiVersion:'v1', generatedAt:new Date().toISOString(), store:{ name:settings.storeName, currency:settings.currency }, categories, products });
}));
app.get('/api/pos/sync', posAuth, api(async (req,res)=>{
  const since = req.query.since && !Number.isNaN(Date.parse(req.query.since)) ? new Date(req.query.since) : new Date(0);
  const [products,orders]=await Promise.all([
    Product.find({ updatedAt:{ $gt:since } }).sort({updatedAt:1}).lean(),
    Order.find({ updatedAt:{ $gt:since } }).sort({updatedAt:1}).lean()
  ]);
  res.json({ apiVersion:'v1', serverTime:new Date().toISOString(), since:since.toISOString(), products, orders });
}));
app.patch('/api/pos/orders/:id/status', posAuth, api(async (req,res)=>{
  const allowedStatuses=['new','contacted','preparing','out_for_delivery','delivered','cancelled'];
  if(!allowedStatuses.includes(req.body.status)) return res.status(400).json({error:'Invalid order status'});
  const doc=await Order.findByIdAndUpdate(req.params.id,{status:req.body.status,updatedAt:new Date()},{new:true});
  if(!doc) return res.status(404).json({error:'Order not found'});
  await logActivity('pos_order_status', `${doc.orderNumber} -> ${req.body.status}`, 'pos');
  res.json(doc);
}));

app.get('/api/backup', auth, api(async (req, res) => {
  const [products,categories,gallery,settings,orders,reviews,analytics] = await Promise.all([Product.find().lean(),Category.find().lean(),Gallery.find().lean(),Settings.find().lean(),Order.find().lean(),Review.find().lean(),Analytics.find().lean()]);
  res.json({ version: 3, exportedAt: new Date().toISOString(), data: { products,categories,gallery,settings,orders,reviews,analytics } });
}));

app.post('/api/restore', auth, api(async (req, res) => {
  const payload = req.body?.data;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح' });
  const collections = [
    ['products', Product], ['categories', Category], ['gallery', Gallery],
    ['settings', Settings], ['orders', Order], ['reviews', Review], ['analytics', Analytics]
  ];
  for (const [key, Model] of collections) {
    if (!Array.isArray(payload[key])) continue;
    await Model.deleteMany({});
    if (payload[key].length) await Model.insertMany(payload[key], { ordered: false });
  }
  await logActivity('restore', 'Cloud data restored from backup; admin users were not changed', req.user.username);
  res.json({ ok: true });
}));

function sendStatic(file) { return (req, res) => res.sendFile(path.join(ROOT, file)); }
app.get('/products', sendStatic('products_page.html'));
app.get('/menu', sendStatic('products_page.html'));
app.get('/gallery', sendStatic('gallery.html'));
app.get('/services', sendStatic('services.html'));
app.get('/admin', sendStatic('admin.html'));

if (!process.env.VERCEL) {
  app.use(express.static(ROOT));
  app.get('/', sendStatic('index.html'));
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Food store running at http://localhost:${port}`));
}

module.exports = app;
module.exports.handler = serverless(app);
