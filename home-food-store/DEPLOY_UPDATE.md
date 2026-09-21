# تحديث النسخة المنشورة

المشروع جاهز ليحل محل محتويات فولدر `home-food-store` الموجود في GitHub الحالي.

## أسرع طريقة
1. افتح Repository: `mama-hanan-kitchen`.
2. ادخل فولدر `home-food-store`.
3. ارفع محتويات هذا الفولدر واستبدل الملفات القديمة.
4. تأكد أن فولدر `assets/brand` تم رفعه كاملًا.
5. Vercel سيعمل Deployment تلقائيًا لأن GitHub مربوط بالمشروع.

## Vercel
يظل:
`Root Directory = home-food-store`

لا تغيّر Environment Variables الحالية إذا كانت صحيحة.

## بعد Deployment
افتح:
- `/`
- `/menu`
- `/gallery`
- `/services`
- `/admin`
- `/api/health`

المتوقع من `/api/health`:
- database: connected
- cloudinary: configured

## أول دخول Admin
اسم المستخدم = قيمة `ADMIN_USERNAME`
كلمة المرور = قيمة `ADMIN_PASSWORD`

إذا غيّرت `ADMIN_PASSWORD` في Vercel ثم عملت Redeploy، النسخة الحالية تزامن الباسورد الجديد تلقائيًا.


## Hotfix 1.1.1
- Added physical `menu.html` so `/menu` is served directly by Vercel clean URLs.
- Removed the old `/menu -> /products_page.html` route that could return 404 with `cleanUrls`.
- Kept `/products` as a backwards-compatible alias.


## ملاحظة خاصة بتحديث v1.6.0
تم حذف ملفات الهوية الثقيلة القديمة من النسخة النهائية. لو كنت ترفع يدويًا من GitHub Web، احذف الملفات التالية إن كانت ما زالت موجودة:
- `assets/brand/logo-horizontal.png`
- `assets/brand/logo-badge.png`
- `assets/brand/logo-icon.png`
- `assets/brand/hero-source.png`

البدائل الجديدة:
- `logo-horizontal.webp`
- `logo-badge.webp`
- `logo-icon.webp`
- `hero-home-960.webp`
- `hero-home-1600.webp`

بعد الـDeployment اعمل تحديث قوي مرة واحدة `Ctrl + F5` حتى يتغير Service Worker إلى v11.
