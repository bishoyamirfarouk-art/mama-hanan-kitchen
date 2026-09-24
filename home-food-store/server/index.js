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

async function makeUniqueSlug(Model, rawValue, fallbackPrefix, excludeId = null) {
  const base = slugify(rawValue) || `${fallbackPrefix}-${Date.now()}`;
  let slug = base;
  let n = 2;
  const query = () => ({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
  while (await Model.exists(query())) slug = `${base}-${n++}`;
  return slug;
}

function apiError(err) {
  if (!err) return { status: 500, message: 'حدث خطأ غير متوقع في السيرفر' };
  if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600) return { status: err.statusCode, message: err.message || 'تعذر تنفيذ العملية' };
  if (/not configured/i.test(err.message || '')) return { status: 503, message: err.message };
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || '';
    if (field === 'slug') return { status: 409, message: 'يوجد عنصر بنفس الاسم. تم منع التكرار، جرّب الحفظ مرة أخرى أو غيّر الاسم.' };
    if (field === 'name') return { status: 409, message: 'الاسم مستخدم بالفعل.' };
    return { status: 409, message: 'هذه البيانات موجودة بالفعل.' };
  }
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return { status: 400, message: first?.message || 'راجع البيانات المدخلة.' };
  }
  if (err.name === 'CastError') return { status: 400, message: 'بيانات غير صحيحة.' };
  return { status: 500, message: `تعذر تنفيذ العملية${err?.message ? `: ${String(err.message).slice(0,160)}` : ''}` };
}

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
  imagePublicId: { type: String, default: '' },
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
productSchema.pre('save', function() { this.updatedAt = new Date(); });
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
  heroImagePublicId: { type: String, default: '' },
  storeLogo: { type: String, default: '/assets/brand/logo-horizontal.webp' },
  storeLogoPublicId: { type: String, default: '' },
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
  deliveryFee: { type: Number, default: 0, min: 0 },

  // Legacy field retained for backward compatibility with older Admin/Flutter builds.
  // New code mirrors discountAmount here but does not trust this value from clients.
  discount: { type: Number, default: 0, min: 0 },

  discountType: {
    type: String,
    enum: ['none', 'value', 'percent'],
    default: 'none'
  },
  discountValue: {
    type: Number,
    default: 0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  total: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['new', 'contacted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'], default: 'new', index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);


const ORDER_STATUSES = ['new','contacted','preparing','out_for_delivery','delivered','cancelled'];
const DISCOUNT_TYPES = ['none','value','percent'];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function currentDiscountState(order, subtotalOverride = null) {
  const source = order || {};
  const subtotal = money(subtotalOverride == null ? source.subtotal : subtotalOverride);
  const hasModernFields = hasOwn(source, 'discountType') || hasOwn(source, 'discountValue') || hasOwn(source, 'discountAmount');
  const legacy = Math.min(Math.max(0, money(source.discount || 0)), subtotal);
  const rawModernType = DISCOUNT_TYPES.includes(source.discountType) ? source.discountType : 'none';
  const rawModernValue = Math.max(0, money(source.discountValue || 0));
  const rawModernAmount = Math.max(0, money(source.discountAmount || 0));

  // Compatibility for the intermediate schema that had only `discount`.
  // This also handles Mongoose applying new defaults while hydrating an old document.
  const modernLooksEmpty = rawModernType === 'none' && rawModernValue === 0 && rawModernAmount === 0;
  if (!hasModernFields || (legacy > 0 && modernLooksEmpty)) {
    return legacy > 0
      ? { discountType: 'value', discountValue: legacy, discountAmount: legacy }
      : { discountType: 'none', discountValue: 0, discountAmount: 0 };
  }

  const discountType = rawModernType;
  let discountValue = rawModernValue;
  let discountAmount = rawModernAmount;

  if (discountType === 'none') {
    discountValue = 0;
    discountAmount = 0;
  } else if (discountType === 'percent') {
    discountValue = Math.min(discountValue, 100);
    discountAmount = Math.min(subtotal, money(subtotal * discountValue / 100));
  } else {
    discountAmount = Math.min(subtotal, discountAmount || discountValue);
    discountValue = discountAmount;
  }

  return { discountType, discountValue, discountAmount };
}

function calculateDiscountStrict(discountType, discountValue, subtotal) {
  const type = DISCOUNT_TYPES.includes(discountType) ? discountType : 'none';
  const value = Math.max(0, money(discountValue || 0));
  const safeSubtotal = Math.max(0, money(subtotal));

  if (type === 'none') return { discountType: 'none', discountValue: 0, discountAmount: 0 };
  if (type === 'percent') {
    if (value > 100) throw httpError(400, 'نسبة الخصم لا يمكن أن تتجاوز 100%');
    return { discountType: 'percent', discountValue: value, discountAmount: money(safeSubtotal * value / 100) };
  }
  if (value > safeSubtotal) throw httpError(400, 'قيمة الخصم لا يمكن أن تتجاوز إجمالي الأصناف');
  return { discountType: 'value', discountValue: value, discountAmount: value };
}

function serializeOrder(order) {
  const raw = order && typeof order.toObject === 'function' ? order.toObject() : { ...(order || {}) };
  const discountState = currentDiscountState(raw, raw.subtotal);
  return {
    ...raw,
    discountType: discountState.discountType,
    discountValue: discountState.discountValue,
    discountAmount: discountState.discountAmount,
    // Keep the legacy amount for old Admin/Flutter clients.
    discount: discountState.discountAmount
  };
}

function parseInvoiceDate(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const d = new Date(raw + suffix);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay && raw.length <= 10) d.setUTCHours(23, 59, 59, 999);
  return d;
}

function buildInvoiceFilter(query = {}) {
  const filter = {};
  if (query.status) {
    const status = cleanString(query.status, 40);
    if (!ORDER_STATUSES.includes(status)) throw httpError(400, 'حالة الفاتورة غير صحيحة');
    filter.status = status;
  }

  const date = cleanString(query.date, 20);
  const from = parseInvoiceDate(query.from || date, false);
  const to = parseInvoiceDate(query.to || date, true);
  if ((query.from || date) && !from) throw httpError(400, 'تاريخ البداية غير صحيح');
  if ((query.to || date) && !to) throw httpError(400, 'تاريخ النهاية غير صحيح');
  if (from && to && from > to) throw httpError(400, 'الفترة الزمنية غير صحيحة');
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const search = cleanString(query.search || query.q, 160);
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ orderNumber: rx }, { customerName: rx }, { customerPhone: rx }];
  }

  const customer = cleanString(query.customer, 160);
  if (customer) {
    const rx = new RegExp(escapeRegex(customer), 'i');
    filter.$and = [...(filter.$and || []), { $or: [{ customerName: rx }, { customerPhone: rx }] }];
  }

  const orderNumber = cleanString(query.orderNumber, 160);
  if (orderNumber) filter.orderNumber = new RegExp(escapeRegex(orderNumber), 'i');
  return filter;
}

function findExistingInvoiceItem(currentItems, usedIndexes, raw) {
  const incomingProductId = mongoose.Types.ObjectId.isValid(raw?.productId) ? String(raw.productId) : '';
  const incomingVariant = cleanString(raw?.selectedVariant, 80);
  const incomingTitle = cleanString(raw?.title, 180).toLowerCase();

  for (let index = 0; index < currentItems.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    const existing = currentItems[index] || {};
    const existingProductId = mongoose.Types.ObjectId.isValid(existing.productId) ? String(existing.productId) : '';
    const existingVariant = cleanString(existing.selectedVariant, 80);
    const existingTitle = cleanString(existing.title, 180).toLowerCase();

    const productMatch = incomingProductId && existingProductId && incomingProductId === existingProductId && incomingVariant === existingVariant;
    const legacyMatch = incomingTitle && incomingTitle === existingTitle && incomingVariant === existingVariant && (!incomingProductId || !existingProductId);
    if (productMatch || legacyMatch) {
      usedIndexes.add(index);
      return existing;
    }
  }
  return null;
}

