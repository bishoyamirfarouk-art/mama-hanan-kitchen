# v1.6.0 — Final Performance Build

## تحسينات السرعة
- تحويل صور الهوية الثقيلة إلى WebP بأبعاد مناسبة للاستخدام الفعلي.
- إزالة ملفات PNG الأصلية الثقيلة وغير المطلوبة في الإنتاج.
- Hero responsive بنسختين 960px و1600px مع `srcset`.
- تحميل كسول `lazy loading` للصور غير الحرجة و`decoding=async`.
- صور Cloudinary تُطلب تلقائيًا بمقاسات مناسبة لكل مكان مع `f_auto` و`q_auto`.
- تقليل أقصى عرض للصورة المرفوعة من لوحة الإدارة إلى 1600px مع تخزين WebP.
- Service Worker أخف: لا يقوم بتنزيل كل صور الأكل والهيرو عند أول زيارة.
- Cache-first للصور وCSS/JS بعد أول تحميل، مع Network-first للصفحات.
- Preconnect لـ Cloudinary وGoogle Fonts وإلغاء CSS `@import` البطيء.

## التوافق
- ترحيل تلقائي لأي إعداد قديم يشير إلى `logo-horizontal.png`.
- الاحتفاظ بـ `hero-home.webp` كمسار توافق خفيف.
- لا تغيير في MongoDB أو Cloudinary credentials أو بيانات العملاء.
