# مطبخ ماما حنان

متجر عربي RTL للأكل البيتي والمشويات باسم **مطبخ ماما حنان**، بهوية بصرية كاملة ونظام طلبات ولوحة إدارة مستقلة.

## التقنية
- Frontend: HTML + Vanilla JavaScript + CSS
- Backend: Node.js + Express
- Database: MongoDB Atlas
- Images: Cloudinary
- Hosting: Vercel
- Authentication: JWT + `crypto.scrypt`

## الهوية المضافة
الصور الرسمية موجودة داخل:
`assets/brand/`

وتشمل:
- `logo-horizontal.png` للهيدر.
- `logo-badge.png` للأقسام التعريفية والفوتر.
- `logo-icon.png` للأيقونات والصفحات الداخلية.
- `hero-home.webp` للواجهة الرئيسية.
- `og-home.jpg` لمشاركة الروابط.
- `icon-192.png` و`icon-512.png` للـPWA.
- `favicon.png` للمتصفح.

## قاعدة البيانات
اسم قاعدة البيانات:
`mama_hanan_kitchen`

عند أول اتصال ناجح بقاعدة بيانات فارغة يتم تلقائيًا:
- تثبيت هوية مطبخ ماما حنان في Settings.
- إنشاء الأقسام الافتراضية.
- إنشاء وجبات تجريبية قابلة للتعديل من لوحة الإدارة.
- إنشاء عناصر مبدئية للمعرض.
- إنشاء آراء مبدئية.
- إنشاء أول Admin من Environment Variables.

## Environment Variables
```env
PORT=3000
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=mama_hanan_kitchen
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
JWT_SECRET=
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ALLOWED_ORIGINS=https://mama-hanan-kitchen.vercel.app
POS_API_KEY=
```

> لا ترفع `.env` أو أي Secrets إلى GitHub.

## الصفحات
- `/` الرئيسية
- `/menu` المنيو
- `/gallery` معرض الصور
- `/services` الخدمات
- `/admin` لوحة الإدارة

تم تفعيل `cleanUrls` على Vercel، لذلك امتداد `.html` لا يظهر للزائر وروابط `.html` القديمة تتحول تلقائيًا للمسار النظيف.

## لوحة الإدارة
تدعم:
- Dashboard وحالة MongoDB/Cloudinary
- إدارة الوجبات والأسعار والأحجام
- إدارة الأقسام
- Gallery + رفع الصور إلى Cloudinary مع تحويل تلقائي إلى WebP
- الطلبات وحالاتها + بحث + تفاصيل + طباعة
- مناطق التوصيل ورسوم وحد أدنى لكل منطقة
- إدارة آراء العملاء
- تقارير وإحصائيات + CSV
- سجل آخر النشاطات في Dashboard
- إعدادات المتجر
- رفع/تغيير Hero واللوجو من الإعدادات
- Backup / Restore يشمل مناطق التوصيل وسجل النشاط
- POS API جاهز للربط من خلال POS_API_KEY

## Cloudinary folders
الرفع يتم إلى:
- `mama-hanan-kitchen/products`
- `mama-hanan-kitchen/categories`
- `mama-hanan-kitchen/gallery`
- `mama-hanan-kitchen/banners`
- `mama-hanan-kitchen/branding`

## النشر على Vercel
إذا كان الـRepository الحالي يحتوي المشروع داخل فولدر `home-food-store`:
- Root Directory = `home-food-store`

بعد رفع التحديث:
1. تأكد من Environment Variables.
2. اعمل Redeploy.
3. افتح `/api/health`.
4. تأكد أن `database` = `connected` و`cloudinary` = `configured`.
5. افتح `/admin` وأدخل بيانات `ADMIN_USERNAME` و`ADMIN_PASSWORD`.

## ملاحظة مهمة للـAdmin
لو غيّرت `ADMIN_PASSWORD` في Vercel ثم عملت Redeploy، النظام سيزامن كلمة السر الجديدة مع حساب الـAdmin تلقائيًا.
