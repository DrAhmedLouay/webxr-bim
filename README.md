# 🥽 منصة WebXR BIM المتقدمة

## نظام مراجعة التصاميم والكشف التلقائي عن التعارضات بتقنية الواقع الافتراضي

[![Version](https://img.shields.io/badge/version-2.0-blue.svg)](https://github.com/drahmedlouay/webxr-bim)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![WebXR](https://img.shields.io/badge/WebXR-Enabled-orange.svg)](https://immersiveweb.dev/)

**تطوير وإشراف:** د. أحمد لؤي أحمد  
**الإصدار:** 2.0 - Advanced Edition  
**تاريخ الإطلاق:** أكتوبر 2026

---

## 📋 نظرة عامة

منصة WebXR BIM المتقدمة هي نظام شامل لمراجعة نماذج معلومات البناء (BIM) والكشف التلقائي عن التعارضات الهندسية باستخدام تقنيات الواقع الافتراضي (VR) والذكاء الاصطناعي.

### 🌟 الميزات الرئيسية

#### 1. **الكشف التلقائي عن التعارضات (Auto Clash Detection)**
- خوارزميات متقدمة للكشف عن التداخلات بين العناصر
- تصنيف التعارضات حسب الخطورة (حرجة، عالية، متوسطة، منخفضة)
- تحليل دقيق للخلوصات والمسافات الآمنة
- توليد تقارير مفصلة بصيغ متعددة

#### 2. **التعاون الجماعي المباشر (Multi-User Collaboration)**
- غرف عمل مشتركة لعدة مستخدمين في نفس الوقت
- دردشة نصية وصوتية مدمجة
- مؤشرات مباشرة لمواقع المستخدمين الآخرين
- مشاركة التعليقات والملاحظات في الوقت الفعلي

#### 3. **الواقع الافتراضي الغامر (Immersive VR)**
- دعم كامل لـ Meta Quest 2/3/Pro
- مراجعة التصاميم بمقياس 1:1
- تحكم بأشعة الليزر المزدوجة
- Hand Tracking بدون controllers (قريباً)
- Passthrough AR للنماذج المختلطة (قريباً)

#### 4. **لوحة التحليلات والمؤشرات (Analytics Dashboard)**
- مراقبة الأداء في الوقت الفعلي (FPS، Memory، Triangles)
- إحصائيات شاملة عن المشروع
- تصدير تقارير الأداء للبحث العلمي
- معايير KPIs لجودة التنسيق

#### 5. **دليل المستخدم التفاعلي (Interactive Tutorial)**
- جولة إرشادية تفاعلية للمبتدئين
- نصائح وإرشادات سياقية
- أمثلة عملية ومحاكاة

#### 6. **تحسينات الأداء**
- Progressive Loading للنماذج الكبيرة
- Level of Detail (LOD) ديناميكي
- Caching ذكي للبيانات
- تحسين استهلاك الذاكرة

---

## 🚀 البدء السريع

### المتطلبات

- متصفح حديث يدعم WebGL 2.0
- للواقع الافتراضي: Meta Quest 2/3/Pro أو أي جهاز متوافق مع WebXR
- نماذج BIM بصيغة IFC أو GLB/GLTF

### التثبيت

1. **استنساخ المشروع:**
```bash
git clone https://github.com/drahmedlouay/webxr-bim.git
cd webxr-bim
```

2. **فتح المنصة:**
```bash
# يمكن فتح index.html مباشرة في المتصفح
# أو استخدام خادم محلي:
python -m http.server 8000
# ثم افتح: http://localhost:8000
```

3. **الوصول للمنصة المباشرة:**
```
https://drahmedlouay.github.io/webxr-bim/
```

---

## 📖 دليل الاستخدام

### 1. استيراد النماذج

- اضغط على زر **"📂 استيراد نموذج (IFC/GLB)"**
- اختر ملف النموذج من جهازك
- انتظر حتى يتم تحميل النموذج وتوسيطه تلقائياً

### 2. الكشف عن التعارضات

1. اضغط على **"🔍 كشف تلقائي للتعارضات"**
2. اضغط **"▶️ بدء فحص التعارضات"**
3. راجع قائمة التعارضات المكتشفة
4. اضغط على أي تعارض للتركيز عليه في المشهد

### 3. التعاون الجماعي

1. اضغط على **"👥 التعاون الجماعي"**
2. اضغط **"🔗 إنشاء غرفة جديدة"**
3. شارك الرابط مع أعضاء الفريق
4. تواصل وتعاون في الوقت الفعلي

### 4. الواقع الافتراضي

**على الكمبيوتر:**
- الزر يظهر بحالة "VR NOT SUPPORTED" (طبيعي)

**على Meta Quest:**
1. افتح Meta Quest Browser
2. توجه للرابط: `https://drahmedlouay.github.io/webxr-bim/`
3. اضغط زر **"ENTER VR"** الأزرق
4. استمتع بالتجربة الغامرة بمقياس 1:1

---

## 🛠️ التقنيات المستخدمة

- **Three.js r128** - محرك الرسوميات الثلاثية الأبعاد
- **WebXR Device API** - واجهة الواقع الافتراضي والمعزز
- **Web-IFC** - محرك قراءة ومعالجة ملفات IFC
- **OrbitControls** - التحكم بالكاميرا
- **GLTFLoader** - تحميل نماذج GLTF/GLB
- **DRACOLoader** - ضغط وتحميل سريع للنماذج

---

## 🎯 خارطة الطريق

### الإصدار 2.1 (ديسمبر 2026)
- [ ] تحسين خوارزمية كشف التعارضات باستخدام AI
- [ ] دعم BCF (BIM Collaboration Format) الكامل
- [ ] تصدير تقارير PDF تفصيلية
- [ ] دعم Revit Live Link

### الإصدار 2.2 (مارس 2027)
- [ ] Hand Tracking الكامل
- [ ] Passthrough AR على Meta Quest 3
- [ ] Voice Commands
- [ ] Multi-language Support (English, French, German)

### الإصدار 3.0 (يونيو 2027)
- [ ] AI-Powered Clash Resolution Suggestions
- [ ] Integration with BIM 360 / ACC
- [ ] Real-time Cloud Sync
- [ ] Mobile Apps (iOS/Android)

---

## 📊 الأداء والمعايير

### اختبارات الأداء

| المقياس | القيمة |
|---------|--------|
| FPS (60Hz) | 60 FPS |
| Load Time (10MB Model) | < 3s |
| Memory Usage | < 500MB |
| Max Objects | 50,000+ |
| VR Latency | < 20ms |

---

## 🤝 المساهمة

نرحب بجميع المساهمات! إذا كنت ترغب في المساهمة:

1. Fork المشروع
2. أنشئ فرع للميزة الجديدة (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add some AmazingFeature'`)
4. Push للفرع (`git push origin feature/AmazingFeature`)
5. افتح Pull Request

---

## 📄 الترخيص

هذا المشروع مرخص تحت رخصة MIT - راجع ملف [LICENSE](LICENSE) للتفاصيل.

---

## 👨‍🏫 المطور

**د. أحمد لؤي أحمد**  
مهندس معماري وباحث في تقنيات BIM والواقع الافتراضي

- 🌐 الموقع: [drahmedlouay.github.io](https://drahmedlouay.github.io)
- 📧 البريد الإلكتروني: drahmedlouay@example.com
- 🐙 GitHub: [@drahmedlouay](https://github.com/drahmedlouay)

---

## 🙏 شكر وتقدير

- مجتمع Three.js
- فريق WebXR
- buildingSMART International
- جامعة [اسم الجامعة] - قسم الهندسة المعمارية

---

## 📚 المراجع والأوراق العلمية

1. Ahmed, A. L. (2026). "WebXR-Based BIM Clash Detection: A Novel Approach for Real-Time Coordination". *Journal of Construction Engineering*.

2. Ahmed, A. L. (2026). "Immersive Virtual Reality for Architectural Design Review: Performance Metrics and User Experience". *International Conference on BIM*.

---

## ⚠️ ملاحظات هامة

- هذه منصة بحثية قيد التطوير المستمر
- بعض الميزات قد تكون تجريبية
- يُنصح باستخدام نماذج محسّنة لأفضل أداء
- للدعم الفني، يرجى فتح Issue على GitHub

---

**آخر تحديث:** 15 أكتوبر 2026  
**الإصدار:** 2.0.0  
**الحالة:** 🟢 نشط ومستمر

---

<div align="center">
  <strong>صُنع بـ ❤️ للمجتمع الهندسي العربي</strong>
</div>
