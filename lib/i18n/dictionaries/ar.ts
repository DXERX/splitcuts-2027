// lib/i18n/dictionaries/ar.ts
// Arabic strings. Keys must match dictionaries/en.ts exactly -- LanguageProvider
// falls back to the English string for any key missing here.

import type { DictKey } from "./en";

export const ar: Record<DictKey, string> = {
  "nav.rewards": "المكافآت",
  "nav.account": "حسابي",
  "nav.book": "← احجز",
  "nav.bookFull": "احجز كرسيك",
  "nav.langToggle": "EN",

  "hero.eyebrow": "سبليت كتس / 2026",
  "hero.location": "جدة / أبحر",
  "hero.hours": "٢ ظهرًا – ٢ فجرًا",
  "hero.headline": "قصة مختلفة.",
  "hero.subtext1": "قصات. ضفائر. تويست. دريدز.",
  "hero.subtext2": "صُنع لجدة.",
  "hero.cta": "← احجز كرسيك",
  "hero.scroll": "مرر للأسفل",

  "services.tag": "الخدمات / ٠١",
  "services.tapToBook": "اضغط للحجز",
  "services.empty": "ستظهر القائمة قريبًا.",
  "services.sar": "ر.س",

  "servicesPage.title": "الخدمات — سبليت كتس",
  "servicesPage.tag": "الخدمات",
  "servicesPage.headline": "كل قصة. بمعيار واحد.",
  "servicesPage.subtext": "قصات، تشذيب لحية، ضفائر، تويست، دريدز، صبغة. أسعار واضحة، حجز خلال ثوانٍ.",
  "servicesPage.min": "دقيقة",
  "servicesPage.book": "احجز",
  "servicesPage.empty": "ستظهر الخدمات هنا قريبًا.",
  "servicesPage.cta": "احجز كرسيك",

  "category.CUTS": "قصّات",
  "category.STYLE": "تصفيف",
  "category.CARE": "عناية",
  "category.BEARD": "لحية",
  "category.BRAIDS": "ضفائر",
  "category.TWISTS": "تويست",
  "category.DREADS": "دريدز",
  "category.COLOR": "صبغة",
  "category.OTHER": "أخرى",

  "tamara.tag": "ادفع بطريقتك",
  "tamara.headline": "احصل على إطلالة جديدة مع",
  "tamara.body": "قسّم أي حجز بأكثر من {min} ر.س إلى دفعات عند الدفع — كرسيك محجوز على أي حال.",

  "rewards.tag": "مكافآت سبليت",
  "rewards.headline": "٥ قصات، والسادسة علينا.",
  "rewards.free": "مجانًا",
  "rewards.view": "← عرض المكافآت",

  "bottomNav.book": "← احجز كرسيك",

  "promo.tamara": "قسّم دفعتك مع تمارا — بدون أي تكلفة إضافية",
  "promo.rewards": "٥ قصات والسادسة مجانًا — انضم لمكافآت سبليت",
  "promo.student": "باقة الطلاب — ٤ قصات شهريًا بـ ١٤٩ ر.س",

  "package.title": "باقة الطلاب",
  "package.description": "٤ قصات شعر ولحية، مرة كل شهر، بـ ١٤٩ ر.س.",
  "package.request": "اطلب الباقة",
  "package.requesting": "جاري الطلب…",
  "package.pending": "تم الطلب — ادفع لتفعيلها.",
  "package.active": "متبقي {remaining} من {total} · تنتهي {date}",
  "package.usedUp": "انتهت قصات هذا الشهر.",
  "package.error": "تعذر طلب الباقة — حاول مرة ثانية.",
  "package.payAtShop": "ادفع بالمحل",
  "package.payWithTamara": "ادفع {amount} ر.س مع تمارا",
  "package.payingWithTamara": "جاري فتح تمارا…",
  "package.tamaraError": "تعذر بدء الدفع مع تمارا — حاول مرة ثانية.",
  "package.phoneRequired": "أدخل رقم جوال سعودي صحيح للمتابعة.",

  "booking.usePackage": "استخدم باقة الطلاب (متبقي {remaining}) — هذي القصة مجانية",
};