async function buildAdminInvoiceItems(currentOrder, rawItems) {
  const incoming = Array.isArray(rawItems) ? rawItems : [];
  const currentItems = Array.isArray(currentOrder?.items) ? currentOrder.items.map(i => ({ ...(i?.toObject ? i.toObject() : i) })) : [];
  const productIds = [...new Set(incoming.map(i => i?.productId).filter(id => mongoose.Types.ObjectId.isValid(id)).map(String))];
  const products = productIds.length ? await Product.find({ _id: { $in: productIds } }).lean() : [];
  const productMap = new Map(products.map(p => [String(p._id), p]));
  const usedIndexes = new Set();
  const result = [];

  for (const raw of incoming) {
    const quantityRaw = Number(raw?.quantity ?? 1);
    if (!Number.isFinite(quantityRaw) || quantityRaw < 1) throw httpError(400, 'كمية الصنف غير صحيحة');
    const quantity = Math.min(999, Math.trunc(quantityRaw));
    const selectedVariant = cleanString(raw?.selectedVariant, 80);
    const notes = cleanString(raw?.notes, 300);
    const matched = findExistingInvoiceItem(currentItems, usedIndexes, { ...raw, selectedVariant });

    const validProductId = mongoose.Types.ObjectId.isValid(raw?.productId) ? String(raw.productId) : '';
    const product = validProductId ? productMap.get(validProductId) : null;

    let title = '';
    let unitPrice = 0;
    let productId = undefined;

    if (matched) {
      // Existing invoice line: preserve the historical selling price even if the catalog changed,
      // was hidden, became unavailable, or was later deleted from the catalog.
      title = cleanString(matched.title || raw?.title || product?.title, 180);
      unitPrice = Math.max(0, money(matched.unitPrice));
      if (mongoose.Types.ObjectId.isValid(matched.productId)) productId = matched.productId;
      else if (validProductId) productId = validProductId;
    } else {
      // New line: it must be a real current catalog item. Never trust unitPrice/title from Flutter.
      if (!validProductId || !product) throw httpError(400, 'لا يمكن إضافة صنف جديد غير موجود في المنيو الحالية');
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const variant = selectedVariant ? variants.find(v => String(v.name) === selectedVariant) : null;
      if (selectedVariant && variants.length && !variant) throw httpError(400, `الحجم "${selectedVariant}" غير موجود للصنف ${product.title}`);
      title = cleanString(product.title, 180);
      unitPrice = Math.max(0, money(variant ? variant.price : product.price));
      productId = product._id;
    }

    if (!title) throw httpError(400, 'اسم الصنف مطلوب');
    result.push({
      ...(productId ? { productId } : {}),
      title,
      selectedVariant,
      unitPrice,
      quantity,
      lineTotal: money(unitPrice * quantity),
      notes
    });
  }
  return result;
}

function normalizeStoredItems(items) {
  return (Array.isArray(items) ? items : []).map(item => {
    const raw = item?.toObject ? item.toObject() : item;
    const unitPrice = Math.max(0, money(raw?.unitPrice));
    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(raw?.quantity || 1))));
    return {
      ...(mongoose.Types.ObjectId.isValid(raw?.productId) ? { productId: raw.productId } : {}),
      title: cleanString(raw?.title, 180),
      selectedVariant: cleanString(raw?.selectedVariant, 80),
      unitPrice,
      quantity,
      lineTotal: money(unitPrice * quantity),
      notes: cleanString(raw?.notes, 300)
    };
  }).filter(i => i.title);
}

async function updateInvoiceFromAdmin(current, body) {
  const status = hasOwn(body, 'status') ? cleanString(body.status, 40) : current.status;
  if (!ORDER_STATUSES.includes(status)) throw httpError(400, 'حالة غير صحيحة');

  const itemsChanged = hasOwn(body, 'items');
  const safeItems = itemsChanged ? await buildAdminInvoiceItems(current, body.items) : normalizeStoredItems(current.items);
  if (!safeItems.length && status !== 'cancelled') throw httpError(400, 'يجب أن تحتوي الفاتورة على صنف واحد على الأقل، أو يتم إلغاؤها');

  const customerName = hasOwn(body, 'customerName') ? cleanString(body.customerName, 120) : cleanString(current.customerName, 120);
  const customerPhone = hasOwn(body, 'customerPhone') ? cleanString(body.customerPhone, 50) : cleanString(current.customerPhone, 50);
  if (!customerName || !customerPhone) throw httpError(400, 'اسم العميل ورقم الهاتف مطلوبان');

  const fulfillment = hasOwn(body, 'fulfillment')
    ? (body.fulfillment === 'pickup' ? 'pickup' : 'delivery')
    : (current.fulfillment === 'pickup' ? 'pickup' : 'delivery');

  const subtotal = money(safeItems.reduce((sum, item) => sum + money(item.lineTotal), 0));
  let deliveryFee = hasOwn(body, 'deliveryFee') ? Number(body.deliveryFee) : Number(current.deliveryFee || 0);
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) throw httpError(400, 'رسوم التوصيل غير صحيحة');
  deliveryFee = fulfillment === 'pickup' || safeItems.length === 0 ? 0 : money(deliveryFee);

  const existingDiscount = currentDiscountState(current, subtotal);
  let discountType;
  let discountValue;
  if (hasOwn(body, 'discountType') || hasOwn(body, 'discountValue')) {
    discountType = hasOwn(body, 'discountType') ? cleanString(body.discountType, 20) : existingDiscount.discountType;
    discountValue = hasOwn(body, 'discountValue') ? Number(body.discountValue) : existingDiscount.discountValue;
  } else if (hasOwn(body, 'discount')) {
    // Legacy clients used `discount` as a fixed amount.
    discountType = Number(body.discount || 0) > 0 ? 'value' : 'none';
    discountValue = Number(body.discount || 0);
  } else {
    discountType = existingDiscount.discountType;
    discountValue = existingDiscount.discountValue;
  }
  if (!DISCOUNT_TYPES.includes(discountType)) throw httpError(400, 'نوع الخصم غير صحيح');
  if (!Number.isFinite(Number(discountValue)) || Number(discountValue) < 0) throw httpError(400, 'قيمة الخصم غير صحيحة');

  const discount = safeItems.length === 0
    ? { discountType: 'none', discountValue: 0, discountAmount: 0 }
    : calculateDiscountStrict(discountType, discountValue, subtotal);
  const total = money(subtotal - discount.discountAmount + deliveryFee);
  if (total < 0) throw httpError(400, 'إجمالي الفاتورة لا يمكن أن يكون أقل من صفر');

  return {
    update: {
      customerName,
      customerPhone,
      customerAddress: hasOwn(body, 'customerAddress') ? cleanString(body.customerAddress, 300) : cleanString(current.customerAddress, 300),
      area: fulfillment === 'delivery' ? (hasOwn(body, 'area') ? cleanString(body.area, 120) : cleanString(current.area, 120)) : '',
      fulfillment,
      items: safeItems,
      notes: hasOwn(body, 'notes') ? cleanString(body.notes, 700) : cleanString(current.notes, 700),
      subtotal,
      deliveryFee,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmount: discount.discountAmount,
      discount: discount.discountAmount,
      total,
      status,
      updatedAt: new Date()
    },
    changes: {
      items: itemsChanged,
      discount: hasOwn(body, 'discountType') || hasOwn(body, 'discountValue') || hasOwn(body, 'discount'),
      deliveryFee: hasOwn(body, 'deliveryFee'),
      status: hasOwn(body, 'status') && body.status !== current.status
    }
  };
}

async function saveAdminInvoiceUpdate(current, body, username) {
  const { update, changes } = await updateInvoiceFromAdmin(current, body);
  const doc = await Order.findByIdAndUpdate(current._id, { $set: update }, { new: true, runValidators: true });
  if (!doc) throw httpError(404, 'الفاتورة غير موجودة');
  await logActivity('invoice_update', doc.orderNumber, username);
  if (changes.items) await logActivity('invoice_items_update', doc.orderNumber, username);
  if (changes.discount) await logActivity('invoice_discount_update', doc.orderNumber, username);
  if (changes.deliveryFee) await logActivity('invoice_delivery_fee_update', doc.orderNumber, username);
  if (changes.status) await logActivity('order_status', `${doc.orderNumber} -> ${doc.status}`, username);
  return doc;
}

const reviewSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  status: { type: String, enum: ['pending','approved','rejected'], default: 'approved', index: true },
  source: { type: String, enum: ['admin','customer'], default: 'admin' },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});
const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);

const serviceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '🍽️' },
  image: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  ctaLabel: { type: String, default: 'تواصل معنا' },
  ctaType: { type: String, enum: ['whatsapp','group','phone','menu','custom','none'], default: 'whatsapp' },
  ctaUrl: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Service = mongoose.models.Service || mongoose.model('Service', serviceSchema);

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


const deliveryAreaSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  fee: { type: Number, default: 0, min: 0 },
  minimumOrder: { type: Number, default: 0, min: 0 },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const DeliveryArea = mongoose.models.DeliveryArea || mongoose.model('DeliveryArea', deliveryAreaSchema);

const BRAND_DEFAULTS = Object.freeze({
  storeName: 'مطبخ ماما حنان',
  tagline: 'أكل بيتي بطعم زمان',
  heroTitle: 'أكل بيتي بطعم زمان',
  heroSubtitle: 'وصفات أصيلة، مكونات طازة، وأكل بيتعمل مخصوص علشان يوصلك بنفس إحساس لمة البيت.',
  heroImage: '/assets/brand/hero-home.webp',
  storeLogo: '/assets/brand/logo-horizontal.webp',
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
  // ADMIN_USERNAME / ADMIN_PASSWORD are bootstrap credentials only.
  // Once the account exists, password changes are managed from the authenticated API
  // and are not overwritten on every server cold start.
  let changed = false;
  if (existing.role !== 'owner') { existing.role = 'owner'; changed = true; }
  if (!Array.isArray(existing.permissions) || !existing.permissions.includes('all')) { existing.permissions = ['all']; changed = true; }
  if (!existing.isActive) { existing.isActive = true; changed = true; }
  if (changed) await existing.save();
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
    if (!settings.storeLogo || settings.storeLogo === '/assets/food/logo.svg' || settings.storeLogo === '/assets/brand/logo-horizontal.png') update.storeLogo = BRAND_DEFAULTS.storeLogo;
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

  if (await Service.countDocuments() === 0) {
    await Service.insertMany([
      { title:'عزومات وطلبات خاصة', description:'حدد عدد الأفراد، الأصناف والموعد، وننسق معاك الكميات المناسبة.', icon:'🎉', ctaLabel:'اطلب عرض', ctaType:'whatsapp', sortOrder:1 },
      { title:'اشتراكات أسبوعية', description:'وجبات منظمة لأيام الأسبوع للأفراد أو العائلات حسب الاتفاق.', icon:'📅', ctaLabel:'اسأل عن الاشتراك', ctaType:'whatsapp', sortOrder:2 },
      { title:'توصيل', description:'توصيل للمنزل برسوم حسب المنطقة ومكان الاستلام.', icon:'🛵', ctaLabel:'ابدأ طلبك', ctaType:'menu', sortOrder:3 },
      { title:'مناسبات', description:'تجهيز سفرة أو بوفيه منزلي لكميات أكبر وترتيب مناسب للمناسبة.', icon:'🎂', ctaLabel:'كلمنا', ctaType:'whatsapp', sortOrder:4 },
      { title:'وجبات شركات', description:'طلبات مجمعة ووجبات متكررة للفرق والمكاتب حسب الاتفاق.', icon:'🏢', ctaLabel:'اطلب التفاصيل', ctaType:'whatsapp', sortOrder:5 },
      { title:'طلبات مخصوصة', description:'لو محتاج تعديل أو صنف بكمية معينة، ابعت التفاصيل ونراجع إمكانية التنفيذ.', icon:'👩‍🍳', ctaLabel:'ابعت طلبك', ctaType:'whatsapp', sortOrder:6 }
    ]);
  }

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
      const out = apiError(err);
      res.status(out.status).json({ error: out.message });
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
app.get('/api/auth/me', auth, (req, res) => res.json({ id: req.user._id, username: req.user.username, role: req.user.role, permissions: req.user.permissions }));

function ownerOnly(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'هذه العملية متاحة لمالك النظام فقط' });
  next();
}

app.put('/api/auth/password', auth, api(async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' });
  const user = await AdminUser.findById(req.user._id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  user.passwordHash = hashPassword(newPassword);
  await user.save();
  await logActivity('password_change', 'User changed own password', user.username);
  res.json({ ok: true });
}));

app.get('/api/admin/users', auth, ownerOnly, api(async (req, res) => {
  const users = await AdminUser.find({}).select('-passwordHash').sort({ createdAt: 1 }).lean();
  res.json(users);
}));

app.post('/api/admin/users', auth, ownerOnly, api(async (req, res) => {
  const username = cleanString(req.body.username, 80);
  const password = String(req.body.password || '');
  const role = ['owner', 'manager'].includes(req.body.role) ? req.body.role : 'manager';
  if (username.length < 3) return res.status(400).json({ error: 'اسم المستخدم يجب ألا يقل عن 3 أحرف' });
  if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
  const exists = await AdminUser.exists({ username });
  if (exists) return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
  const user = await AdminUser.create({
    username,
    passwordHash: hashPassword(password),
    role,
    permissions: ['all'],
    isActive: true
  });
  await logActivity('admin_user_create', `${username} (${role})`, req.user.username);
  res.status(201).json({ _id: user._id, username: user.username, role: user.role, permissions: user.permissions, isActive: user.isActive, createdAt: user.createdAt });
}));

app.put('/api/admin/users/:id', auth, ownerOnly, api(async (req, res) => {
  const target = await AdminUser.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const isSelf = String(target._id) === String(req.user._id);
  if (Object.prototype.hasOwnProperty.call(req.body, 'isActive')) {
    if (isSelf && req.body.isActive === false) return res.status(400).json({ error: 'لا يمكنك تعطيل الحساب الذي تستخدمه حاليًا' });
    target.isActive = req.body.isActive !== false;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'role')) {
    const role = String(req.body.role || '');
    if (!['owner', 'manager'].includes(role)) return res.status(400).json({ error: 'صلاحية غير صحيحة' });
    if (isSelf && role !== 'owner') return res.status(400).json({ error: 'لا يمكنك خفض صلاحية حسابك الحالي' });
    target.role = role;
    target.permissions = ['all'];
  }
  await target.save();
  await logActivity('admin_user_update', `${target.username} (${target.role}) active=${target.isActive}`, req.user.username);
  res.json({ _id: target._id, username: target.username, role: target.role, permissions: target.permissions, isActive: target.isActive, createdAt: target.createdAt });
}));

app.put('/api/admin/users/:id/password', auth, ownerOnly, api(async (req, res) => {
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' });
  const target = await AdminUser.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  target.passwordHash = hashPassword(newPassword);
  await target.save();
  await logActivity('admin_user_password_reset', target.username, req.user.username);
  res.json({ ok: true });
}));

