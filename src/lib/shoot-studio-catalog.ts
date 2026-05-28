// Canonical ILARIA Shoot Studio catalog.
//
// Shoot Studio (the external image service, default ilaria-fitting-room.vercel.app)
// resolves the garment and the model STRICTLY by id: its /api/shoots/generate
// handler loads reference images from `catalog/products/{product.id}/...` and
// model seeds from `catalog/models/{model.id}/...`. If we send an id that does
// not exist in its catalog it silently loads no reference images and renders the
// garment from prompt text alone — this is the root cause of mis-targeted shoots
// (e.g. the "Tami" case where an unknown product fell back to a default bodysuit).
//
// This module is the single place that mirrors Shoot Studio's product/model
// catalog (copied verbatim from its `app/src/catalog.ts`). At runtime we try to
// PULL the live catalog from Shoot Studio (`GET {baseUrl}/api/catalog`) so this
// list never goes stale; the bundled snapshot below is the offline fallback.
//
// Keep this in sync with ILARIA Shoot Studio `app/src/catalog.ts` whenever the
// product roster or model roster changes there.

export type ShootStudioProductCategory = "Bra" | "Bodysuit" | "Briefs" | "Shapewear" | "Shorts";

export type ShootStudioProduct = {
  id: string;
  name: string;
  category: ShootStudioProductCategory;
  colors: string[];
  support: "Light" | "Medium" | "Firm";
  sizes: string;
  needs: string[];
  fitPromise: string;
  construction: string[];
  prompt: string;
};

export type ShootStudioModel = {
  id: string;
  name: string;
  size: string;
};

export type ShootStudioCatalog = {
  products: ShootStudioProduct[];
  models: ShootStudioModel[];
};

// --- Bundled snapshot (offline fallback) ----------------------------------

