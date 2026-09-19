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
      dbName: process.env.MONGODB_DB_NAME || 'home_food_store',
      serverSelectionTimeoutMS: 12000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 12000
    }).then(async () => {
      await initAdminFromEnv();
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
  storeName: { type: String, default: 'بيت ومشويات' },
  tagline: { type: String, default: 'طعم البيت... معمول بحب' },
  heroTitle: { type: String, default: 'طعم البيت... معمول بحب ❤️' },
  heroSubtitle: { type: String, default: 'أكل بيتي طازة يوميًا، مشويات، محاشي، طواجن وعزومات تتعمل مخصوص ليك.' },
  heroImage: { type: String, default: '/assets/food/meal.svg' },
  storeLogo: { type: String, default: '/assets/food/logo.svg' },
  whatsappNumber: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
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

async function initAdminFromEnv() {
  const username = cleanString(process.env.ADMIN_USERNAME, 80);
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!username || !password) return;
  const existing = await AdminUser.findOne({ username });
  if (!existing) {
    await AdminUser.create({ username, passwordHash: hashPassword(password), role: 'owner', permissions: ['all'] });
  }
}
async function getSettings() {
  return Settings.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
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
  const allowed = ['storeName','tagline','heroTitle','heroSubtitle','heroImage','storeLogo','whatsappNumber','phoneNumber','address','googleMapsUrl','openingHours','facebookUrl','instagramUrl','tiktokUrl','deliveryEnabled','pickupEnabled','deliveryFee','minimumOrder','currency'];
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
  const folder = cleanString(req.body.folder || 'food-store/misc', 100).replace(/[^a-zA-Z0-9/_-]/g, '');
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
  const orderNumber = `FD-${Date.now().toString().slice(-8)}-${crypto.randomInt(10, 99)}`;
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
  const inc = {}; inc[`dailyVisits.${today}`] = type === 'visit' ? 1 : 0;
  if (type === 'visit') inc.totalVisits = 1;
  if (type === 'product_view' && key) inc[`productViews.${key.replace(/\./g, '_')}`] = 1;
  if (type === 'cart_add' && key) inc[`cartAdds.${key.replace(/\./g, '_')}`] = 1;
  if (type === 'order_start') inc.orderStarts = 1;
  if (type === 'whatsapp_open') inc.whatsappOpens = 1;
  await Analytics.findOneAndUpdate({ key: 'main' }, { $inc: inc, $set: { updatedAt: new Date() } }, { upsert: true });
  res.json({ ok: true });
}));
app.get('/api/analytics', auth, api(async (req, res) => {
  res.json(await Analytics.findOne({ key: 'main' }).lean() || { key: 'main' });
}));

app.get('/api/admin/dashboard', auth, api(async (req, res) => {
  const [products, categories, gallery, orders, newOrders, latestOrder] = await Promise.all([
    Product.countDocuments(), Category.countDocuments(), Gallery.countDocuments(), Order.countDocuments(), Order.countDocuments({ status: 'new' }), Order.findOne().sort({ createdAt: -1 }).lean()
  ]);
  res.json({ products, categories, gallery, orders, newOrders, latestOrder, cloud: { database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', cloudinary: hasCloudinary ? 'configured' : 'not_configured', environment: process.env.VERCEL ? 'production' : 'development' } });
}));

app.get('/api/backup', auth, api(async (req, res) => {
  const [products,categories,gallery,settings,orders,reviews] = await Promise.all([Product.find().lean(),Category.find().lean(),Gallery.find().lean(),Settings.find().lean(),Order.find().lean(),Review.find().lean()]);
  res.json({ version: 1, exportedAt: new Date().toISOString(), data: { products,categories,gallery,settings,orders,reviews } });
}));

app.post('/api/restore', auth, api(async (req, res) => {
  const payload = req.body?.data;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح' });
  const collections = [
    ['products', Product], ['categories', Category], ['gallery', Gallery],
    ['settings', Settings], ['orders', Order], ['reviews', Review]
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
