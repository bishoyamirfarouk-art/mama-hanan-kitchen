# تحديث مطبخ ماما حنان v1.1

## تم التنفيذ
- إصلاح صفحة المنيو وإضافة fallback آمن إذا حدثت مشكلة في API أو البيانات.
- إزالة أي رسائل تقنية أو روابط إدارة من واجهة العميل.
- إضافة حقوق التطوير في الفوتر: Abanoub Nasser.
- إضافة رقم الهاتف الافتراضي 01211377826 ويمكن تعديله من لوحة الإدارة.
- إضافة رابط جروب واتساب ويمكن تعديله من لوحة الإدارة.
- إضافة تقارير وإحصائيات: زيارات، طلبات، مبيعات، متوسط الطلب، فتح واتساب، الأكثر مشاهدة، الأكثر إضافة للسلة، الأكثر طلبًا، زيارات الصفحات والزيارات اليومية، مع تصدير CSV.
- تجهيز API آمن لربط برنامج POS.

## متغير Vercel الجديد للـ POS
أضف متغير بيئة جديد باسم:

POS_API_KEY=<LONG_RANDOM_SECRET>

ثم اعمل Redeploy. لا ترسل هذا المفتاح للواجهة ولا تضعه في GitHub.

## POS API
- GET /api/pos/catalog
- GET /api/pos/sync?since=<ISO_DATE>
- PATCH /api/pos/orders/:id/status

المصادقة: header باسم X-POS-Key أو Bearer token بقيمة POS_API_KEY.

## نشر التحديث
استبدل محتويات مجلد home-food-store في GitHub بهذه النسخة. Vercel سيعيد النشر تلقائيًا.


## Hotfix 1.1.1
- Added physical `menu.html` so `/menu` is served directly by Vercel clean URLs.
- Removed the old `/menu -> /products_page.html` route that could return 404 with `cleanUrls`.
- Kept `/products` as a backwards-compatible alias.