export const SHOOT_STUDIO_PRODUCTS: ShootStudioProduct[] = [
  {
    id: "sculptease-bra",
    name: "SculptEase Bra",
    category: "Bra",
    colors: ["Cream", "Dove", "Obsidian"],
    support: "Medium",
    sizes: "34-44, D-G",
    needs: ["Fuller bust", "Everyday wear", "Under dresses", "No-show"],
    fitPromise: "Wireless everyday support with light shaping and a smooth lower neckline.",
    construction: ["wireless", "light padding", "flexible underband", "smooth seamless finish"],
    prompt: "wireless everyday bra with light padding, flexible underband, lower neckline, smooth seamless finish, medium support",
  },
  {
    id: "wideease-sculpt-bra",
    name: "WideEase Sculpt Bra",
    category: "Bra",
    colors: ["Cocoa", "Cream", "Obsidian"],
    support: "Medium",
    sizes: "34-44, D-G",
    needs: ["Fuller bust", "Lift", "Back smoothing", "Under dresses"],
    fitPromise: "Underwire lift with wide straps and a smoother back band.",
    construction: ["underwire", "push-up lift", "wide straps", "smoothing back band"],
    prompt: "underwire push-up bra with wide straps, centered lift, cushioned wire, smoothing back band, medium structured support",
  },
  {
    id: "smoothform-comfort-bra",
    name: "SmoothForm Comfort Bra",
    category: "Bra",
    colors: ["Obsidian", "Sandstone"],
    support: "Medium",
    sizes: "30-42",
    needs: ["Everyday wear", "Fuller bust", "No-show"],
    fitPromise: "Comfort bra with stable coverage for repeat everyday wear.",
    construction: ["smooth cups", "stable wings", "comfort straps", "soft hold"],
    prompt: "smooth comfort bra with stable wings, soft hold, everyday coverage, medium support, clean no-show finish",
  },
  {
    id: "everyday-v-bra",
    name: "Everyday V Bra",
    category: "Bra",
    colors: ["Latte", "Obsidian"],
    support: "Light",
    sizes: "30-36",
    needs: ["Everyday wear", "No-show", "Under dresses"],
    fitPromise: "Light seamless support for simple daily outfits.",
    construction: ["seamless V shape", "light support", "soft band", "minimal lines"],
    prompt: "light seamless V bra, soft band, minimal visible lines, everyday light support",
  },
  {
    id: "softsculpt-bodysuit",
    name: "SoftSculpt Bodysuit",
    category: "Bodysuit",
    colors: ["Cocoa", "Cream", "Obsidian"],
    support: "Firm",
    sizes: "S-L",
    needs: ["Tummy smoothing", "Under dresses", "No-show", "Everyday wear"],
    fitPromise: "Firm smoothing through waist and tummy with built-in bust support.",
    construction: ["built-in bust support", "adjustable straps", "thong back", "snap closure"],
    prompt: "seamless shaping bodysuit with built-in bust support, adjustable straps, thong back, snap closure, firm waist and tummy smoothing",
  },
  {
    id: "smoothlayer-bodysuit",
    name: "SmoothLayer Bodysuit",
    category: "Bodysuit",
    colors: ["Cocoa", "Cream", "Obsidian"],
    support: "Medium",
    sizes: "S-2XL",
    needs: ["Light shaping", "Under dresses", "Workwear", "No-show"],
    fitPromise: "Light-to-medium smoothing for a cleaner line under clothing.",
    construction: ["round neck", "tank straps", "thong back", "seamless stretch"],
    prompt: "round-neck seamless tank bodysuit, thong back, light-to-medium smoothing through waist and hips, flexible stretch",
  },
  {
    id: "streetform-bodysuit",
    name: "StreetForm Bodysuit",
    category: "Bodysuit",
    colors: ["Latte", "Obsidian"],
    support: "Medium",
    sizes: "S-XL",
    needs: ["Everyday wear", "Light smoothing", "Outfit styling"],
    fitPromise: "A fitted short-sleeve bodysuit top with light smoothing.",
    construction: ["short sleeves", "crew neck", "double-layer fabric", "snap closure"],
    prompt: "short-sleeve crew-neck bodysuit top, double-layer fabric, fitted everyday silhouette, light smoothing",
  },
  {
    id: "everydayease-shorts",
    name: "EverydayEase Shorts",
    category: "Shorts",
    colors: ["Obsidian", "Sandstone"],
    support: "Light",
    sizes: "M-XL",
    needs: ["Breathable", "Low rise", "Everyday wear", "Boxer short"],
    fitPromise: "Breathable low-rise boxer shorts for light everyday smoothing and layering.",
    construction: ["low rise below navel", "boxer-short cut", "short upper-thigh inseam", "soft seamless edges", "breathable stretch"],
    prompt: "breathable low-rise seamless boxer shorts, waistband clearly below the navel with visible abdomen above, short upper-thigh leg length ending above mid-thigh, light smoothing, soft stretch fabric",
  },
  {
    id: "zipsculpt-bodysuit",
    name: "ZipSculpt Bodysuit",
    category: "Shapewear",
    colors: ["Obsidian", "Sandstone"],
    support: "Firm",
    sizes: "S-XL",
    needs: ["Firm shaping", "Tummy smoothing", "Under dresses"],
    fitPromise: "Structured zip-front shaping for stronger waist support.",
    construction: ["front zipper", "inner hooks", "firm compression", "thong back"],
    prompt: "zip-front shaping bodysuit with inner hooks, firm waist compression, smooth stretch fabric, thong back",
  },
  {
    id: "curvehold-suit",
    name: "CurveHold Shaping Suit",
    category: "Shapewear",
    colors: ["Obsidian", "Sandstone"],
    support: "Firm",
    sizes: "XS-L",
    needs: ["Firm shaping", "Under dresses", "No-show"],
    fitPromise: "Firm shaping through the waist and lower tummy under fitted outfits.",
    construction: ["seamless compression", "waist control", "lower tummy support", "smooth finish"],
    prompt: "firm seamless shaping suit with waist control and lower tummy support, smooth finish under clothing",
  },
  {
    id: "curvehold-thong",
    name: "CurveHold Shaping Thong",
    category: "Briefs",
    colors: ["Obsidian", "Sandstone"],
    support: "Medium",
    sizes: "XS-L",
    needs: ["Tummy smoothing", "No-show", "Under dresses"],
    fitPromise: "Medium smoothing with a no-show thong finish.",
    construction: ["high waist", "seamless front", "thong back", "medium hold"],
    prompt: "high-waist seamless shaping thong, medium tummy smoothing, no-show thong back",
  },
  {
    id: "everyday-briefs",
    name: "Everyday Briefs",
    category: "Briefs",
    colors: ["Latte", "Obsidian"],
    support: "Light",
    sizes: "XS-L",
    needs: ["Everyday wear", "Postpartum support", "No-show"],
    fitPromise: "Soft seamless briefs for long-wear everyday comfort.",
    construction: ["soft waistband", "seamless edges", "light coverage", "no compression"],
    prompt: "soft seamless everyday briefs, light coverage, soft waistband, no compression, smooth under clothing",
  },
  {
    id: "softline-briefs",
    name: "SoftLine Briefs",
    category: "Briefs",
    colors: ["Dove", "Obsidian", "Sandstone"],
    support: "Light",
    sizes: "One size",
    needs: ["No-show", "Cotton gusset", "Everyday wear"],
    fitPromise: "Seamless no-show briefs with a cotton gusset for easy daily wear.",
    construction: ["seamless edges", "cotton gusset", "no-show finish", "soft stretch"],
    prompt: "seamless no-show briefs with cotton gusset, soft stretch, smooth edges, light everyday coverage",
  },
];

