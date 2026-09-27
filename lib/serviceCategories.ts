// lib/serviceCategories.ts
// The live `services` table originally had no category column -- just
// name_en/name_ar/price/duration -- so the catalog page grouped services
// editorially by guessing a category from the service name via keyword
// matching. Migration 0012 added a real `category` column (nullable) and
// backfills it for new services going forward; this file now prefers that
// explicit value and only falls back to the old name-keyword guess for
// legacy rows that still have category = null, so nothing already live
// regroups unexpectedly.

export const SERVICE_CATEGORIES = [
  "CUTS",
  "STYLE",
  "CARE",
  "BEARD",
  "BRAIDS",
  "TWISTS",
  "DREADS",
  "COLOR",
  "OTHER",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

const KEYWORDS: Record<Exclude<ServiceCategory, "OTHER" | "STYLE" | "CARE">, string[]> = {
  CUTS: ["cut", "fade", "trim", "line up", "lineup", "shape up", "taper", "buzz"],
  BEARD: ["beard", "shave", "razor", "mustache"],
  BRAIDS: ["braid", "cornrow"],
  TWISTS: ["twist"],
  DREADS: ["dread", "loc", "retwist"],
  COLOR: ["color", "colour", "dye", "bleach", "tint"],
};

function guessFromName(name: string | null | undefined): ServiceCategory {
  const n = (name ?? "").toLowerCase();
  for (const category of Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]) {
    if (KEYWORDS[category].some((kw) => n.includes(kw))) return category;
  }
  return "OTHER";
}

function normalize(raw: string | null | undefined): ServiceCategory | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return (SERVICE_CATEGORIES as readonly string[]).includes(upper) ? (upper as ServiceCategory) : null;
}

export function categorize(service: { name_en?: string | null; category?: string | null }): ServiceCategory {
  return normalize(service.category) ?? guessFromName(service.name_en);
}

export function groupByCategory<T extends { name_en: string | null; category?: string | null }>(
  services: T[],
): Partial<Record<ServiceCategory, T[]>> {
  const groups: Partial<Record<ServiceCategory, T[]>> = {};
  for (const service of services) {
    const category = categorize(service);
    (groups[category] ??= []).push(service);
  }
  return groups;
}