app.get('/api/settings', api(async (req, res) => res.json(await getSettings())));
app.put('/api/settings', auth, api(async (req, res) => {
  const allowed = ['storeName','tagline','heroTitle','heroSubtitle','heroImage','heroImagePublicId','storeLogo','storeLogoPublicId','whatsappNumber','whatsappGroupUrl','phoneNumber','address','googleMapsUrl','openingHours','facebookUrl','instagramUrl','tiktokUrl','deliveryEnabled','pickupEnabled','deliveryFee','minimumOrder','currency'];
  const current = await Settings.findOne({ key: 'main' }).lean();
  const update = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
  update.updatedAt = new Date();
  const doc = await Settings.findOneAndUpdate({ key: 'main' }, { $set: update, $setOnInsert: { key: 'main' } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  if (hasCloudinary && current) {
    if (current.heroImagePublicId && Object.prototype.hasOwnProperty.call(update,'heroImagePublicId') && current.heroImagePublicId !== update.heroImagePublicId) cloudinary.uploader.destroy(current.heroImagePublicId).catch(()=>{});
    if (current.storeLogoPublicId && Object.prototype.hasOwnProperty.call(update,'storeLogoPublicId') && current.storeLogoPublicId !== update.storeLogoPublicId) cloudinary.uploader.destroy(current.storeLogoPublicId).catch(()=>{});
  }
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
  const slug = await makeUniqueSlug(Category, req.body.slug || name, 'category');
  const doc = await Category.create({ name, slug, image: cleanString(req.body.image, 1000), imagePublicId: cleanString(req.body.imagePublicId, 300), sortOrder: Number(req.body.sortOrder || 0), isActive: req.body.isActive !== false });
  await logActivity('category_create', name, req.user.username); res.status(201).json(doc);
}));
app.put('/api/categories/:id', auth, api(async (req, res) => {
  const current = await Category.findById(req.params.id); if (!current) return res.status(404).json({ error: 'القسم غير موجود' });
  const update = { ...req.body }; delete update._id; delete update.createdAt;
  if (update.name) update.name = cleanString(update.name, 100);
  update.slug = await makeUniqueSlug(Category, update.slug || update.name || current.name, 'category', req.params.id);
  if (Object.prototype.hasOwnProperty.call(update,'image')) update.image = cleanString(update.image,1000);
  if (Object.prototype.hasOwnProperty.call(update,'imagePublicId')) update.imagePublicId = cleanString(update.imagePublicId,300);
  const oldPublicId = current.imagePublicId;
  const doc = await Category.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (hasCloudinary && oldPublicId && Object.prototype.hasOwnProperty.call(update,'imagePublicId') && oldPublicId !== update.imagePublicId) cloudinary.uploader.destroy(oldPublicId).catch(()=>{});
  await logActivity('category_update', doc.name, req.user.username); res.json(doc);
}));
app.delete('/api/categories/:id', auth, api(async (req, res) => {
  const doc = await Category.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'القسم غير موجود' });
  if (hasCloudinary && doc.imagePublicId) cloudinary.uploader.destroy(doc.imagePublicId).catch(()=>{});
  await logActivity('category_delete', doc.name, req.user.username); res.json({ ok: true });
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
  if (!title || !category || !cleanString(req.body.mainImage, 1200)) return res.status(400).json({ error: 'الاسم والقسم والصورة مطلوبون' });
  const variants = Array.isArray(req.body.variants) ? req.body.variants.filter(v => v && cleanString(v.name,80) && Number.isFinite(Number(v.price)) && Number(v.price) >= 0).map(v => ({ name: cleanString(v.name, 80), price: Number(v.price) })) : [];
  const basePrice = Number(req.body.price ?? variants[0]?.price ?? 0);
  if (!Number.isFinite(basePrice) || basePrice < 0) return res.status(400).json({ error: 'السعر الأساسي غير صحيح' });
  const slug = await makeUniqueSlug(Product, req.body.slug || title, 'meal');
  const additionalImages = Array.isArray(req.body.additionalImages) ? req.body.additionalImages.filter(x=>x&&x.url).map(x=>({url:cleanString(x.url,1200),publicId:cleanString(x.publicId,300)})) : [];
  const payload = { ...req.body, title, category, slug, variants, additionalImages, price: basePrice, mainImage:cleanString(req.body.mainImage,1200), mainImagePublicId:cleanString(req.body.mainImagePublicId,300), updatedAt: new Date() };
  if (payload.oldPrice === null || payload.oldPrice === '' || !Number.isFinite(Number(payload.oldPrice))) delete payload.oldPrice; else payload.oldPrice = Number(payload.oldPrice);
  const doc = await Product.create(payload);
  await logActivity('product_create', title, req.user.username); res.status(201).json(doc);
}));
app.put('/api/products/:id', auth, api(async (req, res) => {
  const current = await Product.findById(req.params.id); if (!current) return res.status(404).json({ error: 'الوجبة غير موجودة' });
  const update = { ...req.body, updatedAt: new Date() }; delete update._id; delete update.createdAt;
  if (update.title) update.title = cleanString(update.title, 160);
  if (Object.prototype.hasOwnProperty.call(update,'category')) update.category = cleanString(update.category,100);
  if (Object.prototype.hasOwnProperty.call(update,'mainImage')) { update.mainImage = cleanString(update.mainImage,1200); if (!update.mainImage) return res.status(400).json({ error: 'صورة الوجبة مطلوبة' }); }
  else if (!current.mainImage) return res.status(400).json({ error: 'صورة الوجبة مطلوبة' });
  update.slug = await makeUniqueSlug(Product, update.slug || update.title || current.title, 'meal', req.params.id);
  if (Array.isArray(update.variants)) update.variants = update.variants.filter(v => v && cleanString(v.name,80) && Number.isFinite(Number(v.price)) && Number(v.price) >= 0).map(v => ({ name: cleanString(v.name, 80), price: Number(v.price) }));
  if (Array.isArray(update.additionalImages)) update.additionalImages = update.additionalImages.filter(x=>x&&x.url).map(x=>({url:cleanString(x.url,1200),publicId:cleanString(x.publicId,300)}));
  if (Object.prototype.hasOwnProperty.call(update,'price')) { update.price=Number(update.price); if(!Number.isFinite(update.price)||update.price<0)return res.status(400).json({error:'السعر الأساسي غير صحيح'}); }
  if (Object.prototype.hasOwnProperty.call(update,'oldPrice')) {
    if (update.oldPrice === null || update.oldPrice === '') update.oldPrice = null;
    else { update.oldPrice=Number(update.oldPrice); if(!Number.isFinite(update.oldPrice)||update.oldPrice<0)return res.status(400).json({error:'السعر قبل الخصم غير صحيح'}); }
  }
  const oldMainId=current.mainImagePublicId||''; const newMainId=Object.prototype.hasOwnProperty.call(update,'mainImagePublicId')?cleanString(update.mainImagePublicId,300):oldMainId;
  const oldAdditional=(current.additionalImages||[]).map(x=>x.publicId).filter(Boolean); const newAdditional=Object.prototype.hasOwnProperty.call(update,'additionalImages')?(update.additionalImages||[]).map(x=>x.publicId).filter(Boolean):oldAdditional;
  const oldImageIds=[oldMainId,...oldAdditional].filter(Boolean); const newImageIds=[newMainId,...newAdditional].filter(Boolean);
  const doc = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (hasCloudinary) {
    [...new Set(oldImageIds)].filter(id=>!newImageIds.includes(id)).forEach(id=>cloudinary.uploader.destroy(id).catch(()=>{}));
  }
  await logActivity('product_update', doc.title, req.user.username); res.json(doc);
}));
app.delete('/api/products/:id', auth, api(async (req, res) => {
  const doc = await Product.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'الوجبة غير موجودة' });
  if (hasCloudinary) {
    if (doc.mainImagePublicId) cloudinary.uploader.destroy(doc.mainImagePublicId).catch(() => {});
    (doc.additionalImages||[]).map(x=>x.publicId).filter(Boolean).forEach(id=>cloudinary.uploader.destroy(id).catch(()=>{}));
  }
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
  const current=await Gallery.findById(req.params.id); if(!current)return res.status(404).json({error:'الصورة غير موجودة'});
  const update = { ...req.body }; delete update._id; delete update.createdAt;
  const oldPublicId=current.cloudinaryPublicId||'';
  const doc = await Gallery.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (hasCloudinary && oldPublicId && Object.prototype.hasOwnProperty.call(update,'cloudinaryPublicId') && oldPublicId !== update.cloudinaryPublicId) cloudinary.uploader.destroy(oldPublicId).catch(()=>{});
  await logActivity('gallery_update', doc.title||'صورة', req.user.username); res.json(doc);
}));
app.delete('/api/gallery/:id', auth, api(async (req, res) => {
  const doc = await Gallery.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'الصورة غير موجودة' });
  if (hasCloudinary && doc.cloudinaryPublicId) cloudinary.uploader.destroy(doc.cloudinaryPublicId).catch(() => {});
  await logActivity('gallery_delete', doc.title||'صورة', req.user.username); res.json({ ok: true });
}));

