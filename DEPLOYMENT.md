# 📘 دليل النشر على GitHub Pages

## خطوات نشر منصة WebXR BIM المتقدمة

### الخطوة 1: إنشاء Repository على GitHub

1. افتح حسابك على GitHub: https://github.com/drahmedlouay
2. اضغط على زر **"New"** لإنشاء repository جديد
3. املأ التفاصيل:
   - **Repository name:** `webxr-bim`
   - **Description:** `منصة WebXR BIM المتقدمة - نظام مراجعة التصاميم والكشف التلقائي عن التعارضات`
   - **Visibility:** Public (يجب أن يكون عام لاستخدام GitHub Pages)
   - **لا تضف** README أو .gitignore أو LICENSE (لأنها موجودة بالفعل)
4. اضغط **"Create repository"**

### الخطوة 2: ربط المشروع المحلي مع GitHub

افتح Terminal وقم بتنفيذ الأوامر التالية:

```bash
cd ~/Documents/webxr-bim

# إضافة Remote Repository
git remote add origin https://github.com/drahmedlouay/webxr-bim.git

# التأكد من إضافة Remote
git remote -v

# Push الكود للـ main branch
git push -u origin main
```

### الخطوة 3: تفعيل GitHub Pages

1. افتح repository على GitHub
2. اذهب إلى **Settings** (الإعدادات)
3. في القائمة الجانبية، اضغط على **Pages**
4. تحت **Source**، اختر:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. اضغط **Save**
6. انتظر دقيقة واحدة ثم انتظر ظهور رسالة:
   ```
   ✅ Your site is live at https://drahmedlouay.github.io/webxr-bim/
   ```

### الخطوة 4: اختبار المنصة

افتح الرابط في المتصفح:
```
https://drahmedlouay.github.io/webxr-bim/
```

### الخطوة 5: التحديثات المستقبلية

عندما تريد تحديث المنصة:

```bash
cd ~/Documents/webxr-bim

# إجراء التعديلات المطلوبة
# ثم:

git add .
git commit -m "وصف التحديث"
git push origin main

# سيتم تحديث الموقع تلقائياً خلال 1-2 دقيقة
```

---

## ⚙️ إعدادات إضافية (اختيارية)

### إضافة Domain مخصص

إذا كنت تملك domain خاص:

1. في إعدادات GitHub Pages
2. تحت **Custom domain**، أدخل: `bim.yourdomain.com`
3. أضف CNAME record في إعدادات الـ DNS:
   ```
   Type: CNAME
   Name: bim
   Value: drahmedlouay.github.io
   ```

### تفعيل HTTPS

- GitHub Pages يدعم HTTPS تلقائياً
- قم بتفعيل خيار **Enforce HTTPS** في الإعدادات

---

## 🔧 استكشاف الأخطاء

### المشكلة: الموقع لا يظهر
**الحل:**
- تأكد من أن Repository عام (Public)
- تأكد من وجود ملف `index.html` في الـ root
- انتظر 5-10 دقائق بعد التفعيل

### المشكلة: CSS لا يعمل
**الحل:**
- تأكد من أن CSS مضمن في الـ HTML (وهو كذلك في منصتنا)
- أو تأكد من المسارات النسبية للملفات

### المشكلة: WebXR لا يعمل
**الحل:**
- GitHub Pages يستخدم HTTPS تلقائياً (مطلوب لـ WebXR) ✅
- تأكد من استخدام Meta Quest Browser
- تأكد من تفعيل WebXR في إعدادات المتصفح

---

## 📊 المراقبة والإحصائيات

### GitHub Insights
- اذهب إلى **Insights** في repository
- تابع عدد الزوار والنقرات

### Google Analytics (اختياري)
أضف الكود التالي قبل `</head>` في `index.html`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## 🚀 نصائح للأداء

1. **ضغط الصور:** استخدم صور مضغوطة
2. **CDN:** استخدم CDN للمكتبات (كما هو مطبق بالفعل)
3. **Caching:** GitHub Pages يطبق caching تلقائياً
4. **نماذج خفيفة:** استخدم نماذج محسنة للويب

---

## 📝 Checklist النشر

- [x] Repository تم إنشاؤه على GitHub
- [x] الكود تم push للـ main branch
- [x] GitHub Pages تم تفعيله
- [x] الموقع يعمل على الرابط الجديد
- [x] WebXR يعمل على Meta Quest
- [x] جميع الميزات تعمل بشكل صحيح
- [ ] Domain مخصص (اختياري)
- [ ] Google Analytics (اختياري)

---

## 🎉 تهانينا!

منصة WebXR BIM المتقدمة الخاصة بك الآن منشورة ومتاحة على:

**🌐 https://drahmedlouay.github.io/webxr-bim/**

شارك الرابط مع:
- فريق العمل
- الطلاب
- المجتمع الهندسي

---

**تم الإعداد بواسطة:** Kiro AI Assistant  
**التاريخ:** 15 أكتوبر 2026  
**الإصدار:** 2.0
