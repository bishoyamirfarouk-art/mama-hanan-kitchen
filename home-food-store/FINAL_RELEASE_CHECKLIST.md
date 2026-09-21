# مطبخ ماما حنان — Final Release Checklist v1.6.0

1. ارفع محتويات `home-food-store` كاملة على GitHub.
2. احذف PNGs القديمة المذكورة في `DEPLOY_UPDATE.md` إن كانت ما زالت في الـRepo.
3. اترك Vercel Root Directory = `home-food-store`.
4. لا تغيّر Environment Variables الصحيحة.
5. بعد اكتمال النشر افتح الموقع ثم نفذ `Ctrl + F5`.
6. اختبر:
   - `/`
   - `/menu`
   - `/gallery`
   - `/services`
   - `/admin`
   - `/api/health`
7. من Admin:
   - أضف وجبة بصورة.
   - تأكد أن الصورة WebP على Cloudinary.
   - أضف رأي عميل واعتمده.
   - جرّب تعديل خدمة وصورة.
8. راقب سرعة الصفحة على الموبايل بعد أول تحميل.