// Model `id` is what Shoot Studio resolves seed images by; `name` is the display
// identity used in prompts/metadata. These intentionally differ (e.g. maya-s ->
// "Aiko") — always send both the correct id AND name.
export const SHOOT_STUDIO_MODELS: ShootStudioModel[] = [
  { id: "maya-s", name: "Aiko", size: "S" },
  { id: "elena-m", name: "Elena", size: "M" },
  { id: "nora-l", name: "Nora", size: "L" },
  { id: "amara-xl", name: "Rhea", size: "XL" },
  { id: "celeste-2xl", name: "Mila", size: "2XL" },
  { id: "imani-3xl", name: "Imani", size: "3XL" },
];

// Brand-default model used when a product carries no mappable letter size
// (e.g. numeric band-size bras) or when no product is selected at all.
export const DEFAULT_SHOOT_STUDIO_MODEL_ID = "nora-l";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;

// --- Lookups ---------------------------------------------------------------

export function findShootStudioProduct(
  productId: string,
  products: ShootStudioProduct[] = SHOOT_STUDIO_PRODUCTS,
): ShootStudioProduct | null {
  const id = productId.trim().toLowerCase();
  if (!id) return null;
  return products.find((product) => product.id.toLowerCase() === id) ?? null;
}

export function findShootStudioModel(
  modelId: string,
  models: ShootStudioModel[] = SHOOT_STUDIO_MODELS,
): ShootStudioModel | null {
  const id = modelId.trim().toLowerCase();
  if (!id) return null;
  return models.find((model) => model.id.toLowerCase() === id) ?? null;
}

// Auto-select the model for a product (user preference: model is chosen by
// product, not guessed from prompt text). We map the midpoint of the product's
// letter-size range to the closest available model; numeric/band-only ranges
// fall back to the brand-default model.
export function defaultModelForProduct(
  product: ShootStudioProduct | null,
  models: ShootStudioModel[] = SHOOT_STUDIO_MODELS,
): ShootStudioModel {
  const fallback =
    models.find((model) => model.id === DEFAULT_SHOOT_STUDIO_MODEL_ID) ?? models[0];

  if (!product) return fallback;

  const tokens = extractSizeTokens(product.sizes);

  if (!tokens.length) return fallback;

  const indices = tokens.map((token) => SIZE_ORDER.indexOf(token)).filter((index) => index >= 0);

  if (!indices.length) return fallback;

  const midpoint = Math.round((Math.min(...indices) + Math.max(...indices)) / 2);
  const targetSize = SIZE_ORDER[Math.min(Math.max(midpoint, 0), SIZE_ORDER.length - 1)];

  return (
    models.find((model) => model.size === targetSize) ??
    nearestModelBySizeIndex(midpoint, models) ??
    fallback
  );
}

function nearestModelBySizeIndex(
  targetIndex: number,
  models: ShootStudioModel[],
): ShootStudioModel | null {
  let best: ShootStudioModel | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const model of models) {
    const index = SIZE_ORDER.indexOf(model.size as (typeof SIZE_ORDER)[number]);
    if (index < 0) continue;
    const distance = Math.abs(index - targetIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = model;
    }
  }

  return best;
}

