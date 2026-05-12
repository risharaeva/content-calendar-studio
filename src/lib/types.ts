export type PlatformValue = "INSTAGRAM" | "TIKTOK" | "BOTH";
export type PostStatusValue = "PLANNED" | "PACKET_READY" | "REVIEWED";
export type ManualVerdictValue = "WORKED" | "NEUTRAL" | "MISSED";
export type AutoClassValue = "WEAK" | "NORMAL" | "STRONG";
export type ImageAssetTypeValue = "PRODUCT" | "PRODUCT_ON_BODY" | "STYLE_REFERENCE" | "BANNER_REFERENCE" | "BACKGROUND" | "OTHER";
export type ImageProviderValue = "LOCAL_SD_WEBUI" | "OPENAI";
export type TextProviderValue = "OLLAMA" | "OPENAI" | "ANTHROPIC";
export type InspirationSourceTypeValue = "COMPETITOR" | "PINTEREST" | "INSTAGRAM" | "TIKTOK" | "INTERNAL";

export interface ProjectDto {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface ProjectProfileDto {
  id: number;
  projectId: number;
  brandName: string;
  audience: string;
  offers: string;
  goals: string;
  contentPillars: string;
  currentPriorities: string;
  tone: string;
  language: string;
  monthlyPostCount: number;
  monthlyStartDate: string;
  monthlyEndDate: string;
  monthlyCampaignName: string;
  monthlyPlatformFocus: PlatformValue;
  monthlyProductFocus: string;
  monthlyOffers: string;
  monthlyPriorities: string;
  monthlyMustInclude: string;
  monthlyAvoid: string;
  logoReferenceUrl: string;
  visualFonts: string;
  visualColors: string;
  productReferenceUrl: string;
  bannerReferenceUrl: string;
  layoutReferenceNotes: string;
}

export interface AppSettingsDto {
  id: number;
  ollamaModel: string;
  planTextProvider: TextProviderValue;
  planTextModel: string;
  copyTextProvider: TextProviderValue;
  copyTextModel: string;
  insightsProvider: TextProviderValue;
  insightsModel: string;
  defaultLanguage: string;
  brandVoice: string;
  imageProvider: ImageProviderValue;
  imageModel: string;
  localImageEndpoint: string;
  hasOpenAiApiKey: boolean;
  imageRenderingConfigured: boolean;
}

export interface CampaignPacketDto {
  id: string;
  objective: string;
  targetPlatform: PlatformValue;
  coreAngle: string;
  hookVariants: string[];
  captionVariants: string[];
  ctaVariants: string[];
  hashtagSet: string[];
  visualBrief: string;
  imagePromptVariants: string[];
  reviewChecklist: string[];
}

export interface GeneratedImageDto {
  id: string;
  imagePath: string;
  prompt: string;
  variant: number;
}

export interface ImageAssetDto {
  id: string;
  projectId: number;
  type: ImageAssetTypeValue;
  name: string;
  sourcePath: string;
  description: string;
  productCategory: string;
  colors: string;
  tags: string;
  notes: string;
  isActive: boolean;
}

export interface ReviewResultDto {
  id: string;
  reach: number;
  views: number;
  likes: number;
  leads: number;
  followerGain: number;
  manualVerdict: ManualVerdictValue;
  manualNote: string;
  autoScore: number;
  autoClass: AutoClassValue;
  reviewedAt: string;
}

export interface ContentPostDto {
  id: string;
  projectId: number;
  platform: PlatformValue;
  plannedDate: string;
  goal: string;
  format: string;
  theme: string;
  angle: string;
  visualConcept: string;
  tiktokExecution: string;
  instagramExecution: string;
  assetLinks: string;
  imageFormatKey: string;
  imageResolution: string;
  imageStyle: string;
  imageObjects: string;
  imageImpression: string;
  imageReferenceIds: string[];
  status: PostStatusValue;
  packet: CampaignPacketDto | null;
  review: ReviewResultDto | null;
  images: GeneratedImageDto[];
}

export interface ThemeRecommendationDto {
  id: string;
  projectId: number;
  rank: number;
  theme: string;
  goal: string;
  platform: PlatformValue;
  reason: string;
  suggestedNextAngle: string;
  evidence: Record<string, unknown>;
}

export interface PublishedPostDto {
  id: string;
  projectId: number;
  platform: PlatformValue;
  postUrl: string;
  publishedAt: string;
  capturedAt: string;
  title: string;
  textPreview: string;
  imageUrl: string;
  format: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profileVisits: number;
  followerGain: number;
  leads: number;
  notes: string;
}

export interface CompetitorPostDto {
  id: string;
  projectId: number;
  sourceType: InspirationSourceTypeValue;
  competitorName: string;
  platform: PlatformValue;
  postUrl: string;
  publishedAt: string;
  capturedAt: string;
  relativeScore: number;
  format: string;
  theme: string;
  hook: string;
  visualPattern: string;
  offer: string;
  cta: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  notes: string;
  isActive: boolean;
}

export interface DashboardState {
  activeProject: ProjectDto;
  projects: ProjectDto[];
  profile: ProjectProfileDto;
  settings: AppSettingsDto;
  summary: {
    plannedCount: number;
    reviewedCount: number;
    strongCount: number;
    leadTotal: number;
    averageScore: number;
  };
  todayPriorities: ContentPostDto[];
  calendar: ContentPostDto[];
  imageAssets: ImageAssetDto[];
  publishedPosts: PublishedPostDto[];
  competitorPosts: CompetitorPostDto[];
  recentPerformance: ContentPostDto[];
  suggestedThemes: ThemeRecommendationDto[];
  apiStatus: {
    ollamaConfigured: boolean;
    openAiTextConfigured: boolean;
    anthropicConfigured: boolean;
    imageRenderingConfigured: boolean;
    openAiConfigured: boolean;
  };
}