app.post('/api/upload', auth, api(async (req, res) => {
  if (!hasCloudinary) return res.status(503).json({ error: 'Cloudinary غير مربوط بعد' });
  const file = req.files?.image;
  if (!file) return res.status(400).json({ error: 'اختر صورة' });
  if (!/^image\//i.test(file.mimetype || '')) return res.status(400).json({ error: 'الملف يجب أن يكون صورة' });
  const folder = cleanString(req.body.folder || 'mama-hanan-kitchen/misc', 100).replace(/[^a-zA-Z0-9/_-]/g, '');
  const result = await cloudinary.uploader.upload(file.tempFilePath, {
    folder,
    resource_type: 'image',
    format: 'webp',
    transformation: [{ width: 1600, crop: 'limit', quality: 'auto:good' }]
  });
  res.json({ url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height, format: result.format || 'webp', bytes: result.bytes || 0 });
}));

app.delete('/api/media', auth, api(async (req,res)=>{
  const publicId=cleanString(req.body?.publicId,300);
  if(!publicId)return res.status(400).json({error:'معرف الصورة مطلوب'});
  if(!hasCloudinary)return res.status(503).json({error:'Cloudinary غير مربوط بعد'});
  const result=await cloudinary.uploader.destroy(publicId);
  await logActivity('media_delete', publicId, req.user.username);
  res.json({ok:true,result:result.result||'unknown'});
}));

app.get('/api/services', api(async (req,res)=>{
  res.json(await Service.find({isActive:true}).sort({sortOrder:1,createdAt:1}).lean());
}));
app.get('/api/admin/services', auth, api(async (req,res)=>{
  res.json(await Service.find({}).sort({sortOrder:1,createdAt:1}).lean());
}));
app.post('/api/services', auth, api(async (req,res)=>{
  const title=cleanString(req.body.title,140); if(!title)return res.status(400).json({error:'اسم الخدمة مطلوب'});
  const doc=await Service.create({title,description:cleanString(req.body.description,1000),icon:cleanString(req.body.icon||'🍽️',20),image:cleanString(req.body.image,1200),imagePublicId:cleanString(req.body.imagePublicId,300),ctaLabel:cleanString(req.body.ctaLabel||'تواصل معنا',80),ctaType:['whatsapp','group','phone','menu','custom','none'].includes(req.body.ctaType)?req.body.ctaType:'whatsapp',ctaUrl:cleanString(req.body.ctaUrl,1200),sortOrder:Number(req.body.sortOrder||0),isActive:req.body.isActive!==false,updatedAt:new Date()});
  await logActivity('service_create',title,req.user.username);res.status(201).json(doc);
}));
app.put('/api/services/:id', auth, api(async(req,res)=>{
  const current=await Service.findById(req.params.id);if(!current)return res.status(404).json({error:'الخدمة غير موجودة'});
  const update={...req.body,updatedAt:new Date()};delete update._id;delete update.createdAt;
  if(update.title)update.title=cleanString(update.title,140);if(Object.prototype.hasOwnProperty.call(update,'description'))update.description=cleanString(update.description,1000);if(Object.prototype.hasOwnProperty.call(update,'icon'))update.icon=cleanString(update.icon,20);if(Object.prototype.hasOwnProperty.call(update,'image'))update.image=cleanString(update.image,1200);if(Object.prototype.hasOwnProperty.call(update,'imagePublicId'))update.imagePublicId=cleanString(update.imagePublicId,300);if(Object.prototype.hasOwnProperty.call(update,'ctaLabel'))update.ctaLabel=cleanString(update.ctaLabel,80);if(Object.prototype.hasOwnProperty.call(update,'ctaUrl'))update.ctaUrl=cleanString(update.ctaUrl,1200);if(Object.prototype.hasOwnProperty.call(update,'sortOrder'))update.sortOrder=Number(update.sortOrder||0);if(update.ctaType&&!['whatsapp','group','phone','menu','custom','none'].includes(update.ctaType))update.ctaType='whatsapp';
  const oldPublicId=current.imagePublicId||'';const doc=await Service.findByIdAndUpdate(req.params.id,update,{new:true,runValidators:true});
  if(hasCloudinary&&oldPublicId&&Object.prototype.hasOwnProperty.call(update,'imagePublicId')&&oldPublicId!==update.imagePublicId)cloudinary.uploader.destroy(oldPublicId).catch(()=>{});
  await logActivity('service_update',doc.title,req.user.username);res.json(doc);
}));
app.delete('/api/services/:id', auth, api(async(req,res)=>{
  const doc=await Service.findByIdAndDelete(req.params.id);if(!doc)return res.status(404).json({error:'الخدمة غير موجودة'});
  if(hasCloudinary&&doc.imagePublicId)cloudinary.uploader.destroy(doc.imagePublicId).catch(()=>{});
  await logActivity('service_delete',doc.title,req.user.username);res.json({ok:true});
}));


app.get('/api/delivery-areas', api(async (req, res) => {
  res.json(await DeliveryArea.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean());
}));
app.get('/api/admin/delivery-areas', auth, api(async (req, res) => {
  res.json(await DeliveryArea.find({}).sort({ sortOrder: 1, name: 1 }).lean());
}));
app.post('/api/delivery-areas', auth, api(async (req, res) => {
  const name = cleanString(req.body.name, 120);
  if (!name) return res.status(400).json({ error: 'اسم منطقة التوصيل مطلوب' });
  const doc = await DeliveryArea.create({ name, fee: Math.max(0, Number(req.body.fee || 0)), minimumOrder: Math.max(0, Number(req.body.minimumOrder || 0)), sortOrder: Number(req.body.sortOrder || 0), isActive: req.body.isActive !== false, updatedAt: new Date() });
  await logActivity('delivery_area_create', name, req.user.username);
  res.status(201).json(doc);
}));
app.put('/api/delivery-areas/:id', auth, api(async (req, res) => {
  const update = { ...req.body, updatedAt: new Date() }; delete update._id; delete update.createdAt;
  if (update.name) update.name = cleanString(update.name, 120);
  if (Object.prototype.hasOwnProperty.call(update, 'fee')) update.fee = Math.max(0, Number(update.fee || 0));
  if (Object.prototype.hasOwnProperty.call(update, 'minimumOrder')) update.minimumOrder = Math.max(0, Number(update.minimumOrder || 0));
  if (Object.prototype.hasOwnProperty.call(update, 'sortOrder')) update.sortOrder = Number(update.sortOrder || 0);
  const doc = await DeliveryArea.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ error: 'منطقة التوصيل غير موجودة' });
  await logActivity('delivery_area_update', doc.name, req.user.username);
  res.json(doc);
}));
app.delete('/api/delivery-areas/:id', auth, api(async (req, res) => {
  const doc = await DeliveryArea.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: 'منطقة التوصيل غير موجودة' });
  await logActivity('delivery_area_delete', doc.name, req.user.username);
  res.json({ ok: true });
}));

app.get('/api/admin/activity', auth, api(async (req, res) => {
  const limit = Math.max(10, Math.min(200, Number(req.query.limit || 50)));
  res.json(await ActivityLog.find({}).sort({ createdAt: -1 }).limit(limit).lean());
}));

app.get('/api/reviews', api(async (req, res) => {
  const filter = { isActive: true, $or: [{ status: 'approved' }, { status: { $exists: false } }] };
  res.json(await Review.find(filter).sort({ sortOrder: 1, createdAt: -1 }).limit(12).lean());
}));
app.get('/api/admin/reviews', auth, api(async (req, res) => res.json(await Review.find({}).sort({ createdAt: -1, sortOrder: 1 }).lean())));

// Public customer review submission. Customer reviews always wait for admin approval.
app.post('/api/reviews/submit', api(async (req, res) => {
  const name = cleanString(req.body.name, 120);
  const text = cleanString(req.body.text, 700);
  const rating = Math.max(1, Math.min(5, Number(req.body.rating || 5)));
  const website = cleanString(req.body.website, 120); // honeypot
  if (website) return res.status(201).json({ ok: true, pending: true });
  if (name.length < 2) return res.status(400).json({ error: 'اكتب اسمك بشكل صحيح.' });
  if (text.length < 5) return res.status(400).json({ error: 'اكتب رأيك في 5 حروف على الأقل.' });
  const doc = await Review.create({ name, text, rating, status: 'pending', source: 'customer', isActive: false, sortOrder: 0, updatedAt: new Date() });
  await logActivity('review_submission', `رأي جديد بانتظار المراجعة من ${name}`, 'customer');
  res.status(201).json({ ok: true, pending: true, id: doc._id });
}));

