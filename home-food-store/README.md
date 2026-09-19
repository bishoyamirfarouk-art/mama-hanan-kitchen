# Home Food Store — مشروع مستقل

متجر عربي RTL للأكل البيتي والمشويات، مبني كنسخة مستقلة تمامًا عن أي متجر سابق.

## التقنية
- Frontend: HTML + Vanilla JavaScript + CSS mobile-first
- Backend: Node.js + Express
- Cloud database: MongoDB Atlas
- Images: Cloudinary
- Hosting: Vercel
- Authentication: JWT + `crypto.scrypt` hashing

## عزل البيانات
لا يحتوي المشروع على أي `.env` أو Git history أو MongoDB URI أو Cloudinary keys أو بيانات Admin من المشروع المصدر.
يستخدم LocalStorage prefix جديد: `home_food_store_v1`، وService Worker cache جديد: `home-food-store-v1`.

أنشئ **MongoDB database/cluster connection جديد** و**Cloudinary credentials جديدة** قبل النشر. لا تعِد استخدام مفاتيح المشروع القديم إذا كان الهدف فصل البيانات تمامًا.

## Environment Variables
انسخ `.env.example` إلى `.env` للتشغيل المحلي فقط، ولا ترفع `.env` إلى Git:

```env
PORT=3000
MONGODB_URI=mongodb+srv://NEW_USER:NEW_PASSWORD@NEW_CLUSTER/.../
MONGODB_DB_NAME=home_food_store
CLOUDINARY_CLOUD_NAME=NEW_CLOUD
CLOUDINARY_API_KEY=NEW_KEY
CLOUDINARY_API_SECRET=NEW_SECRET
JWT_SECRET=LONG_RANDOM_SECRET
ADMIN_USERNAME=new_admin
ADMIN_PASSWORD=STRONG_NEW_PASSWORD
ALLOWED_ORIGINS=https://YOUR-NEW-DOMAIN.example
```

`ADMIN_USERNAME` و`ADMIN_PASSWORD` ينشئان أول مدير فقط إذا لم يكن موجودًا. كلمة المرور تُخزّن Hash وليست نصًا صريحًا.

## تشغيل محلي
```bash
npm install
npm start
```
ثم افتح `http://localhost:3000`.

إذا لم تضف MongoDB بعد، الواجهة العامة تعرض Demo placeholders للمعاينة، لكن لوحة الإدارة وعمليات الطلب السحابية تحتاج الربط الجديد.

## الصفحات
- `/` الرئيسية
- `/menu` المنيو
- `/gallery` معرض الصور
- `/services` الخدمات
- `/admin` لوحة الإدارة

## لوحة الإدارة
تدعم:
- Dashboard وحالة MongoDB/Cloudinary
- CRUD للوجبات والأحجام والأسعار
- CRUD للأقسام
- Gallery + رفع Cloudinary
- متابعة الطلبات والحالات
- Store Settings
- JSON Backup

## أهم API Endpoints
Public:
- `GET /api/health`
- `GET /api/settings`
- `GET /api/categories`
- `GET /api/products`
- `GET /api/gallery`
- `GET /api/reviews`
- `POST /api/orders`
- `POST /api/analytics/track`

Admin-protected:
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/settings`
- Category/Product/Gallery write endpoints
- `POST /api/upload`
- `GET/PUT /api/orders`
- `GET /api/admin/dashboard`
- `GET /api/analytics`
- `GET /api/backup`

## النشر على Vercel
1. أنشئ Git repository جديدًا لهذا المشروع فقط.
2. أنشئ Vercel Project جديدًا واربطه بالـrepo الجديد.
3. أضف Environment Variables الجديدة في Vercel.
4. Deploy.
5. اربط دومين جديد أو subdomain من إعدادات Domains في مشروع Vercel الجديد.

لا تربط المشروع الجديد بنفس MongoDB URI أو Cloudinary credentials الخاصة بالمتجر السابق إذا كنت تريد عزلًا كاملًا.

## قبل الإنتاج
- استبدل صور SVG placeholders بصور الطعام الحقيقية من لوحة الإدارة.
- أدخل اسم المتجر ورقم واتساب والعنوان والمواعيد والسوشيال من Settings.
- أضف Categories وProducts الحقيقية.
- اختبر إنشاء طلب، رسالة WhatsApp، ورفع الصور.
- ضع `ALLOWED_ORIGINS` على الدومين النهائي بدل تركه فارغًا.
