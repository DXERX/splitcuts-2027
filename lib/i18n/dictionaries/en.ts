// lib/i18n/dictionaries/en.ts
// Flat key -> string dictionary. Keys are dot-namespaced by the section they
// belong to (e.g. "hero.headline") purely for readability -- there's no
// nesting at runtime, just a flat Record<string, string>.

export const en = {
  "nav.rewards": "REWARDS",
  "nav.account": "ACCOUNT",
  "nav.book": "BOOK →",
  "nav.bookFull": "BOOK YOUR CHAIR",
  "nav.langToggle": "عربي",

  "hero.eyebrow": "SPLIT CUTS / 2026",
  "hero.location": "JEDDAH / ABHUR",
  "hero.hours": "02PM—02AM",
  "hero.headline": "CUT DIFFERENT.",
  "hero.subtext1": "Cuts. Braids. Twists. Dreads.",
  "hero.subtext2": "Built for Jeddah.",
  "hero.cta": "BOOK A CHAIR →",
  "hero.scroll": "SCROLL",

  "services.tag": "SERVICES / 01",
  "services.tapToBook": "TAP TO BOOK",
  "services.empty": "Menu will appear here shortly.",
  "services.sar": "SAR",

  "servicesPage.title": "Services — Split Cuts",
  "servicesPage.tag": "SERVICES",
  "servicesPage.headline": "EVERY CUT. ONE STANDARD.",
  "servicesPage.subtext": "Cuts, beard work, braids, twists, dreads, color. Priced clearly, booked in seconds.",
  "servicesPage.min": "MIN",
  "servicesPage.book": "BOOK",
  "servicesPage.empty": "Services will appear here shortly.",
  "servicesPage.cta": "BOOK YOUR CHAIR",

  "category.CUTS": "CUTS",
  "category.STYLE": "STYLE",
  "category.CARE": "CARE",
  "category.BEARD": "BEARD",
  "category.BRAIDS": "BRAIDS",
  "category.TWISTS": "TWISTS",
  "category.DREADS": "DREADS",
  "category.COLOR": "COLOR",
  "category.OTHER": "OTHER",

  "tamara.tag": "PAY YOUR WAY",
  "tamara.headline": "Get a New Look with",
  "tamara.body": "Split any booking over {min} SAR into instalments at checkout — your chair's booked either way.",

  "rewards.tag": "SPLIT REWARDS",
  "rewards.headline": "5 CUTS. 6TH ON US.",
  "rewards.free": "FREE",
  "rewards.view": "VIEW REWARDS →",

  "bottomNav.book": "BOOK A CHAIR →",

  "promo.tamara": "SPLIT PAYMENTS WITH TAMARA — NO EXTRA COST",
  "promo.rewards": "5 CUTS, 6TH ON US — JOIN SPLIT REWARDS",
  "promo.student": "STUDENT PACKAGE — 4 CUTS/MONTH FOR 149 SAR",

  "package.title": "STUDENT PACKAGE",
  "package.description": "4 Hair + Beard cuts, once a month, for 149 SAR.",
  "package.request": "REQUEST PACKAGE",
  "package.requesting": "REQUESTING…",
  "package.pending": "Requested — pay to activate it.",
  "package.active": "{remaining} of {total} cuts left · expires {date}",
  "package.usedUp": "This month's package is used up.",
  "package.error": "Couldn't request the package — try again.",
  "package.payAtShop": "Pay at the shop",
  "package.payWithTamara": "PAY {amount} SAR WITH TAMARA",
  "package.payingWithTamara": "OPENING TAMARA…",
  "package.tamaraError": "Couldn't start Tamara checkout — try again.",
  "package.phoneRequired": "Enter a valid Saudi mobile number to continue.",

  "booking.usePackage": "Use my Student Package ({remaining} left) — this cut is free",
} as const;

export type DictKey = keyof typeof en;