app.post('/api/reviews', auth, api(async (req, res) => {
  const name=cleanString(req.body.name,120), text=cleanString(req.body.text,700); if(!name||!text)return res.status(400).json({error:'الاسم والرأي مطلوبان'});
  const status=['pending','approved','rejected'].includes(req.body.status)?req.body.status:'approved';
  const doc=await Review.create({name,text,rating:Math.max(1,Math.min(5,Number(req.body.rating||5))),sortOrder:Number(req.body.sortOrder||0),status,source:'admin',isActive:status==='approved'&&req.body.isActive!==false,updatedAt:new Date()});
  await logActivity('review_create', name, req.user.username); res.status(201).json(doc);
}));
app.put('/api/reviews/:id', auth, api(async (req,res)=>{
  const update={...req.body,updatedAt:new Date()};delete update._id;delete update.createdAt;if(update.name)update.name=cleanString(update.name,120);if(update.text)update.text=cleanString(update.text,700);if(Object.prototype.hasOwnProperty.call(update,'rating'))update.rating=Math.max(1,Math.min(5,Number(update.rating||5)));
  if(Object.prototype.hasOwnProperty.call(update,'status')&&!['pending','approved','rejected'].includes(update.status))return res.status(400).json({error:'حالة الرأي غير صحيحة'});
  if(update.status==='approved') update.isActive=true;
  if(update.status==='rejected') update.isActive=false;
  const doc=await Review.findByIdAndUpdate(req.params.id,update,{new:true,runValidators:true});if(!doc)return res.status(404).json({error:'الرأي غير موجود'});await logActivity('review_update',doc.name,req.user.username);res.json(doc);
}));
app.patch('/api/reviews/:id/moderate', auth, api(async (req,res)=>{
  const status=String(req.body.status||''); if(!['approved','rejected','pending'].includes(status))return res.status(400).json({error:'حالة المراجعة غير صحيحة'});
  const doc=await Review.findByIdAndUpdate(req.params.id,{status,isActive:status==='approved',updatedAt:new Date()},{new:true,runValidators:true});
  if(!doc)return res.status(404).json({error:'الرأي غير موجود'});
  await logActivity(status==='approved'?'review_approve':'review_moderate',`${doc.name} -> ${status}`,req.user.username);res.json(doc);
}));
app.delete('/api/reviews/:id', auth, api(async(req,res)=>{const doc=await Review.findByIdAndDelete(req.params.id);if(!doc)return res.status(404).json({error:'الرأي غير موجود'});await logActivity('review_delete',doc.name,req.user.username);res.json({ok:true});}));

app.post('/api/orders', api(async (req, res) => {
  // Public website checkout keeps the original strict catalog/availability rules.
  // Discount fields sent by the client are intentionally ignored here.
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!cleanString(req.body.customerName, 120) || !cleanString(req.body.customerPhone, 50) || items.length === 0) {
    return res.status(400).json({ error: 'بيانات العميل والطلب مطلوبة' });
  }

  const ids = items.map(i => i.productId).filter(id => mongoose.Types.ObjectId.isValid(id));
  const products = await Product.find({ _id: { $in: ids }, isHidden: false }).lean();
  const map = new Map(products.map(product => [String(product._id), product]));
  const safeItems = [];

  for (const item of items) {
    const product = map.get(String(item.productId));
    if (!product || !product.isAvailable) continue;

    const variantName = cleanString(item.selectedVariant, 80);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variantName ? variants.find(v => String(v.name) === variantName) : null;
    if (variantName && variants.length && !variant) continue;

    const unitPrice = Math.max(0, money(variant ? variant.price : product.price));
    const quantityRaw = Number(item.quantity || 1);
    const quantity = Math.max(1, Math.min(99, Number.isFinite(quantityRaw) ? Math.trunc(quantityRaw) : 1));
    safeItems.push({
      productId: product._id,
      title: product.title,
      selectedVariant: variant?.name || '',
      unitPrice,
      quantity,
      lineTotal: money(unitPrice * quantity),
      notes: cleanString(item.notes, 300)
    });
  }

  if (!safeItems.length) return res.status(400).json({ error: 'لا توجد أصناف متاحة في الطلب' });

  const settings = await getSettings();
  const subtotal = money(safeItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const fulfillment = req.body.fulfillment === 'pickup' ? 'pickup' : 'delivery';
  if (fulfillment === 'delivery' && settings.deliveryEnabled === false) return res.status(400).json({ error: 'التوصيل غير متاح حاليًا' });
  if (fulfillment === 'pickup' && settings.pickupEnabled === false) return res.status(400).json({ error: 'الاستلام من المكان غير متاح حاليًا' });

  let selectedArea = null;
  if (fulfillment === 'delivery' && mongoose.Types.ObjectId.isValid(req.body.areaId)) {
    selectedArea = await DeliveryArea.findOne({ _id: req.body.areaId, isActive: true }).lean();
  }
  const deliveryFee = fulfillment === 'delivery' && settings.deliveryEnabled
    ? Math.max(0, money(selectedArea?.fee ?? settings.deliveryFee ?? 0))
    : 0;
  const minimumOrder = Math.max(Number(settings.minimumOrder || 0), Number(selectedArea?.minimumOrder || 0));
  if (minimumOrder > 0 && subtotal < minimumOrder) return res.status(400).json({ error: `الحد الأدنى للطلب ${minimumOrder} ${settings.currency}` });

  const areaName = selectedArea?.name || cleanString(req.body.area, 120);
  const orderNumber = `MH-${Date.now().toString().slice(-8)}-${crypto.randomInt(10, 99)}`;
  const doc = await Order.create({
    orderNumber,
    customerName: cleanString(req.body.customerName, 120),
    customerPhone: cleanString(req.body.customerPhone, 50),
    customerAddress: cleanString(req.body.customerAddress, 300),
    area: areaName,
    notes: cleanString(req.body.notes, 700),
    fulfillment,
    items: safeItems,
    subtotal,
    deliveryFee,
    discountType: 'none',
    discountValue: 0,
    discountAmount: 0,
    discount: 0,
    total: money(subtotal + deliveryFee)
  });

  await logActivity('order_create', orderNumber, 'customer');
  const output = serializeOrder(doc);
  res.status(201).json({
    orderNumber: output.orderNumber,
    subtotal: output.subtotal,
    deliveryFee: output.deliveryFee,
    discountType: output.discountType,
    discountValue: output.discountValue,
    discountAmount: output.discountAmount,
    discount: output.discount,
    total: output.total,
    status: output.status,
    whatsappNumber: settings.whatsappNumber,
    currency: settings.currency
  });
}));

// Backward-compatible authenticated order listing. It still returns an array.
// Optional filters: status, date, from, to, search/q, customer, orderNumber, limit, page.
app.get('/api/orders', auth, api(async (req, res) => {
  const filter = buildInvoiceFilter(req.query);
  const limitRaw = Number(req.query.limit || 250);
  const pageRaw = Number(req.query.page || 1);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 250;
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const docs = await Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  res.json(docs.map(serializeOrder));
}));

// Rich paginated endpoint for the Flutter/Admin invoice screen.
app.get('/api/admin/invoices', auth, api(async (req, res) => {
  const filter = buildInvoiceFilter(req.query);
  const limitRaw = Number(req.query.limit || 100);
  const pageRaw = Number(req.query.page || 1);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const [total, docs] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
  ]);
  res.json({ page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), rows: docs.map(serializeOrder) });
}));

app.get('/api/admin/invoices/:id', auth, api(async (req, res) => {
  const doc = await Order.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  res.json(serializeOrder(doc));
}));

