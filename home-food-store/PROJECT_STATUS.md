# حالة المشروع

## تم تنفيذه
- عزل المشروع بالكامل عن المتجر السابق: حذف Git history و`.vercel` binding و`.env` الحقيقي وأي Project IDs أو أسماء قديمة.
- قاعدة بيانات جديدة بالتصميم: MongoDB Atlas مع `MONGODB_DB_NAME=home_food_store`.
- Cloudinary جديد عبر Environment Variables فقط.
- واجهة عربية RTL بهوية أكل بيتي ومشويات، Mobile-first.
- الرئيسية: Hero، أقسام، منيو اليوم، لماذا نحن، خطوات الطلب، Gallery، Reviews، CTA.
- المنيو: بحث، فلترة، ترتيب، Variants/وحدات بيع، عروض، توافر اليوم، تفاصيل المنتج.
- Gallery: Masonry، فلاتر، Lightbox، Keyboard + Swipe، Lazy Loading.
- الخدمات: عزومات، اشتراكات أسبوعية، توصيل، مناسبات، وجبات شركات، طلبات خاصة.
- Cart + Checkout: تسجيل الطلب على MongoDB ثم فتح WhatsApp برسالة مرتبة.
- لوحة Admin مؤمنة بـ JWT وتخزين كلمات المرور بـ scrypt.
- إدارة الوجبات والأقسام والجاليري والطلبات وإعدادات المتجر.
- رفع الصور إلى Cloudinary من الـBackend فقط.
- Dashboard لحالة MongoDB/Cloudinary بدون كشف أسرار.
- Backup + Restore لا يلمسان مستخدمي الإدارة.
- PWA + Service Worker جديد ومستقل.
- SEO أساسي + OpenGraph + FoodEstablishment structured data.
- LocalStorage وCache names جديدة ومستقلة.

## الربط المطلوب قبل الإنتاج
1. MongoDB Atlas URI جديدة + database name جديد.
2. Cloudinary account/credentials جديدة.
3. JWT secret جديد قوي.
4. Admin username/password جديدان.
5. اسم المتجر، واتساب، الهاتف، العنوان، المواعيد، السوشيال.
6. صور الأكل الحقيقية بدل SVG placeholders.
7. Vercel Project جديد + domain/subdomain جديد.

## اختبارات تمت
- `node --check` للـBackend وFrontend وAdmin JS: ناجح.
- فتح الملفات الأساسية عبر HTTP static preview: الرئيسية والمنيو والجاليري والـAdmin ترجع HTTP 200.
- Scan لأسماء وربط المتجر السابق: لا توجد identifiers قديمة في ملفات المشروع.
- لم يتم إجراء integration test للـMongoDB/Cloudinary لأن المشروع متعمد أن يكون بدون أي credentials حقيقية عند التسليم.