function extractSizeTokens(sizes: string): Array<(typeof SIZE_ORDER)[number]> {
  const upper = sizes.toUpperCase();
  return SIZE_ORDER.filter((token) => new RegExp(`\\b${token}\\b`).test(upper));
}

export function inferShootStudioColor(prompt: string, product: ShootStudioProduct): string {
  const color = product.colors.find((item) =>
    new RegExp(`\\b${escapeRegExp(item)}\\b`, "i").test(prompt),
  );
  return color ?? product.colors[0] ?? "";
}

// Best-effort product inference from a free-text prompt — used only as a
// fallback when a post has no explicit product selected.
export function inferShootStudioProduct(
  prompt: string,
  products: ShootStudioProduct[] = SHOOT_STUDIO_PRODUCTS,
): ShootStudioProduct {
  const normalized = prompt.toLowerCase();
  const fallback = findShootStudioProduct("smoothlayer-bodysuit", products) ?? products[0];

  const direct = products.find(
    (product) =>
      normalized.includes(product.id.toLowerCase()) ||
      normalized.includes(product.name.toLowerCase()) ||
      product.name
        .toLowerCase()
        .split(/\s+/)
        .every((part) => part.length > 2 && normalized.includes(part)),
  );

  if (direct) return direct;

  if (/\b(shorts|boxer|thigh)\b/i.test(prompt)) {
    return findShootStudioProduct("everydayease-shorts", products) ?? fallback;
  }

  if (/\b(thong)\b/i.test(prompt)) {
    return findShootStudioProduct("curvehold-thong", products) ?? fallback;
  }

  if (/\b(brief|briefs|panty|underwear)\b/i.test(prompt)) {
    return findShootStudioProduct("everyday-briefs", products) ?? fallback;
  }

  if (/\b(zip|zipper)\b/i.test(prompt)) {
    return findShootStudioProduct("zipsculpt-bodysuit", products) ?? fallback;
  }

  if (/\b(firm|compression|shaping suit|curvehold|tummy)\b/i.test(prompt)) {
    return findShootStudioProduct("curvehold-suit", products) ?? fallback;
  }

  if (/\b(bra|bust|cup|under-bust|underwire|v bra|support)\b/i.test(prompt)) {
    return findShootStudioProduct("everyday-v-bra", products) ?? fallback;
  }

  return fallback;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Live pull from Shoot Studio -------------------------------------------

function normalizeBaseUrl(rawUrl: string) {
  const DEFAULT_URL = "https://ilaria-fitting-room.vercel.app";
  const url = (rawUrl || DEFAULT_URL).trim() || DEFAULT_URL;
  const withoutGeneratePath = url.replace(/\/api\/shoots\/generate\/?$/i, "");
  return withoutGeneratePath.replace(/\/$/, "");
}

function isValidProduct(value: unknown): value is ShootStudioProduct {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

function isValidModel(value: unknown): value is ShootStudioModel {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

// Tries to fetch the canonical catalog from Shoot Studio. Falls back to the
// bundled snapshot if the endpoint is missing (older deploys) or unreachable.
export async function fetchShootStudioCatalog(rawBaseUrl: string): Promise<ShootStudioCatalog> {
  const snapshot: ShootStudioCatalog = {
    products: SHOOT_STUDIO_PRODUCTS,
    models: SHOOT_STUDIO_MODELS,
  };

  const baseUrl = normalizeBaseUrl(rawBaseUrl);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.SHOOT_STUDIO_API_KEY) {
      headers.Authorization = `Bearer ${process.env.SHOOT_STUDIO_API_KEY}`;
    }

    const response = await fetch(`${baseUrl}/api/catalog`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return snapshot;
    }

    const payload = (await response.json().catch(() => null)) as Partial<ShootStudioCatalog> | null;
    const products = Array.isArray(payload?.products) ? payload!.products.filter(isValidProduct) : [];
    const models = Array.isArray(payload?.models) ? payload!.models.filter(isValidModel) : [];

    return {
      products: products.length ? products : snapshot.products,
      models: models.length ? models : snapshot.models,
    };
  } catch {
    return snapshot;
  }
}