// Keep the historical endpoint working. Status-only updates retain their old behavior.
// Older Admin clients that already send invoice fields are also still supported.
app.put('/api/orders/:id', auth, api(async (req, res) => {
  const current = await Order.findById(req.params.id).lean();
  if (!current) return res.status(404).json({ error: 'الطلب غير موجود' });

  const editFields = [
    'items','customerName','customerPhone','customerAddress','area','notes','fulfillment',
    'deliveryFee','discount','discountType','discountValue'
  ];
  const isInvoiceEdit = editFields.some(key => hasOwn(req.body, key));

  if (!isInvoiceEdit) {
    if (!hasOwn(req.body, 'status')) return res.status(400).json({ error: 'لا توجد تعديلات للحفظ' });
    const status = cleanString(req.body.status, 40);
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'حالة غير صحيحة' });
    const doc = await Order.findByIdAndUpdate(req.params.id, { $set: { status, updatedAt: new Date() } }, { new: true, runValidators: true });
    await logActivity('order_status', `${doc.orderNumber} -> ${status}`, req.user.username);
    return res.json(serializeOrder(doc));
  }

  const doc = await saveAdminInvoiceUpdate(current, req.body, req.user.username);
  res.json(serializeOrder(doc));
}));

// Preferred full invoice editing endpoint for the new Flutter application.
app.put('/api/admin/orders/:id', auth, api(async (req, res) => {
  const current = await Order.findById(req.params.id).lean();
  if (!current) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  const doc = await saveAdminInvoiceUpdate(current, req.body || {}, req.user.username);
  res.json(serializeOrder(doc));
}));

async function deleteInvoice(req, res) {
  const doc = await Order.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  await logActivity('invoice_delete', doc.orderNumber, req.user.username);
  res.json({ ok: true, orderNumber: doc.orderNumber });
}

// Keep the old delete route for compatibility and provide the explicit Admin route too.
app.delete('/api/orders/:id', auth, api(deleteInvoice));
app.delete('/api/admin/orders/:id', auth, api(deleteInvoice));

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
  const validOrders = orders.filter(order => order.status !== 'cancelled');
  const deliveredOrders = orders.filter(order => order.status === 'delivered');

  const subtotalRevenue = money(validOrders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0));
  const totalDiscounts = money(validOrders.reduce((sum, order) => sum + currentDiscountState(order, order.subtotal).discountAmount, 0));
  const deliveryRevenue = money(validOrders.reduce((sum, order) => sum + Number(order.deliveryFee || 0), 0));
  const netRevenue = money(validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0));
  const deliveredRevenue = money(deliveredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0));

  const statuses = {};
  for (const order of orders) statuses[order.status] = (statuses[order.status] || 0) + 1;

  const itemMap = new Map();
  for (const order of validOrders) {
    for (const item of (order.items || [])) {
      const name = item.title || 'بدون اسم';
      const cur = itemMap.get(name) || { title: name, quantity: 0, revenue: 0 };
      cur.quantity += Number(item.quantity || 0);
      cur.revenue = money(cur.revenue + Number(item.lineTotal || 0));
      itemMap.set(name, cur);
    }
  }

  const topOrdered = [...itemMap.values()].sort((a,b) => b.quantity - a.quantity).slice(0,12);
  const topMap = obj => Object.entries(obj || {}).map(([title,count]) => ({ title, count:Number(count || 0) })).sort((a,b) => b.count - a.count).slice(0,12);
  const dailyVisits = Object.entries(analytics.dailyVisits || {})
    .filter(([date]) => new Date(date + 'T00:00:00Z') >= since)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([date,count]) => ({ date, count:Number(count || 0) }));

  res.json({
    periodDays: days,
    generatedAt: new Date().toISOString(),
    metrics: {
      totalVisits: Number(analytics.totalVisits || 0),
      periodVisits: dailyVisits.reduce((sum,d) => sum + d.count, 0),
      cartAdds: Object.values(analytics.cartAdds || {}).reduce((sum,n) => sum + Number(n || 0), 0),
      orderStarts: Number(analytics.orderStarts || 0),
      whatsappOpens: Number(analytics.whatsappOpens || 0),
      orders: orders.length,
      validOrders: validOrders.length,
      subtotalRevenue,
      totalDiscounts,
      deliveryRevenue,
      netRevenue,
      // Compatibility aliases used by the current Admin dashboard.
      revenue: netRevenue,
      deliveredRevenue,
      averageOrder: validOrders.length ? money(netRevenue / validOrders.length) : 0
    },
    statuses,
    topViews: topMap(analytics.productViews),
    topCartAdds: topMap(analytics.cartAdds),
    pageVisits: topMap(analytics.pageVisits),
    topOrdered,
    dailyVisits
  });
}));


