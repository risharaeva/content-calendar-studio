import { z } from "zod";

export const profileSchema = z.object({
  brandName: z.string().trim().min(2),
  audience: z.string().trim().min(10),
  offers: z.string().trim().min(3),
  goals: z.string().trim().min(3),
  contentPillars: z.string().trim().min(3),
  currentPriorities: z.string().trim().min(3),
  tone: z.string().trim().min(3),
  language: z.string().trim().min(2),
  monthlyPostCount: z.coerce.number().int().min(1).max(60).default(30),
  monthlyStartDate: z.string().trim().max(20).default(""),
  monthlyEndDate: z.string().trim().max(20).default(""),
  monthlyCampaignName: z.string().trim().max(200).default(""),
  monthlyPlatformFocus: z.enum(["INSTAGRAM", "TIKTOK", "BOTH"]).default("BOTH"),
  monthlyProductFocus: z.string().trim().max(500).default(""),
  monthlyOffers: z.string().trim().max(2000).default(""),
  monthlyPriorities: z.string().trim().max(2000).default(""),
  monthlyMustInclude: z.string().trim().max(2000).default(""),
  monthlyAvoid: z.string().trim().max(2000).default(""),
  logoReferenceUrl: z.string().trim().max(1000).default(""),
  visualFonts: z.string().trim().max(1200),
  visualColors: z.string().trim().max(1200),
  productReferenceUrl: z.string().trim().max(1000),
  bannerReferenceUrl: z.string().trim().max(1000),
  layoutReferenceNotes: z.string().trim().max(2000),
});

export const projectSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
});

export const projectIdSchema = z.coerce.number().int().positive().default(1);

export const settingsSchema = z.object({
  ollamaModel: z.string().trim().min(2),
  planTextProvider: z.enum(["OLLAMA", "OPENAI", "ANTHROPIC"]),
  planTextModel: z.string().trim().min(1),
  copyTextProvider: z.enum(["OLLAMA", "OPENAI", "ANTHROPIC"]),
  copyTextModel: z.string().trim().min(1),
  insightsProvider: z.enum(["OLLAMA", "OPENAI", "ANTHROPIC"]),
  insightsModel: z.string().trim().min(1),
  defaultLanguage: z.string().trim().min(2),
  brandVoice: z.string().trim().min(3),
  imageProvider: z.enum(["LOCAL_SD_WEBUI", "OPENAI", "SHOOT_STUDIO"]),
  imageModel: z.string().trim().min(1),
  localImageEndpoint: z.string().trim().url(),
});

export const reviewSchema = z.object({
  reach: z.coerce.number().int().min(0),
  views: z.coerce.number().int().min(0),
  likes: z.coerce.number().int().min(0),
  leads: z.coerce.number().int().min(0),
  followerGain: z.coerce.number().int().min(0),
  manualVerdict: z.enum(["WORKED", "NEUTRAL", "MISSED"]),
  manualNote: z.string().trim().min(3),
});

export const postIdeaSchema = z.object({
  goal: z.string().trim().min(2).max(140),
  format: z.string().trim().min(2).max(80),
  theme: z.string().trim().min(2).max(140),
  angle: z.string().trim().min(3).max(500),
  visualConcept: z.string().trim().max(1200),
  tiktokExecution: z.string().trim().max(1200),
  instagramExecution: z.string().trim().max(1200),
  assetLinks: z.string().trim().max(4000),
  imageFormatKey: z.string().trim().min(2).max(80),
  imageResolution: z.string().trim().min(3).max(40),
  imageStyle: z.string().trim().max(400),
  imageObjects: z.string().trim().max(800),
  imageImpression: z.string().trim().max(800),
  imageReferenceIds: z.array(z.string().trim().min(1)).default([]),
});

export const imageAssetSchema = z.object({
  type: z.enum(["PRODUCT", "PRODUCT_ON_BODY", "STYLE_REFERENCE", "BANNER_REFERENCE", "BACKGROUND", "OTHER"]),
  name: z.string().trim().min(2).max(140),
  sourcePath: z.string().trim().min(2).max(1200),
  description: z.string().trim().max(1200).optional().default(""),
  productCategory: z.string().trim().max(140).optional().default(""),
  colors: z.string().trim().max(300).optional().default(""),
  tags: z.string().trim().max(300).optional().default(""),
  notes: z.string().trim().max(1200).optional().default(""),
  isActive: z.coerce.boolean().optional().default(true),
});

export const planEventSchema = z.object({
  type: z.enum(["MUST_POST", "SALE", "LAUNCH", "OTHER"]).default("MUST_POST"),
  title: z.string().trim().min(2).max(160),
  eventDate: z.coerce.date(),
  description: z.string().trim().max(1200).optional().default(""),
  requiredTopic: z.string().trim().max(500).optional().default(""),
  offer: z.string().trim().max(500).optional().default(""),
  platform: z.enum(["INSTAGRAM", "TIKTOK", "BOTH"]).default("BOTH"),
  isActive: z.coerce.boolean().optional().default(true),
});

export const planEventPatchSchema = planEventSchema.extend({
  isActive: z.coerce.boolean().default(false),
});

export const publishedPostSchema = z.object({
  platform: z.enum(["INSTAGRAM", "TIKTOK"]),
  postUrl: z.string().trim().url(),
  publishedAt: z.coerce.date(),
  title: z.string().trim().max(300).optional().default(""),
  textPreview: z.string().trim().max(1200).optional().default(""),
  imageUrl: z.string().trim().max(1200).optional().default(""),
  format: z.string().trim().max(80).optional().default(""),
  views: z.coerce.number().int().min(0).optional().default(0),
  reach: z.coerce.number().int().min(0).optional().default(0),
  likes: z.coerce.number().int().min(0).optional().default(0),
  comments: z.coerce.number().int().min(0).optional().default(0),
  shares: z.coerce.number().int().min(0).optional().default(0),
  saves: z.coerce.number().int().min(0).optional().default(0),
  profileVisits: z.coerce.number().int().min(0).optional().default(0),
  followerGain: z.coerce.number().int().min(0).optional().default(0),
  leads: z.coerce.number().int().min(0).optional().default(0),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const competitorPostSchema = z.object({
  sourceType: z.enum(["COMPETITOR", "PINTEREST", "INSTAGRAM", "TIKTOK", "INTERNAL"]).default("COMPETITOR"),
  competitorName: z.string().trim().max(120).transform((value) => value || "Untitled inspiration"),
  platform: z.enum(["INSTAGRAM", "TIKTOK", "BOTH"]),
  postUrl: z.string().trim().max(1200).optional().default(""),
  publishedAt: z.coerce.date(),
  format: z.string().trim().max(80).optional().default(""),
  theme: z.string().trim().max(140).optional().default(""),
  hook: z.string().trim().max(500).optional().default(""),
  visualPattern: z.string().trim().max(800).optional().default(""),
  offer: z.string().trim().max(300).optional().default(""),
  cta: z.string().trim().max(300).optional().default(""),
  views: z.coerce.number().int().min(0).optional().default(0),
  likes: z.coerce.number().int().min(0).optional().default(0),
  comments: z.coerce.number().int().min(0).optional().default(0),
  shares: z.coerce.number().int().min(0).optional().default(0),
  saves: z.coerce.number().int().min(0).optional().default(0),
  notes: z.string().trim().max(2000).optional().default(""),
  isActive: z.coerce.boolean().optional().default(true),
});

export const idSchema = z.string().trim().min(1);