app.get('/api/reports/full', auth, api(async (req, res) => {
  const now = new Date();
  const parseDate = (value, endOfDay = false) => {
    if (!value) return null;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay) d.setHours(23, 59, 59, 999); else d.setHours(0, 0, 0, 0);
    return d;
  };
  const defaultFrom = new Date(now.getTime() - 29 * 86400000); defaultFrom.setHours(0,0,0,0);
  const from = parseDate(req.query.from) || defaultFrom;
  const to = parseDate(req.query.to, true) || now;
  if (from > to) return res.status(400).json({ error: 'الفترة الزمنية غير صحيحة' });

  const orderFilter = { createdAt: { $gte: from, $lte: to } };
  const activityFilter = { createdAt: { $gte: from, $lte: to } };
  const reviewFilter = { createdAt: { $gte: from, $lte: to } };

  const [settings, orders, products, categories, services, deliveryAreas, gallery, reviews, analytics, activity] = await Promise.all([
    getSettings(),
    Order.find(orderFilter).sort({ createdAt: -1 }).limit(5000).lean(),
    Product.find({}).sort({ sortOrder: 1, title: 1 }).lean(),
    Category.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
    Service.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    DeliveryArea.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
    Gallery.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean(),
    Review.find(reviewFilter).sort({ createdAt: -1 }).limit(3000).lean(),
    Analytics.findOne({ key: 'main' }).lean() || {},
    ActivityLog.find(activityFilter).sort({ createdAt: -1 }).limit(3000).lean(),
  ]);

  const validOrders = orders.filter(o => o.status !== 'cancelled');
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const subtotalRevenue = money(validOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0));
  const totalDiscounts = money(validOrders.reduce((sum, o) => sum + currentDiscountState(o, o.subtotal).discountAmount, 0));
  const deliveryRevenue = money(validOrders.reduce((sum, o) => sum + Number(o.deliveryFee || 0), 0));
  const netRevenue = money(validOrders.reduce((sum, o) => sum + Number(o.total || 0), 0));
  const deliveredRevenue = money(deliveredOrders.reduce((sum, o) => sum + Number(o.total || 0), 0));
  const totalItems = validOrders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0), 0);

  const statuses = {};
  const fulfillment = { delivery: 0, pickup: 0 };
  const itemMap = new Map();
  const customerMap = new Map();
  const areaMap = new Map();
  const dailyMap = new Map();

  for (const o of orders) {
    statuses[o.status] = (statuses[o.status] || 0) + 1;
    fulfillment[o.fulfillment === 'pickup' ? 'pickup' : 'delivery'] += 1;
    const day = new Date(o.createdAt).toISOString().slice(0, 10);
    const d = dailyMap.get(day) || { date: day, orders: 0, validOrders: 0, subtotalRevenue: 0, totalDiscounts: 0, deliveryRevenue: 0, netRevenue: 0, revenue: 0 };
    d.orders += 1;
    if (o.status !== 'cancelled') {
      const orderDiscount = currentDiscountState(o, o.subtotal).discountAmount;
      d.validOrders += 1;
      d.subtotalRevenue = money(d.subtotalRevenue + Number(o.subtotal || 0));
      d.totalDiscounts = money(d.totalDiscounts + orderDiscount);
      d.deliveryRevenue = money(d.deliveryRevenue + Number(o.deliveryFee || 0));
      d.netRevenue = money(d.netRevenue + Number(o.total || 0));
      d.revenue = d.netRevenue;
    }
    dailyMap.set(day, d);

    const phone = String(o.customerPhone || '').trim();
    const customerKey = phone || String(o.customerName || '').trim() || 'unknown';
    const c = customerMap.get(customerKey) || { name: o.customerName || '', phone, orders: 0, spent: 0, lastOrderAt: o.createdAt };
    c.orders += 1;
    if (o.status !== 'cancelled') c.spent += Number(o.total || 0);
    if (new Date(o.createdAt) > new Date(c.lastOrderAt)) c.lastOrderAt = o.createdAt;
    customerMap.set(customerKey, c);

    const areaName = String(o.area || '').trim() || (o.fulfillment === 'pickup' ? 'استلام من المكان' : 'غير محدد');
    const a = areaMap.get(areaName) || { area: areaName, orders: 0, revenue: 0, deliveryFees: 0 };
    a.orders += 1;
    if (o.status !== 'cancelled') { a.revenue += Number(o.total || 0); a.deliveryFees += Number(o.deliveryFee || 0); }
    areaMap.set(areaName, a);

    if (o.status !== 'cancelled') {
      for (const i of (o.items || [])) {
        const key = `${i.title || 'بدون اسم'}|${i.selectedVariant || ''}`;
        const item = itemMap.get(key) || { title: i.title || 'بدون اسم', variant: i.selectedVariant || '', quantity: 0, revenue: 0 };
        item.quantity += Number(i.quantity || 0);
        item.revenue += Number(i.lineTotal || 0);
        itemMap.set(key, item);
      }
    }
  }

  const topItems = [...itemMap.values()].sort((a,b) => b.quantity - a.quantity || b.revenue - a.revenue);
  const customers = [...customerMap.values()].sort((a,b) => b.spent - a.spent || b.orders - a.orders);
  const areas = [...areaMap.values()].sort((a,b) => b.orders - a.orders || b.revenue - a.revenue);
  const dailySales = [...dailyMap.values()].sort((a,b) => a.date.localeCompare(b.date));

  const reviewStatuses = {};
  const reviewRatings = {};
  for (const r of reviews) {
    reviewStatuses[r.status || 'approved'] = (reviewStatuses[r.status || 'approved'] || 0) + 1;
    const rating = String(Number(r.rating || 0));
    reviewRatings[rating] = (reviewRatings[rating] || 0) + 1;
  }

  const allDailyVisits = Object.entries(analytics.dailyVisits || {})
    .filter(([date]) => {
      const d = new Date(`${date}T00:00:00`);
      return d >= from && d <= to;
    })
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([date,count]) => ({ date, count: Number(count || 0) }));

  let users = [];
  if (req.user.role === 'owner') {
    users = await AdminUser.find({}).select('-passwordHash').sort({ createdAt: -1 }).lean();
  }

  res.json({
    generatedAt: now.toISOString(),
    period: { from: from.toISOString(), to: to.toISOString() },
    store: { name: settings.storeName, currency: settings.currency || 'ج.م' },
    summary: {
      orders: orders.length,
      validOrders: validOrders.length,
      cancelledOrders: orders.length - validOrders.length,
      deliveredOrders: deliveredOrders.length,
      subtotalRevenue,
      totalDiscounts,
      deliveryRevenue,
      netRevenue,
      // Compatibility aliases for the existing Admin UI.
      revenue: netRevenue,
      deliveredRevenue,
      subtotal: subtotalRevenue,
      deliveryFees: deliveryRevenue,
      averageOrder: validOrders.length ? money(netRevenue / validOrders.length) : 0,
      totalItems,
      uniqueCustomers: customers.length,
    },
    statuses,
    fulfillment,
    dailySales,
    itemSales: topItems,
    customers,
    areas,
    orders: orders.map(serializeOrder),
    catalog: {
      products: products.map(p => ({ _id:p._id, title:p.title, category:p.category, price:p.price, oldPrice:p.oldPrice, isAvailable:p.isAvailable, availableToday:p.availableToday, featured:p.featured, isHidden:p.isHidden, createdAt:p.createdAt, updatedAt:p.updatedAt })),
      categories: categories.map(c => ({ _id:c._id, name:c.name, isActive:c.isActive, sortOrder:c.sortOrder, createdAt:c.createdAt })),
      services: services.map(s => ({ _id:s._id, title:s.title, isActive:s.isActive, ctaType:s.ctaType, sortOrder:s.sortOrder, createdAt:s.createdAt, updatedAt:s.updatedAt })),
      deliveryAreas: deliveryAreas.map(a => ({ _id:a._id, name:a.name, fee:a.fee, minimumOrder:a.minimumOrder, isActive:a.isActive, createdAt:a.createdAt, updatedAt:a.updatedAt })),
      gallery: gallery.map(g => ({ _id:g._id, title:g.title, category:g.category, isActive:g.isActive, sortOrder:g.sortOrder, createdAt:g.createdAt })),
    },
    reviews: { rows: reviews, statuses: reviewStatuses, ratings: reviewRatings },
    users,
    activity,
    analytics: {
      totalVisits: Number(analytics.totalVisits || 0),
      periodVisits: allDailyVisits.reduce((sum, d) => sum + d.count, 0),
      orderStarts: Number(analytics.orderStarts || 0),
      whatsappOpens: Number(analytics.whatsappOpens || 0),
      productViews: analytics.productViews || {},
      cartAdds: analytics.cartAdds || {},
      pageVisits: analytics.pageVisits || {},
      dailyVisits: allDailyVisits,
    },
    limits: { orders: 5000, reviews: 3000, activity: 3000, ordersTruncated: orders.length >= 5000 },
  });
}));

app.get('/api/admin/dashboard', auth, api(async (req, res) => {
  const [products, categories, gallery, services, orders, newOrders, pendingReviews, latestOrder, deliveryAreas, recentActivity] = await Promise.all([
    Product.countDocuments(), Category.countDocuments(), Gallery.countDocuments(), Service.countDocuments(), Order.countDocuments(), Order.countDocuments({ status: 'new' }), Review.countDocuments({ status: 'pending' }), Order.findOne().sort({ createdAt: -1 }).lean(), DeliveryArea.countDocuments({ isActive: true }), ActivityLog.find({}).sort({ createdAt: -1 }).limit(8).lean()
  ]);
  res.json({ products, categories, gallery, services, orders, newOrders, pendingReviews, latestOrder, deliveryAreas, recentActivity, cloud: { database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', cloudinary: hasCloudinary ? 'configured' : 'not_configured', pos: process.env.POS_API_KEY ? 'ready' : 'needs_key', environment: process.env.VERCEL ? 'production' : 'development' } });
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
  res.json({ apiVersion:'v1', serverTime:new Date().toISOString(), since:since.toISOString(), products, orders: orders.map(serializeOrder) });
}));
app.patch('/api/pos/orders/:id/status', posAuth, api(async (req,res)=>{
  const allowedStatuses=['new','contacted','preparing','out_for_delivery','delivered','cancelled'];
  if(!allowedStatuses.includes(req.body.status)) return res.status(400).json({error:'Invalid order status'});
  const doc=await Order.findByIdAndUpdate(req.params.id,{status:req.body.status,updatedAt:new Date()},{new:true});
  if(!doc) return res.status(404).json({error:'Order not found'});
  await logActivity('pos_order_status', `${doc.orderNumber} -> ${req.body.status}`, 'pos');
  res.json(serializeOrder(doc));
}));

app.get('/api/backup', auth, api(async (req, res) => {
  const [products,categories,gallery,services,settings,orders,reviews,analytics,deliveryAreas,activityLogs] = await Promise.all([Product.find().lean(),Category.find().lean(),Gallery.find().lean(),Service.find().lean(),Settings.find().lean(),Order.find().lean(),Review.find().lean(),Analytics.find().lean(),DeliveryArea.find().lean(),ActivityLog.find().sort({createdAt:-1}).limit(1000).lean()]);
  const normalizedOrders = orders.map(serializeOrder);
  res.json({ version: 6, exportedAt: new Date().toISOString(), data: { products,categories,gallery,services,settings,orders:normalizedOrders,reviews,analytics,deliveryAreas,activityLogs } });
}));

app.post('/api/restore', auth, api(async (req, res) => {
  const payload = req.body?.data;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح' });
  const collections = [
    ['products', Product], ['categories', Category], ['gallery', Gallery], ['services', Service],
    ['settings', Settings], ['orders', Order], ['reviews', Review], ['analytics', Analytics], ['deliveryAreas', DeliveryArea], ['activityLogs', ActivityLog]
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
app.get('/products', sendStatic('menu.html'));
app.get('/menu', sendStatic('menu.html'));
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
