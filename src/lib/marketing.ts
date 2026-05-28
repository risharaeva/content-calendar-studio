import { addDays, differenceInCalendarDays, formatISO, isValid, parseISO, startOfDay, subDays } from "date-fns";
import {
  AppSettings,
  AutoClass,
  CampaignPacket,
  CompetitorPost,
  ContentPost,
  ImageAsset,
  ImageAssetType,
  ManualVerdict,
  Platform,
  PlanEvent,
  PlanEventType,
  PostStatus,
  Project,
  ProjectProfile,
  PublishedPost,
  ReviewResult,
  ThemeRecommendation,
} from "@prisma/client";
import { DEFAULT_OLLAMA_MODEL, GOAL_LIBRARY } from "@/lib/constants";
import { isImageRenderingConfigured, renderPromptToImage } from "@/lib/image-renderer";
import { getOllamaStatus } from "@/lib/ollama";
import { prisma } from "@/lib/prisma";
import { computeAutoScore, Metrics } from "@/lib/scoring";
import { findShootStudioProduct, SHOOT_STUDIO_PRODUCTS } from "@/lib/shoot-studio-catalog";
import { generateJsonWithTextRoute } from "@/lib/text-generation";
import {
  AppSettingsDto,
  BannerBriefDto,
  CampaignPacketDto,
  CarouselSlideDto,
  CompetitorPostDto,
  ContentPostDto,
  DashboardState,
  FrameTypeValue,
  ImageAssetDto,
  PlanEventDto,
  PublishedPostDto,
  ProjectDto,
  ProjectProfileDto,
  VideoSceneDto,
  VideoScriptDto,
} from "@/lib/types";
import { safeArray, safeObject, splitLines, toLineBlock } from "@/lib/utils";

const DEFAULT_PROJECT_ID = 1;
const SETTINGS_ID = 1;
const ILARIA_BRAND_HASHTAG = "#ILARIAIntimates";
const FOREIGN_BRAND_PATTERN =
  /\b(GORMASH|GOURMAGE|SKIMS|HONEYLOVE|LEONISA|SHAPERMINT|SPANX|THIRDLOVE|YUMMIE|SHAPELLX|UNDEROUTFIT|AGENT\s+PROVOCATEUR)\b/gi;

type PostWithRelations = ContentPost & {
  packet: CampaignPacket | null;
  review: ReviewResult | null;
  images: { id: string; imagePath: string; prompt: string; variant: number }[];
};

interface RawPlanItem {
  platform: string;
  goal: string;
  format?: string;
  theme: string;
  angle: string;
  visualConcept?: string;
  tiktokExecution?: string;
  instagramExecution?: string;
}

type RawPlanResponse =
  | RawPlanItem[]
  | {
      items?: RawPlanItem[];
      posts?: RawPlanItem[];
      socialContentIdeas?: RawPlanItem[];
      calendar?: RawPlanItem[];
    };

interface PlanItem {
  platform: Platform;
  goal: string;
  format: string;
  theme: string;
  angle: string;
  visualConcept: string;
  tiktokExecution: string;
  instagramExecution: string;
}

interface DatedPlanItem extends PlanItem {
  plannedDate: Date;
}

interface GeneratedPacket {
  objective: string;
  coreAngle: string;
  hookVariants: string[];
  captionVariants: string[];
  ctaVariants: string[];
  hashtagSet: string[];
  visualBrief: string;
  imagePromptVariants: string[];
  reviewChecklist: string[];
  // Type-specific packet sections. Only the one matching post.postType is
  // populated for a given post; the others stay null/empty.
  videoScript?: VideoScriptDto | null;
  carouselSlides?: CarouselSlideDto[];
  bannerBrief?: BannerBriefDto | null;
}

interface RecommendationSeed {
  theme: string;
  goal: string;
  platform: Platform;
  medianScore: number;
  notes: string[];
  wins: string[];
  basedOnPosts: number;
  samplePosts?: string[];
}

interface CompetitorPlanPattern {
  sourceId: string;
  sourceType: string;
  competitorName: string;
  platform: Platform;
  relativeScore: number;
  format: string;
  theme: string;
  hook: string;
  visualPattern: string;
  offer: string;
  cta: string;
  notes: string;
  sourceUrl: string;
}

interface ProjectInput {
  name: string;
  description?: string;
}

interface PostIdeaInput {
  goal: string;
  format: string;
  postType: "VIDEO" | "CAROUSEL" | "BANNER";
  defaultFrameType: "WITH_PERSON" | "PRODUCT_ONLY" | "USEFUL" | "OTHER";
  frameDescription: string;
  productId: string;
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
}

interface ImageAssetInput {
  type: ImageAssetType;
  name: string;
  sourcePath: string;
  description: string;
  productCategory: string;
  colors: string;
  tags: string;
  notes: string;
  isActive: boolean;
}

interface CompetitorPostInput {
  sourceType: string;
  competitorName: string;
  platform: Platform;
  postUrl: string;
  publishedAt: Date;
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

interface PlanEventInput {
  type: PlanEventType;
  title: string;
  eventDate: Date;
  description: string;
  requiredTopic: string;
  offer: string;
  platform: Platform;
  isActive: boolean;
}

interface PublishedPostInput {
  platform: Platform;
  postUrl: string;
  publishedAt: Date;
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

export async function ensureProjectData(projectId = DEFAULT_PROJECT_ID) {
  const defaultProject = projectId === DEFAULT_PROJECT_ID;
  const project = await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      name: defaultProject ? "ILARIA" : `Project ${projectId}`,
      slug: defaultProject ? "ilaria" : `project-${projectId}`,
      description: defaultProject ? "Comfort-first intimates and shapewear content system" : "",
    },
  });

  const profile = await prisma.projectProfile.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      brandName: project.name,
      audience: "Who this project needs to reach and help.",
      offers: "Offer one\nOffer two",
      goals: "Follower growth\nLead generation\nBrand recall",
      contentPillars: "Behind the scenes\nCustomer proof\nProduct education",
      currentPriorities: "Clarify this month’s focus\nName the campaign you are pushing now",
      tone: "Clear, useful, premium, and direct.",
      language: "English",
      monthlyPostCount: 30,
      monthlyStartDate: "",
      monthlyEndDate: "",
      monthlyCampaignName: "",
      monthlyPlatformFocus: "BOTH",
      monthlyProductFocus: "",
      monthlyOffers: "",
      monthlyPriorities: "",
      monthlyMustInclude: "",
      monthlyAvoid: "",
      logoReferenceUrl: "",
    },
  });

  let activeProject = project;

  const description =
    project.description === "Comfort-first intimates and shapewear content system" &&
    profile.brandName !== "ILARIA"
      ? ""
      : project.description;

  if (project.name !== profile.brandName || project.description !== description) {
    activeProject = await prisma.project.update({
      where: { id: project.id },
      data: {
        name: profile.brandName,
        description,
      },
    });
  }

  await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {
      imageProvider: "SHOOT_STUDIO",
      imageModel: "fal-ai/nano-banana-2/edit",
      localImageEndpoint: "https://ilaria-fitting-room.vercel.app",
    },
    create: {
      id: SETTINGS_ID,
      ollamaModel: DEFAULT_OLLAMA_MODEL,
      planTextProvider: "OLLAMA",
      planTextModel: DEFAULT_OLLAMA_MODEL,
      copyTextProvider: "OLLAMA",
      copyTextModel: DEFAULT_OLLAMA_MODEL,
      insightsProvider: "OLLAMA",
      insightsModel: DEFAULT_OLLAMA_MODEL,
      defaultLanguage: "English",
      brandVoice: "Clear, useful, observant, and concise.",
      imageProvider: "SHOOT_STUDIO",
      imageModel: "fal-ai/nano-banana-2/edit",
      localImageEndpoint: "https://ilaria-fitting-room.vercel.app",
    },
  });

  return activeProject;
}

export async function ensureSingletonData() {
  return ensureProjectData();
}

export async function listProjects() {
  await ensureProjectData();
  const projects = await prisma.project.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });
  return projects.map(projectToDto);
}

export async function createProject(input: ProjectInput) {
  await ensureProjectData();

  const name = input.name.trim();
  const slug = await buildUniqueSlug(name);

  const project = await prisma.project.create({
    data: {
      name,
      slug,
      description: input.description?.trim() ?? "",
      profile: {
        create: {
          brandName: name,
          audience: "Who this project needs to reach and help.",
          offers: "Offer one\nOffer two",
          goals: "Follower growth\nLead generation\nBrand recall",
          contentPillars: "Behind the scenes\nCustomer proof\nProduct education",
          currentPriorities: "Clarify this project’s current content focus",
          tone: "Clear, useful, specific, and calm.",
          language: "English",
          monthlyPostCount: 30,
          monthlyStartDate: "",
          monthlyEndDate: "",
          monthlyCampaignName: "",
          monthlyPlatformFocus: "BOTH",
          monthlyProductFocus: "",
          monthlyOffers: "",
          monthlyPriorities: "",
          monthlyMustInclude: "",
          monthlyAvoid: "",
          logoReferenceUrl: "",
          visualFonts: "",
          visualColors: "",
          productReferenceUrl: "",
          bannerReferenceUrl: "",
          layoutReferenceNotes: "",
        },
      },
    },
  });

  return getDashboardState(project.id);
}

export async function getProfile(projectId = DEFAULT_PROJECT_ID) {
  await ensureProjectData(projectId);
  const profile = await prisma.projectProfile.findUniqueOrThrow({ where: { projectId } });
  return profileToDto(profile);
}

export async function getSettings() {
  await ensureProjectData();
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
  return settingsToDto(settings);
}

export async function saveProfile(projectId: number, input: Omit<ProjectProfileDto, "id" | "projectId">) {
  await ensureProjectData(projectId);
  const profile = await prisma.projectProfile.upsert({
    where: { projectId },
    update: input,
    create: { projectId, ...input },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: input.brandName,
    },
  });

  return profileToDto(profile);
}

export async function saveSettings(input: Omit<AppSettingsDto, "id" | "hasOpenAiApiKey" | "imageRenderingConfigured">) {
  const settings = await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    update: input,
    create: { id: SETTINGS_ID, ...input },
  });

  return settingsToDto(settings);
}

export async function getDashboardState(projectId = DEFAULT_PROJECT_ID): Promise<DashboardState> {
  const activeProject = await ensureProjectData(projectId);

  const projects = await prisma.project.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });
  const profile = await prisma.projectProfile.findUniqueOrThrow({ where: { projectId: activeProject.id } });
  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
  const posts = await prisma.contentPost.findMany({
    where: {
      projectId: activeProject.id,
    },
    include: {
      packet: true,
      review: true,
      images: {
        orderBy: {
          variant: "asc",
        },
      },
    },
    orderBy: {
      plannedDate: "asc",
    },
  });
  const imageAssets = await prisma.imageAsset.findMany({
    where: {
      projectId: activeProject.id,
    },
    orderBy: [
      {
        isActive: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
  const planEvents = await prisma.planEvent.findMany({
    where: {
      projectId: activeProject.id,
    },
    orderBy: [
      {
        eventDate: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });
  const publishedPosts = await prisma.publishedPost.findMany({
    where: {
      projectId: activeProject.id,
    },
    orderBy: {
      capturedAt: "desc",
    },
  });
  const competitorPosts = await prisma.competitorPost.findMany({
    where: {
      projectId: activeProject.id,
    },
    orderBy: {
      capturedAt: "desc",
    },
  });
  const recommendations = await prisma.themeRecommendation.findMany({
    where: {
      projectId: activeProject.id,
    },
    orderBy: {
      rank: "asc",
    },
    take: 3,
  });

  const currentPeriod = resolvePlanningPeriod(profile);
  const calendar = posts
    .filter((post) => {
      const plannedDate = startOfDay(post.plannedDate).getTime();
      return plannedDate >= currentPeriod.startDate.getTime() && plannedDate <= currentPeriod.endDate.getTime();
    })
    .map(mapPost);
  const reviewed = calendar.filter((post) => post.review);
  const strongCount = reviewed.filter((post) => post.review?.autoClass === AutoClass.STRONG).length;
  const leadTotal = reviewed.reduce((total, post) => total + (post.review?.leads ?? 0), 0);
  const averageScore =
    reviewed.length > 0
      ? Number(
          (
            reviewed.reduce((total, post) => total + (post.review?.autoScore ?? 0), 0) /
            reviewed.length
          ).toFixed(2),
        )
      : 0;

  const now = new Date();
  const todayPriorities = calendar
    .filter((post) => post.status !== PostStatus.DONE)
    .filter((post) => new Date(post.plannedDate) >= startOfDay(now))
    .slice(0, 5);

  return {
    activeProject: projectToDto(activeProject),
    projects: projects.map(projectToDto),
    profile: profileToDto(profile),
    settings: settingsToDto(settings),
    summary: {
      plannedCount: calendar.length,
      reviewedCount: reviewed.length,
      strongCount,
      leadTotal,
      averageScore,
    },
    todayPriorities,
    calendar,
    imageAssets: imageAssets.map(mapImageAsset),
    planEvents: planEvents.map(mapPlanEvent),
    publishedPosts: publishedPosts.map(mapPublishedPost),
    competitorPosts: mapCompetitorPosts(competitorPosts),
    recentPerformance: reviewed
      .toSorted((a, b) => {
        const left = a.review ? new Date(a.review.reviewedAt).getTime() : 0;
        const right = b.review ? new Date(b.review.reviewedAt).getTime() : 0;
        return right - left;
      })
      .slice(0, 6),
    suggestedThemes: recommendations.map((recommendation) => ({
      id: recommendation.id,
      projectId: recommendation.projectId,
      rank: recommendation.rank,
      theme: recommendation.theme,
      goal: recommendation.goal,
      platform: recommendation.platform,
      reason: recommendation.reason,
      suggestedNextAngle: recommendation.suggestedNextAngle,
      evidence: safeObject(recommendation.evidence),
    })),
    apiStatus: {
      ollamaConfigured: await getOllamaStatus(settings.ollamaModel),
      openAiTextConfigured: Boolean(process.env.OPENAI_API_KEY),
      anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      imageRenderingConfigured: isImageRenderingConfigured(settings),
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
  };
}

export async function generateMonthlyPlan(projectId = DEFAULT_PROJECT_ID) {
  await ensureProjectData(projectId);

  const thirtyDaysAgo = subDays(new Date(), 30);
  const [profile, settings, existingReviewedPosts, competitorPosts, recommendations] = await Promise.all([
    prisma.projectProfile.findUniqueOrThrow({ where: { projectId } }),
    prisma.appSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } }),
    prisma.contentPost.findMany({
      where: {
        projectId,
        review: {
          isNot: null,
        },
      },
      include: {
        review: true,
      },
    }),
    prisma.competitorPost.findMany({
      where: {
        projectId,
        isActive: true,
        publishedAt: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: {
        publishedAt: "desc",
      },
    }),
    prisma.themeRecommendation.findMany({
      where: {
        projectId,
      },
      orderBy: {
        rank: "asc",
      },
      take: 5,
    }),
  ]);

  const competitorPatterns = buildCompetitorPlanPatterns(competitorPosts);
  const planningPeriod = resolvePlanningPeriod(profile);
  const targetPostCount = planningPeriod.postCount;
  const planEvents = await prisma.planEvent.findMany({
    where: {
      projectId,
      isActive: true,
      eventDate: {
        gte: addDays(planningPeriod.startDate, -7),
        lte: planningPeriod.endDate,
      },
    },
    orderBy: {
      eventDate: "asc",
    },
  });
  const anchoredPosts = buildPlanEventPosts(planEvents, planningPeriod, profile);
  const fillPostCount = Math.max(targetPostCount - anchoredPosts.length, 0);
  const planItems = fillPostCount > 0
    ? await buildMonthlyPlan(
        profile,
        settings,
        existingReviewedPosts.map((post) => post.theme),
        competitorPatterns,
        fillPostCount,
        recommendations,
      )
    : [];
  const dates = distributePostDatesAroundAnchors(
    planningPeriod.startDate,
    planningPeriod.endDate,
    fillPostCount,
    anchoredPosts.map((post) => post.plannedDate),
  );

  const existingPosts = await prisma.contentPost.findMany({
    where: {
      projectId,
    },
    include: {
      review: true,
    },
  });

  const replaceablePostIds = existingPosts.filter((post) => !post.review).map((post) => post.id);
  const datedPlanItems: DatedPlanItem[] = [
    ...anchoredPosts,
    ...dates.map((date, index) => ({
      ...planItems[index],
      plannedDate: date,
    })),
  ].toSorted((left, right) => left.plannedDate.getTime() - right.plannedDate.getTime());

  const nextPosts = datedPlanItems.flatMap((item) => {
    const hasReviewedPost = existingPosts.some(
      (post) =>
        post.review &&
        startOfDay(post.plannedDate).getTime() === startOfDay(item.plannedDate).getTime(),
    );

    if (hasReviewedPost) {
      return [];
    }

    return [{
      projectId,
      plannedDate: item.plannedDate,
      platform: item.platform,
      goal: item.goal,
      format: item.format,
      theme: item.theme,
      angle: item.angle,
      visualConcept: item.visualConcept,
      tiktokExecution: item.tiktokExecution,
      instagramExecution: item.instagramExecution,
      status: PostStatus.PLANNED,
    }];
  });

  await prisma.$transaction([
    prisma.generatedImage.deleteMany({
      where: {
        postId: {
          in: replaceablePostIds,
        },
      },
    }),
    prisma.reviewResult.deleteMany({
      where: {
        postId: {
          in: replaceablePostIds,
        },
      },
    }),
    prisma.campaignPacket.deleteMany({
      where: {
        postId: {
          in: replaceablePostIds,
        },
      },
    }),
    prisma.contentPost.deleteMany({
      where: {
        id: {
          in: replaceablePostIds,
        },
      },
    }),
    ...(nextPosts.length
      ? [
          prisma.contentPost.createMany({
            data: nextPosts,
          }),
        ]
      : []),
  ]);

  return getDashboardState(projectId);
}

export async function updatePostIdea(postId: string, input: PostIdeaInput) {
  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
    include: {
      review: true,
    },
  });

  if (!post) {
    throw new Error("Post not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.generatedImage.deleteMany({
      where: { postId },
    });

    await tx.campaignPacket.deleteMany({
      where: { postId },
    });

    await tx.contentPost.update({
      where: { id: postId },
      data: {
        goal: input.goal,
        format: input.format,
        postType: input.postType,
        defaultFrameType: input.defaultFrameType,
        frameDescription: input.frameDescription,
        productId: input.productId,
        theme: input.theme,
        angle: input.angle,
        visualConcept: input.visualConcept,
        tiktokExecution: input.tiktokExecution,
        instagramExecution: input.instagramExecution,
        assetLinks: input.assetLinks,
        imageFormatKey: input.imageFormatKey,
        imageResolution: input.imageResolution,
        imageStyle: input.imageStyle,
        imageObjects: input.imageObjects,
        imageImpression: input.imageImpression,
        imageReferenceIds: JSON.stringify(input.imageReferenceIds),
      },
    });
  });

  return getDashboardState(post.projectId);
}

export async function setPostStatus(postId: string, status: PostStatus) {
  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
    select: { projectId: true },
  });

  if (!post) {
    throw new Error("Post not found.");
  }

  await prisma.contentPost.update({
    where: { id: postId },
    data: { status },
  });

  return getDashboardState(post.projectId);
}

export async function saveImageAsset(projectId: number, input: ImageAssetInput) {
  await ensureProjectData(projectId);

  await prisma.imageAsset.create({
    data: {
      projectId,
      type: input.type,
      name: input.name,
      sourcePath: input.sourcePath,
      description: input.description,
      productCategory: input.productCategory,
      colors: input.colors,
      tags: input.tags,
      notes: input.notes,
      isActive: input.isActive,
    },
  });

  return getDashboardState(projectId);
}

export async function updateImageAsset(assetId: string, input: ImageAssetInput) {
  const asset = await prisma.imageAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    throw new Error("Image asset not found.");
  }

  await prisma.imageAsset.update({
    where: { id: assetId },
    data: {
      type: input.type,
      name: input.name,
      sourcePath: input.sourcePath,
      description: input.description,
      productCategory: input.productCategory,
      colors: input.colors,
      tags: input.tags,
      notes: input.notes,
      isActive: input.isActive,
    },
  });

  return getDashboardState(asset.projectId);
}

export async function savePlanEvent(projectId: number, input: PlanEventInput) {
  await ensureProjectData(projectId);

  await prisma.planEvent.create({
    data: {
      projectId,
      type: input.type,
      title: input.title,
      eventDate: input.eventDate,
      description: input.description,
      requiredTopic: input.requiredTopic,
      offer: input.offer,
      platform: input.platform,
      isActive: input.isActive,
    },
  });

  return getDashboardState(projectId);
}

export async function updatePlanEvent(eventId: string, input: PlanEventInput) {
  const event = await prisma.planEvent.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new Error("Plan event not found.");
  }

  await prisma.planEvent.update({
    where: { id: eventId },
    data: {
      type: input.type,
      title: input.title,
      eventDate: input.eventDate,
      description: input.description,
      requiredTopic: input.requiredTopic,
      offer: input.offer,
      platform: input.platform,
      isActive: input.isActive,
    },
  });

  return getDashboardState(event.projectId);
}

export async function savePublishedPost(projectId: number, input: PublishedPostInput) {
  await ensureProjectData(projectId);
  const parsed = await parsePublishedPostPreview(input.postUrl);

  await prisma.publishedPost.create({
    data: {
      projectId,
      platform: input.platform,
      postUrl: input.postUrl,
      publishedAt: input.publishedAt,
      title: input.title || parsed.title,
      textPreview: input.textPreview || parsed.textPreview,
      imageUrl: input.imageUrl || parsed.imageUrl,
      format: input.format,
      views: input.views,
      reach: input.reach,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
      profileVisits: input.profileVisits,
      followerGain: input.followerGain,
      leads: input.leads,
      notes: input.notes,
    },
  });

  return getDashboardState(projectId);
}

export async function saveCompetitorPost(projectId: number, input: CompetitorPostInput) {
  await ensureProjectData(projectId);

  await prisma.competitorPost.create({
    data: {
      projectId,
      sourceType: input.sourceType,
      competitorName: input.competitorName,
      platform: input.platform,
      postUrl: input.postUrl,
      publishedAt: input.publishedAt,
      format: input.format,
      theme: input.theme,
      hook: input.hook,
      visualPattern: input.visualPattern,
      offer: input.offer,
      cta: input.cta,
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
      notes: input.notes,
      isActive: input.isActive,
    },
  });

  return getDashboardState(projectId);
}

export async function generatePostPacket(postId: string) {
  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
  });

  if (!post) {
    throw new Error("Post not found.");
  }

  const [profile, settings] = await Promise.all([
    prisma.projectProfile.findUniqueOrThrow({ where: { projectId: post.projectId } }),
    prisma.appSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } }),
  ]);
  const competitorPosts = await prisma.competitorPost.findMany({
    where: {
      projectId: post.projectId,
      isActive: true,
      capturedAt: {
        gte: subDays(new Date(), 90),
      },
    },
    orderBy: {
      capturedAt: "desc",
    },
  });
  const captionPatterns = selectCaptionInspirationPatterns(post, buildCompetitorPlanPatterns(competitorPosts));

  const packet = await buildPacket(post, profile, settings, captionPatterns);

  await prisma.campaignPacket.upsert({
    where: { postId },
    update: {
      objective: packet.objective,
      targetPlatform: post.platform,
      coreAngle: packet.coreAngle,
      hookVariants: JSON.stringify(packet.hookVariants),
      captionVariants: JSON.stringify(packet.captionVariants),
      ctaVariants: JSON.stringify(packet.ctaVariants),
      hashtagSet: JSON.stringify(packet.hashtagSet),
      visualBrief: packet.visualBrief,
      imagePromptVariants: JSON.stringify(packet.imagePromptVariants),
      reviewChecklist: JSON.stringify(packet.reviewChecklist),
      videoScript: packet.videoScript ? JSON.stringify(packet.videoScript) : "",
      carouselSlides: JSON.stringify(packet.carouselSlides ?? []),
      bannerBrief: packet.bannerBrief ? JSON.stringify(packet.bannerBrief) : "",
    },
    create: {
      postId,
      objective: packet.objective,
      targetPlatform: post.platform,
      coreAngle: packet.coreAngle,
      hookVariants: JSON.stringify(packet.hookVariants),
      captionVariants: JSON.stringify(packet.captionVariants),
      ctaVariants: JSON.stringify(packet.ctaVariants),
      hashtagSet: JSON.stringify(packet.hashtagSet),
      visualBrief: packet.visualBrief,
      imagePromptVariants: JSON.stringify(packet.imagePromptVariants),
      reviewChecklist: JSON.stringify(packet.reviewChecklist),
      videoScript: packet.videoScript ? JSON.stringify(packet.videoScript) : "",
      carouselSlides: JSON.stringify(packet.carouselSlides ?? []),
      bannerBrief: packet.bannerBrief ? JSON.stringify(packet.bannerBrief) : "",
    },
  });

  return getDashboardState(post.projectId);
}

export async function renderPostImages(postId: string, mode = "cover") {
  const [post, settings] = await Promise.all([
    prisma.contentPost.findUnique({
      where: { id: postId },
      include: {
        packet: true,
      },
    }),
    prisma.appSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } }),
  ]);

  if (!post || !post.packet) {
    throw new Error("Generate a campaign packet before rendering images.");
  }

  const postWithPacket = post as ContentPost & { packet: CampaignPacket };
  const prompts = safeArray(post.packet.imagePromptVariants);
  const renderMode = normalizeRenderMode(mode, post);

  const referenceImages = await prisma.imageAsset.findMany({
    where: {
      projectId: post.projectId,
      id: {
        in: safeArray(post.imageReferenceIds),
      },
      isActive: true,
    },
  });
  const referenceList = referenceImages.map((asset) => ({
    name: asset.name,
    sourcePath: asset.sourcePath,
    type: asset.type,
  }));

  if (renderMode === "carousel") {
    const slidePrompts = buildCarouselSlideRenderPrompts(postWithPacket);

    // Render real per-slide images from the packet's carouselSlides[].mediaPrompt
    // when we have per-slide briefs AND a configured image provider. Otherwise
    // fall back to the local SVG typography slides, which need no provider so the
    // carousel button keeps working even before image rendering is set up.
    if (slidePrompts.length && isImageRenderingConfigured(settings)) {
      const slideImages: Array<{ prompt: string; imagePath: string; variant: number }> = [];

      for (const [index, prompt] of slidePrompts.entries()) {
        const imagePath = await renderPromptToImage({
          prompt,
          postId,
          variant: index + 1,
          settings,
          imageFormatKey: post.imageFormatKey,
          productId: post.productId,
          referenceImages: referenceList,
        });

        slideImages.push({ prompt, imagePath, variant: index + 1 });
      }

      await replaceGeneratedImages(postId, slideImages);
      return getDashboardState(post.projectId);
    }

    await replaceGeneratedImages(postId, buildCarouselSlideImages(postWithPacket));
    return getDashboardState(post.projectId);
  }

  const promptsToRender = buildShootStudioRenderPrompts(postWithPacket, prompts, renderMode);

  if (!promptsToRender.length) {
    throw new Error("The packet must contain image prompts before rendering.");
  }

  const images: Array<{ prompt: string; imagePath: string; variant: number }> = [];

  for (const [index, prompt] of promptsToRender.entries()) {
    const imagePath = await renderPromptToImage({
      prompt,
      postId,
      variant: index + 1,
      settings,
      imageFormatKey: post.imageFormatKey,
      productId: post.productId,
      referenceImages: referenceList,
    });

    images.push({
      prompt,
      imagePath,
      variant: index + 1,
    });
  }

  await replaceGeneratedImages(postId, images);

  return getDashboardState(post.projectId);
}

function normalizeRenderMode(mode: string, post: ContentPost) {
  const value = mode.toLowerCase();

  if (value === "carousel") return "carousel";
  if (value === "scene_refs") return "scene_refs";
  // Generic "image" requests follow the post type: carousels render slides, the
  // rest render a single cover (banner brief is handled inside the cover path).
  if (value === "image") return post.postType === "CAROUSEL" ? "carousel" : "cover";

  return "cover";
}

// Shared frame-type guidance so render prompts respect whether a frame is a
// model shot, product-only, useful/infographic, or a custom brief.
function frameTypeRenderGuidance(frameType: FrameTypeValue, frameDescription: string) {
  switch (frameType) {
    case "PRODUCT_ONLY":
      return "Product-only composition: no model, focus on fabric, fit, and construction detail.";
    case "USEFUL":
      return "Useful / infographic style: clean explanatory layout, minimal props, room for callouts.";
    case "OTHER":
      return frameDescription ? `Custom frame: ${frameDescription}.` : "Custom frame as briefed.";
    case "WITH_PERSON":
    default:
      return "With a model: adult woman 38-55, real-life tasteful moment, product readable.";
  }
}

// Turns the packet's per-slide carousel briefs into standalone render prompts.
// Returns [] when the packet has no carouselSlides (so the caller falls back to
// the local SVG typography slides).
function buildCarouselSlideRenderPrompts(post: ContentPost & { packet: CampaignPacket }): string[] {
  const slides = parseCarouselSlides(post.packet.carouselSlides);

  return slides
    .map((slide) => {
      const base = slide.mediaPrompt || post.packet.visualBrief || post.visualConcept || post.angle;
      if (!base) return "";
      return [
        base,
        `Carousel ${slide.kicker || `slide ${slide.index}`} for "${post.theme}".`,
        frameTypeRenderGuidance(slide.frameType, slide.frameDescription),
        "Leave clean negative space for the headline typography added later. No text in the image.",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean);
}

function buildShootStudioRenderPrompts(post: ContentPost & { packet: CampaignPacket }, prompts: string[], mode: string) {
  const seedPrompt = prompts[0] || post.packet.visualBrief || post.visualConcept || post.angle;

  if (mode === "scene_refs") {
    // Prefer the generated video script's scenes as filming references; fall back
    // to the generic three-beat structure when there is no script yet.
    const videoScript = parseVideoScript(post.packet.videoScript);
    if (videoScript && videoScript.scenes.length) {
      return videoScript.scenes.map((scene) =>
        [
          scene.description || seedPrompt,
          `Scene reference ${scene.index} for "${post.theme}".`,
          "Make it useful as a filming reference: clear composition, adult model, product readable, no text.",
        ].join("\n"),
      );
    }

    return [
      [
        seedPrompt,
        `Scene reference 1: first-frame / cover scene for "${post.theme}".`,
        "Make it useful as a filming reference: clear composition, adult model, product readable, no text.",
      ].join("\n"),
      [
        seedPrompt,
        `Scene reference 2: problem or tension moment for "${post.angle}".`,
        "Show the real-life situation clearly, tasteful and social-ready, no text.",
      ].join("\n"),
      [
        seedPrompt,
        `Scene reference 3: product proof / detail moment for "${post.goal}".`,
        "Focus on product logic, fabric, fit, comfort, or outfit use. No text.",
      ].join("\n"),
    ];
  }

  // BANNER posts render a single banner background from the banner brief.
  if (post.postType === "BANNER") {
    const banner = parseBannerBrief(post.packet.bannerBrief);
    if (banner && (banner.imagePrompt || banner.overlayText)) {
      return [
        [
          banner.imagePrompt || seedPrompt,
          `Banner background for "${post.theme}".`,
          frameTypeRenderGuidance(banner.frameType, banner.frameDescription),
          banner.overlayText
            ? `Leave generous clean negative space for the overlay text: "${banner.overlayText}".`
            : "Leave generous clean negative space for overlay text.",
          "No text in the image.",
        ].join("\n"),
      ];
    }
  }

  // VIDEO cover uses the script's first-frame hook as the framing intent.
  const coverHook = post.postType === "VIDEO" ? parseVideoScript(post.packet.videoScript)?.coverHook ?? "" : "";

  return [
    [
      seedPrompt,
      `Cover image for "${post.theme}".`,
      coverHook ? `First-frame hook: "${coverHook}".` : "",
      "Create one strong social first-frame image. Leave clean negative space for typography added later. No text in the image.",
    ]
      .filter(Boolean)
      .join("\n"),
  ];
}

async function replaceGeneratedImages(postId: string, images: Array<{ prompt: string; imagePath: string; variant: number }>) {
  await prisma.$transaction(async (tx) => {
    await tx.generatedImage.deleteMany({
      where: { postId },
    });

    await tx.generatedImage.createMany({
      data: images.map((image) => ({
        postId,
        prompt: image.prompt,
        imagePath: image.imagePath,
        variant: image.variant,
      })),
    });
  });
}

function buildCarouselSlideImages(post: ContentPost & { packet: CampaignPacket }) {
  const slides = buildCarouselSlideCopy(post);

  return slides.map((slide, index) => ({
    prompt: `${slide.kicker}: ${slide.title}${slide.body ? ` - ${slide.body}` : ""}`,
    imagePath: svgDataUrl(renderCarouselSlideSvg(slide, index, slides.length, post)),
    variant: index + 1,
  }));
}

function buildCarouselSlideCopy(post: ContentPost & { packet: CampaignPacket }) {
  // Prefer the generated per-slide carousel copy when the packet has it, so the
  // SVG typography slides match the briefed structure instead of the generic
  // hardcoded fallback below.
  const generated = parseCarouselSlides(post.packet.carouselSlides);
  if (generated.length) {
    return generated.map((slide, index) => ({
      kicker: slide.kicker || `Slide ${String(index + 1).padStart(2, "0")}`,
      title: cleanCarouselLine(slide.headline || slide.body || post.angle),
      body: cleanCarouselLine(slide.body || slide.headline || ""),
      footer: index === 0 ? "Swipe" : index === generated.length - 1 ? "Save" : `${index + 1}/${generated.length}`,
    }));
  }

  const hooks = safeArray(post.packet.hookVariants);
  const captions = safeArray(post.packet.captionVariants);
  const ctas = safeArray(post.packet.ctaVariants);
  const hook = cleanCarouselLine(hooks[0] || post.angle || post.theme);
  const secondHook = cleanCarouselLine(hooks[1] || post.packet.coreAngle || post.angle);
  const core = cleanCarouselLine(post.packet.coreAngle || post.angle);
  const captionTakeaway = cleanCarouselLine(captions[0] || post.instagramExecution || post.tiktokExecution || post.packet.visualBrief);
  const cta = cleanCarouselLine(ctas[0] || "Save this before your next order.");

  return [
    {
      kicker: "Slide 01",
      title: hook,
      body: "A small fit clue that changes the whole decision.",
      footer: "Swipe",
    },
    {
      kicker: "Slide 02",
      title: secondHook,
      body: "The mirror gives one version. Movement, sitting, and real clothes give another.",
      footer: "Reality check",
    },
    {
      kicker: "Slide 03",
      title: core,
      body: "Look for pressure, rolling, straps, fabric tension, and where the garment goes after ten minutes.",
      footer: "Fit logic",
    },
    {
      kicker: "Slide 04",
      title: cleanCarouselLine(post.visualConcept || post.packet.visualBrief || post.goal),
      body: captionTakeaway,
      footer: "ILARIA note",
    },
    {
      kicker: "Slide 05",
      title: cta,
      body: "Use this as a calm shopping rule, not a body judgment.",
      footer: "Save",
    },
  ];
}

function renderCarouselSlideSvg(
  slide: { kicker: string; title: string; body: string; footer: string },
  index: number,
  total: number,
  post: ContentPost,
) {
  const palettes = [
    { bg: "#fff7ef", panel: "#f0ded2", ink: "#1f2933", accent: "#9d5c46", soft: "#f8eadf" },
    { bg: "#f4f7f2", panel: "#dce8d9", ink: "#1f2933", accent: "#526f5a", soft: "#eef4ea" },
    { bg: "#f7f3ea", panel: "#e4d5bd", ink: "#1f2933", accent: "#7b6046", soft: "#f0e6d5" },
    { bg: "#f2f6f8", panel: "#d7e5e8", ink: "#1f2933", accent: "#4d7480", soft: "#eaf2f4" },
    { bg: "#fffaf4", panel: "#e8d7c9", ink: "#1f2933", accent: "#8b5146", soft: "#f7ede3" },
  ];
  const palette = palettes[index % palettes.length];
  const titleLines = wrapSvgText(slide.title, 22, 5);
  const bodyLines = wrapSvgText(slide.body, 44, 5);
  const visualLines = wrapSvgText(post.goal, 28, 2);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${palette.bg}"/>
  <rect x="54" y="54" width="972" height="1242" rx="42" fill="${palette.soft}" stroke="${palette.panel}" stroke-width="2"/>
  <circle cx="925" cy="170" r="72" fill="${palette.panel}"/>
  <circle cx="170" cy="1160" r="110" fill="${palette.panel}" opacity="0.72"/>
  <rect x="92" y="92" width="896" height="1166" rx="28" fill="none" stroke="${palette.accent}" stroke-width="3" opacity="0.18"/>
  <text x="116" y="170" fill="${palette.accent}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="4">${escapeSvg(slide.kicker)}</text>
  <text x="116" y="250" fill="${palette.ink}" font-family="Inter, Arial, sans-serif" font-size="78" font-weight="800">
    ${titleLines.map((line, lineIndex) => `<tspan x="116" dy="${lineIndex === 0 ? 0 : 88}">${escapeSvg(line)}</tspan>`).join("")}
  </text>
  <text x="116" y="${titleBlockY(titleLines.length)}" fill="${palette.ink}" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="500">
    ${bodyLines.map((line, lineIndex) => `<tspan x="116" dy="${lineIndex === 0 ? 0 : 48}">${escapeSvg(line)}</tspan>`).join("")}
  </text>
  <g transform="translate(116 990)">
    <rect width="420" height="126" rx="28" fill="${palette.panel}" opacity="0.88"/>
    <text x="34" y="48" fill="${palette.accent}" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="3">CONTENT ROLE</text>
    <text x="34" y="88" fill="${palette.ink}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="650">
      ${visualLines.map((line, lineIndex) => `<tspan x="34" dy="${lineIndex === 0 ? 0 : 34}">${escapeSvg(line)}</tspan>`).join("")}
    </text>
  </g>
  <text x="116" y="1210" fill="${palette.accent}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="3">${escapeSvg(slide.footer)}</text>
  <text x="902" y="1210" fill="${palette.ink}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700">${index + 1}/${total}</text>
</svg>`.trim();
}

function titleBlockY(lineCount: number) {
  return 310 + Math.max(1, lineCount) * 88;
}

function cleanCarouselLine(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[“”]/g, '"').replace(/[’]/g, "'");
}

function wrapSvgText(text: string, maxChars: number, maxLines: number) {
  const words = cleanCarouselLine(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }

    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (words.join(" ").length > lines.join(" ").length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.。,…,\s]+$/u, "")}...`;
  }

  return lines.length ? lines : [""];
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").replace(/\s+/g, " ").trim();
}

export async function savePostReview(postId: string, input: Metrics & { manualVerdict: ManualVerdict; manualNote: string }) {
  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
    include: {
      review: true,
    },
  });

  if (!post) {
    throw new Error("Post not found.");
  }

  const thirtyDaysAgo = subDays(new Date(), 30);

  const historicalReviews = await prisma.reviewResult.findMany({
    where: {
      post: {
        projectId: post.projectId,
        platform: post.platform,
      },
      reviewedAt: {
        gte: thirtyDaysAgo,
      },
      NOT: {
        postId,
      },
    },
  });

  const fallbackReviews =
    historicalReviews.length > 0
      ? historicalReviews
      : await prisma.reviewResult.findMany({
          where: {
            post: {
              projectId: post.projectId,
              platform: post.platform,
            },
            NOT: {
              postId,
            },
          },
        });

  const { score, autoClass } = computeAutoScore(input, fallbackReviews);

  await prisma.reviewResult.upsert({
    where: { postId },
    update: {
      reach: input.reach,
      views: input.views,
      likes: input.likes,
      leads: input.leads,
      followerGain: input.followerGain,
      manualVerdict: input.manualVerdict,
      manualNote: input.manualNote,
      autoScore: score,
      autoClass,
      reviewedAt: new Date(),
    },
    create: {
      postId,
      reach: input.reach,
      views: input.views,
      likes: input.likes,
      leads: input.leads,
      followerGain: input.followerGain,
      manualVerdict: input.manualVerdict,
      manualNote: input.manualNote,
      autoScore: score,
      autoClass,
      reviewedAt: new Date(),
    },
  });

  await prisma.contentPost.update({
    where: { id: postId },
    data: {
      status: PostStatus.DONE,
    },
  });

  await recomputeInsights(post.projectId);

  return getDashboardState(post.projectId);
}

export async function recomputeInsights(projectId = DEFAULT_PROJECT_ID) {
  await ensureProjectData(projectId);

  const publishedPosts = await prisma.publishedPost.findMany({
    where: {
      projectId,
    },
    orderBy: {
      capturedAt: "desc",
    },
  });

  if (!publishedPosts.length) {
    await prisma.themeRecommendation.deleteMany({
      where: {
        projectId,
      },
    });

    return getDashboardState(projectId);
  }

  const patterns = groupPublishedRecommendations(publishedPosts);
  const [profile, settings] = await Promise.all([
    prisma.projectProfile.findUniqueOrThrow({ where: { projectId } }),
    prisma.appSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } }),
  ]);

  const recommendations = await buildRecommendations(patterns, profile, settings);

  await prisma.$transaction(async (tx) => {
    await tx.themeRecommendation.deleteMany({
      where: {
        projectId,
      },
    });
    await tx.themeRecommendation.createMany({
      data: recommendations.map((recommendation, index) => ({
        projectId,
        rank: index + 1,
        theme: recommendation.theme,
        goal: recommendation.goal,
        platform: recommendation.platform,
        reason: recommendation.reason,
        suggestedNextAngle: recommendation.suggestedNextAngle,
        evidence: JSON.stringify(recommendation.evidence),
      })),
    });
  });

  return getDashboardState(projectId);
}

async function buildMonthlyPlan(
  profile: ProjectProfileDto | ProjectProfile,
  settings: AppSettings,
  existingThemes: string[],
  competitorPatterns: CompetitorPlanPattern[] = [],
  targetPostCount = 30,
  recommendations: ThemeRecommendation[] = [],
) {
  const normalizedProfile = normalizeProfile(profile);
  const targetCount = clampPostCount(targetPostCount);
  const promptStartDate = resolvePlanningPeriod(profile).startDate;
  const recommendationContext = recommendations.map((recommendation) => ({
    theme: recommendation.theme,
    goal: recommendation.goal,
    platform: recommendation.platform,
    reason: recommendation.reason,
    suggestedNextAngle: recommendation.suggestedNextAngle,
    evidence: safeObject(recommendation.evidence),
  }));
  const targetCompetitorCount = Math.min(Math.ceil(targetCount * 0.45), competitorPatterns.length);
  const competitorShare = competitorPatterns.length
    ? `${targetCompetitorCount} inspiration-based adaptations, several analytics-backed follow-ups when available, and ${targetCount - targetCompetitorCount} ILARIA-original strategic gap-fill posts`
    : `0 inspiration-based adaptations, analytics-backed follow-ups when available, and ${targetCount} ILARIA-original strategic gap-fill posts`;

  try {
    const response = await generateJsonWithTextRoute<RawPlanResponse>({
      settings,
      task: "plan",
      prompt: [
        `You are generating a ${targetCount}-post social content plan for ILARIA, a comfort-first intimates and shapewear brand.`,
        "Return JSON only.",
        `Return one object with key items, where items is an array of exactly ${targetCount} posts.`,
        `Brand: ${normalizedProfile.brandName}`,
        `Audience: ${normalizedProfile.audience}`,
        `Always-on offers: ${normalizedProfile.offers.join(", ")}`,
        `Goals: ${normalizedProfile.goals.join(", ")}`,
        `Content pillars: ${normalizedProfile.contentPillars.join(", ")}`,
        `Current priorities: ${normalizedProfile.currentPriorities.join(", ")}`,
        `Planning period: ${formatISO(promptStartDate, { representation: "date" })} to ${formatISO(addDays(promptStartDate, targetCount - 1), { representation: "date" })}`,
        `Monthly campaign/name: ${normalizedProfile.monthlyCampaignName || "not specified"}`,
        `Monthly platform focus: ${normalizedProfile.monthlyPlatformFocus}`,
        `Monthly product/product group focus: ${normalizedProfile.monthlyProductFocus || "not specified"}`,
        `Monthly offers: ${normalizedProfile.monthlyOffers.join(", ") || "not specified"}`,
        `Monthly priorities: ${normalizedProfile.monthlyPriorities.join(", ") || "not specified"}`,
        `Must include this month: ${normalizedProfile.monthlyMustInclude.join(", ") || "not specified"}`,
        `Avoid this month: ${normalizedProfile.monthlyAvoid.join(", ") || "not specified"}`,
        `Visual fonts: ${normalizedProfile.visualFonts}`,
        `Visual colors: ${normalizedProfile.visualColors}`,
        `Logo reference: ${normalizedProfile.logoReferenceUrl}`,
        `Product reference folder/file: ${normalizedProfile.productReferenceUrl}`,
        `Banner/layout reference folder/file: ${normalizedProfile.bannerReferenceUrl}`,
        `Layout reference notes: ${normalizedProfile.layoutReferenceNotes}`,
        `Tone: ${normalizedProfile.tone}`,
        `Language: ${normalizedProfile.language}`,
        `Existing reviewed themes to learn from: ${existingThemes.join(", ") || "none"}`,
        `Published-post analytics recommendations to prioritize: ${recommendationContext.length ? JSON.stringify(recommendationContext) : "none recomputed yet"}`,
        `Inspiration patterns from last 30 days: ${competitorPatterns.length ? JSON.stringify(competitorPatterns.slice(0, Math.min(15, targetCount)).map(publicCompetitorPattern)) : "none captured yet"}`,
        `Balance requirement: create ${competitorShare}. Prioritize our own published-post winners first, then competitor inspiration, then strategy gap-fill. The final plan should feel about 50/50 or 60/40, never a full competitor copy.`,
        "For analytics-backed follow-ups: repeat the winning format/visual type/behavior from recommendations, but change the theme angle so the content does not feel duplicated.",
        "For inspiration-based posts: adapt the mechanic, hook structure, CTA, offer, or visual system into ILARIA's voice. Do not copy wording, claims, product truth, or brand identity.",
        "Never include competitor names, source brand names, source collection names, source URLs, or source product names in final post fields. Replace source product truth with ILARIA product truth.",
        "For ILARIA-original posts: fill funnel and pillar gaps: attraction, education, trust, desire, conversion; include fit reassurance, long-wear comfort, size/returns trust, support construction, product-on-body, styling, reviews, and TikTok Shop reassurance.",
        "Competitor pattern families allowed: Honeylove-like support without squeeze, Leonisa-like real proof, Shapermint-like fit guidance, Yummie-like everyday comfort, Shapellx-like social-commerce demo, Underoutfit-like fit reassurance. SKIMS is style reference only, not a performance benchmark.",
        `Plan one content idea per day. Respect the monthly platform focus ${normalizedProfile.monthlyPlatformFocus}; if it is BOTH, publish on TikTok and Instagram at the same time.`,
        "Mix formats: reels, carousels, editorial graphics, product close-up banners, review/proof posts, and collage-style posts.",
        'Each item must be shaped as {"platform":"BOTH","goal":"...","format":"Reel|Carousel|Editorial graphic|Product banner|Collage","theme":"...","angle":"...","visualConcept":"...","tiktokExecution":"...","instagramExecution":"..."}',
        "Mark adapted inspiration ideas inside visualConcept or execution notes with a short phrase like 'Inspiration-based adaptation: ...'. Mark original ILARIA gap-fill ideas with 'ILARIA original gap-fill: ...'.",
        "The content must feel tasteful, vivid, and desirable for women 38-55: adult-life humor, style, long-day comfort, fit reassurance, and soft sensual modern visuals.",
        "Use specific hooks like group chat reality, 6 PM bra patience, chair test, low-rise jeans memory, fitted dress base layer, Nancy Meyers morning vs calendar.",
        "Do not use these words or ideas: goddess, sexy, unapologetic confidence, real women real results, empower, transform your body, hide flaws, perfect hourglass.",
      ].join("\n"),
    });

    const plan = extractPlanItems(response);

    if (Array.isArray(plan) && plan.length >= targetCount && planLooksUsable(plan)) {
      return plan.slice(0, targetCount).map((item, index) => normalizePlanItem(item, normalizedProfile, index));
    }
  } catch (error) {
    console.warn("Content plan generation fell back to local ILARIA strategy.", error);
  }

  return buildPlanFallback(normalizedProfile, competitorPatterns, targetCount, recommendations);
}

// Resolves a human-readable product brief for the LLM from the explicit
// productId chosen in the editor. Uses the bundled catalog snapshot (no network
// call needed just to describe the garment in a text prompt); an empty/unknown
// id means "auto — let the model infer the product from the brief".
function buildProductContext(productId: string): string {
  const product = findShootStudioProduct(productId, SHOOT_STUDIO_PRODUCTS);
  if (!product) {
    return "Product: auto — infer the most fitting ILARIA product from the brief.";
  }
  return [
    `Product: ${product.name} (${product.category})`,
    `Fit promise: ${product.fitPromise}`,
    `Key needs: ${product.needs.join(", ")}`,
    `Colors: ${product.colors.join(", ")}`,
    `Sizes: ${product.sizes}`,
  ].join("\n");
}

// Per-PostType packet instructions. Each post type carries a different packet
// structure (a filmable script, per-slide briefs, or a single banner brief), so
// we append the matching instruction block + requested key to the LLM prompt.
function buildPostTypeInstructions(post: ContentPost): string[] {
  const frameLine =
    post.defaultFrameType === "OTHER" && post.frameDescription
      ? `Default frame type: OTHER — ${post.frameDescription}.`
      : `Default frame type: ${post.defaultFrameType}.`;

  if (post.postType === "VIDEO") {
    return [
      "This is a VIDEO (reel/TikTok) post.",
      frameLine,
      "Also return a videoScript object with keys: coverHook (string, the first-frame hook), totalDurationSec (number, 15-45), and scenes (array of 3-6 objects).",
      "Each scene object has keys: index (1-based number), durationSec (number), description (what is filmed in this scene), onScreenText (caption burned on screen), voiceOver (spoken line, may be empty).",
      "Scenes must form a clear filmable sequence: hook, problem/tension, product proof, payoff/CTA. Keep each scene concrete and shootable.",
    ];
  }

  if (post.postType === "CAROUSEL") {
    return [
      "This is a CAROUSEL (multi-slide) post.",
      frameLine,
      "Also return carouselSlides: an array of 5-7 slide objects.",
      "Each slide object has keys: index (1-based number), frameType (one of WITH_PERSON, PRODUCT_ONLY, USEFUL, OTHER), frameDescription (string; fill ONLY when frameType is OTHER, else empty string), kicker (short label like 'Slide 01'), headline (string), body (string), mediaPrompt (a concrete standalone image prompt to shoot THIS slide).",
      "Vary frameType across the slides (mix WITH_PERSON, PRODUCT_ONLY, and at least one USEFUL/infographic slide). Each mediaPrompt must stand on its own as an image brief.",
    ];
  }

  return [
    "This is a BANNER (single static image with text) post.",
    frameLine,
    "Also return a bannerBrief object with keys: frameType (one of WITH_PERSON, PRODUCT_ONLY, USEFUL, OTHER), frameDescription (string; fill ONLY when frameType is OTHER, else empty string), overlayText (the text shown on the banner), imagePrompt (a concrete image prompt for the banner background with clean negative space for the overlay text).",
  ];
}

async function buildPacket(
  post: ContentPost,
  profile: ProjectProfile,
  settings: AppSettings,
  captionPatterns: CompetitorPlanPattern[] = [],
) {
  const normalizedProfile = normalizeProfile(profile);
  const captionStyleGuide = buildCaptionStyleGuide(captionPatterns);
  const postTypeInstructions = buildPostTypeInstructions(post);
  const typeSpecificKey =
    post.postType === "VIDEO"
      ? "Also include a videoScript object as described above."
      : post.postType === "CAROUSEL"
        ? "Also include a carouselSlides array as described above."
        : "Also include a bannerBrief object as described above.";

  try {
    const packet = await generateJsonWithTextRoute<GeneratedPacket>({
      settings,
      task: "copy",
      prompt: [
        "You are generating a social campaign packet. Return JSON only.",
        `Brand: ${normalizedProfile.brandName}`,
        `Audience: ${normalizedProfile.audience}`,
        `Offers: ${normalizedProfile.offers.join(", ")}`,
        `Goals: ${normalizedProfile.goals.join(", ")}`,
        `Content pillars: ${normalizedProfile.contentPillars.join(", ")}`,
        `Current priorities: ${normalizedProfile.currentPriorities.join(", ")}`,
        `Brand voice: ${settings.brandVoice}`,
        `Language: ${normalizedProfile.language}`,
        `Platform: ${post.platform}`,
        `Post type: ${post.postType}`,
        `Format: ${post.format}`,
        `Goal: ${post.goal}`,
        `Theme: ${post.theme}`,
        `Angle: ${post.angle}`,
        `Visual concept: ${post.visualConcept}`,
        `TikTok execution: ${post.tiktokExecution}`,
        `Instagram execution: ${post.instagramExecution}`,
        `Prepared asset links for this post: ${post.assetLinks}`,
        buildProductContext(post.productId),
        `Visual fonts: ${normalizedProfile.visualFonts}`,
        `Visual colors: ${normalizedProfile.visualColors}`,
        `Product reference folder/file: ${normalizedProfile.productReferenceUrl}`,
        `Banner/layout reference folder/file: ${normalizedProfile.bannerReferenceUrl}`,
        `Layout reference notes: ${normalizedProfile.layoutReferenceNotes}`,
        `Caption inspiration patterns to adapt, not copy: ${captionStyleGuide || "none captured yet"}`,
        'Return one object with keys objective, coreAngle, hookVariants (3 strings), captionVariants (2 strings), ctaVariants (2 strings), hashtagSet (8 strings), visualBrief, imagePromptVariants (2 strings), reviewChecklist (3 strings).',
        ...postTypeInstructions,
        typeSpecificKey,
        "When a product is named above, make the copy, scenes/slides/banner, and every image prompt specifically about THAT product (its fit promise, needs, and construction). Do not drift to a different garment.",
        "Caption rules:",
        "- Captions must sound social-native, specific, and human, not like brand manifesto copy.",
        "- Use one concrete opening line from the post angle, then a short useful observation, proof, or fit logic.",
        "- Adapt competitor/inspiration mechanics only as structure: hook shape, comment cue, offer cue, proof rhythm, or saveable framing. Do not copy competitor wording.",
        "- For reels: caption should be short, witty, and easy to pair with a cover hook.",
        "- For carousels: caption should tell people why to save or swipe, then add one practical takeaway.",
        "- For banners/offers: caption should connect the offer to a real-life reason to act now, not shout generic discount language.",
        "- Avoid generic lines like 'discover comfort', 'feel confident', 'upgrade your wardrobe', 'designed for every body', or 'embrace your curves'.",
        "Hashtag rules:",
        `- The first hashtag must be ${ILARIA_BRAND_HASHTAG}.`,
        "- Add searchable product/category hashtags people would use to find the item, such as shapewear, bra fit, seamless underwear, bodysuit, no-show underwear, comfortable bra, or full bust support.",
        "- Avoid vague mood-only hashtags unless there is still room after product search tags.",
        "Make the copy operational and ready to paste into Instagram/TikTok.",
      ].join("\n"),
    });

    if (
      packet &&
      Array.isArray(packet.hookVariants) &&
      Array.isArray(packet.imagePromptVariants) &&
      packetLooksUsable(packet)
    ) {
      return normalizePacket(packet, post, normalizedProfile, captionPatterns);
    }
  } catch (error) {
    console.warn("Campaign packet generation fell back to local ILARIA strategy.", error);
  }

  return buildPacketFallback(post, normalizedProfile, captionPatterns);
}

async function buildRecommendations(
  patterns: RecommendationSeed[],
  profile: ProjectProfile,
  settings: AppSettings,
) {
  const normalizedProfile = normalizeProfile(profile);
  const topPatterns = patterns.slice(0, 5);

  if (!topPatterns.length) {
    return buildRecommendationFallback(normalizedProfile.contentPillars.slice(0, 3).map((theme, index) => ({
      theme,
      goal: normalizedProfile.goals[index % normalizedProfile.goals.length] ?? "Follower growth",
      platform: index % 2 === 0 ? Platform.INSTAGRAM : Platform.TIKTOK,
      medianScore: 1,
      notes: [],
      wins: ["baseline"],
      basedOnPosts: 0,
    })));
  }

  try {
    const response = await generateJsonWithTextRoute<
      Array<{
        theme: string;
        goal: string;
        platform: Platform;
        reason: string;
        suggestedNextAngle: string;
        evidence: Record<string, unknown>;
      }>
    >({
      settings,
      task: "insights",
      prompt: [
        "You are creating the next three recommendations from published social post performance history.",
        "Return JSON only.",
        `Brand: ${normalizedProfile.brandName}`,
        `Goals: ${normalizedProfile.goals.join(", ")}`,
        `Content pillars: ${normalizedProfile.contentPillars.join(", ")}`,
        `Brand voice: ${settings.brandVoice}`,
        `Top patterns: ${JSON.stringify(topPatterns)}`,
        'Return exactly 3 items shaped as {"theme":"...","goal":"...","platform":"INSTAGRAM"|"TIKTOK","reason":"...","suggestedNextAngle":"...","evidence":{"medianScore":number,"wins":[string],"basedOnPosts":number}}',
        "Explain what worked, including whether video, carousel, banner, collage, person/product-on-body, or graphic/text-led content performed best.",
        "Each recommendation should say which format to use more often and what to apply to the next posts.",
      ].join("\n"),
    });

    if (Array.isArray(response) && response.length) {
      return response.slice(0, 3).map((item, index) => ({
        theme: item.theme || topPatterns[index % topPatterns.length]?.theme || normalizedProfile.contentPillars[index] || "Operational transparency",
        goal: item.goal || topPatterns[index % topPatterns.length]?.goal || normalizedProfile.goals[index] || "Follower growth",
        platform: item.platform || topPatterns[index % topPatterns.length]?.platform || Platform.INSTAGRAM,
        reason: item.reason || "This pattern is outperforming your baseline and worth repeating with a new angle.",
        suggestedNextAngle:
          item.suggestedNextAngle ||
          `Create a sharper follow-up on ${topPatterns[index % topPatterns.length]?.theme ?? "your strongest theme"}.`,
        evidence: item.evidence ?? {
          medianScore: topPatterns[index % topPatterns.length]?.medianScore ?? 1,
          wins: topPatterns[index % topPatterns.length]?.wins ?? [],
          basedOnPosts: topPatterns[index % topPatterns.length]?.basedOnPosts ?? 0,
        },
      }));
    }
  } catch (error) {
    console.warn("Recommendation generation fell back to published performance heuristics.", error);
  }

  return buildRecommendationFallback(topPatterns);
}

function buildCompetitorPlanPatterns(posts: CompetitorPost[]) {
  if (!posts.length) {
    return [];
  }

  const grouped = new Map<string, CompetitorPost[]>();

  for (const post of posts) {
    const key = post.competitorName.trim().toLowerCase() || "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), post]);
  }

  const baselineByCompetitor = new Map<string, number>();

  for (const [competitor, competitorPosts] of grouped.entries()) {
    const scores = competitorPosts.map(scoreCompetitorPost);
    const baseline = scores.reduce((total, score) => total + score, 0) / Math.max(scores.length, 1);
    baselineByCompetitor.set(competitor, Math.max(baseline, 1));
  }

  return posts
    .map((post) => {
      const competitor = post.competitorName.trim().toLowerCase() || "unknown";
      const relativeScore = scoreCompetitorPost(post) / (baselineByCompetitor.get(competitor) ?? 1);

      return {
        sourceType: post.sourceType || "COMPETITOR",
        sourceId: post.id,
        competitorName: post.competitorName,
        platform: post.platform,
        relativeScore: Number(relativeScore.toFixed(2)),
        format: post.format,
        theme: post.theme,
        hook: post.hook,
        visualPattern: post.visualPattern,
        offer: post.offer,
        cta: post.cta,
        notes: post.notes,
        sourceUrl: post.postUrl,
      };
    })
    .filter((pattern) => pattern.relativeScore >= 0.9)
    .toSorted((a, b) => b.relativeScore - a.relativeScore)
    .slice(0, 15);
}

function selectCaptionInspirationPatterns(post: ContentPost, patterns: CompetitorPlanPattern[]) {
  const postContext = normalizeReferenceText(`${post.theme} ${post.format} ${post.goal} ${post.angle} ${post.visualConcept}`);

  return patterns
    .map((pattern) => {
      const patternContext = normalizeReferenceText(
        `${pattern.sourceType} ${pattern.competitorName} ${pattern.platform} ${pattern.format} ${pattern.theme} ${pattern.hook} ${pattern.visualPattern} ${pattern.offer} ${pattern.cta} ${pattern.notes}`,
      );
      const postTerms = Array.from(new Set(postContext.split(" ").filter((term) => term.length > 3)));
      const overlap = postTerms.reduce((score, term) => score + (patternContext.includes(term) ? 1 : 0), 0);
      const formatBoost = normalizeReferenceText(pattern.format).includes(normalizeReferenceText(post.format)) ? 3 : 0;
      const platformBoost = pattern.platform === post.platform || post.platform === Platform.BOTH || pattern.platform === Platform.BOTH ? 2 : 0;

      return {
        pattern,
        score: overlap + formatBoost + platformBoost + pattern.relativeScore,
      };
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.pattern);
}

function buildCaptionStyleGuide(patterns: CompetitorPlanPattern[]) {
  if (!patterns.length) {
    return "";
  }

  return JSON.stringify(patterns.map((pattern) => ({
    source: pattern.sourceType,
    relativeScore: pattern.relativeScore,
    format: pattern.format,
    theme: pattern.theme,
    hookMechanic: sanitizeInspirationText(pattern.hook),
    captionOrNotesMechanic: sanitizeInspirationText(pattern.notes),
    cta: sanitizeInspirationText(pattern.cta),
    offer: sanitizeInspirationText(pattern.offer),
    visualPattern: sanitizeInspirationText(pattern.visualPattern),
  })));
}

function buildCaptionFallbacks(
  post: ContentPost,
  profile: NormalizedProfile,
  captionPatterns: CompetitorPlanPattern[],
) {
  const lead = normalizeCaptionSentence(post.angle);
  const proofLine = buildCaptionProofLine(post);
  const ctaCue = sanitizeInspirationText(captionPatterns.find((pattern) => pattern.cta.trim())?.cta.trim() ?? "");
  const offerCue = sanitizeInspirationText(captionPatterns.find((pattern) => pattern.offer.trim())?.offer.trim() ?? "");
  const inspirationHook = findUsefulInspirationHook(captionPatterns);
  const firstCta = ctaCue || "Save this before your next outfit decision.";
  const secondCta = post.format.toLowerCase().includes("carousel")
    ? "Swipe through it now, save it for the fitting-room moment later."
    : "Save it for the next morning when the outfit is right and the base layer is negotiating.";

  if (post.format.toLowerCase().includes("carousel")) {
    return [
      `${lead}\n\n${proofLine}\n\nThe useful part is not the theory. It is knowing what to check before you order.\n\n${firstCta}`,
      `${inspirationHook ? `${normalizeCaptionSentence(inspirationHook)}\n\n` : ""}${post.theme} should be practical enough to save, not vague enough to scroll past.\n\nStart with the day you actually have, then choose the support level around that.\n\n${secondCta}`,
    ];
  }

  if (post.format.toLowerCase().includes("banner") || post.format.toLowerCase().includes("offer")) {
    return [
      `${lead}\n\n${proofLine}\n\n${offerCue ? `${normalizeCaptionSentence(offerCue)} ` : ""}Use the offer when the product solves a real getting-dressed problem, not because a banner shouted at you.\n\n${firstCta}`,
      `${post.theme} works best when the reason to buy is specific: fit, long wear, smoother lines, or one less outfit problem.\n\n${secondCta}`,
    ];
  }

  return [
    `${lead}\n\n${proofLine}\n\nThat is the difference between a piece that only looks good in the mirror and one that survives the actual day.\n\n${firstCta}`,
    `${inspirationHook ? `${normalizeCaptionSentence(inspirationHook)}\n\n` : ""}${profile.brandName} note: support should make the outfit easier, not louder.\n\nKeep the body. Improve the base layer.\n\n${secondCta}`,
  ];
}

function buildCaptionProofLine(post: ContentPost) {
  const text = `${post.theme} ${post.angle} ${post.visualConcept} ${post.tiktokExecution} ${post.instagramExecution}`.toLowerCase();

  if (text.includes("review") || text.includes("proof") || text.includes("comment")) {
    return "The proof is in what people mention after wearing it for more than five minutes.";
  }

  if (text.includes("size") || text.includes("fit")) {
    return "The point is not guessing smaller. It is choosing the size that still works when you sit, move, and breathe.";
  }

  if (text.includes("offer") || text.includes("shop") || text.includes("exchange")) {
    return "The practical reassurance matters: easy support, clearer sizing, and less risk in the first order.";
  }

  if (text.includes("banner") || text.includes("product") || text.includes("detail")) {
    return "The product detail should do a job: support, smooth, stay put, or make the outfit easier.";
  }

  return "The real test is not the first mirror check. It is what still feels good halfway through the day.";
}

function findUsefulInspirationHook(captionPatterns: CompetitorPlanPattern[]) {
  for (const pattern of captionPatterns) {
    const hook = sanitizeInspirationText(pattern.hook);

    if (captionHookLooksUseful(hook)) {
      return hook;
    }
  }

  return "";
}

function captionHookLooksUseful(hook: string) {
  const text = hook.trim();

  if (text.length < 35 || text.split(/\s+/).length < 6) {
    return false;
  }

  const generic =
    /\b(let'?s do this|clean,?\s+clear|beautifully crafted|we aim for nothing less|shop now|tap to shop|link in bio|comment below|save for later|read more|learn more|new post|best url|untitled inspiration)\b/i;

  return !generic.test(text);
}

function buildHashtagSet(post: ContentPost, profile: NormalizedProfile) {
  const context = [
    post.theme,
    post.angle,
    post.goal,
    post.format,
    post.visualConcept,
    post.tiktokExecution,
    post.instagramExecution,
    profile.monthlyProductFocus,
    ...profile.contentPillars,
  ].join(" ").toLowerCase();

  const candidates = [
    ILARIA_BRAND_HASHTAG,
    "#Shapewear",
    "#Intimates",
    "#ComfortUnderwear",
  ];

  if (/\b(bra|бюст|лиф|cup|cups|full bust|support)\b/i.test(context)) {
    candidates.push("#BraFit", "#ComfortBra", "#FullBustSupport");
  }

  if (/\b(body|bodysuit|боди)\b/i.test(context)) {
    candidates.push("#Bodysuit", "#ShapingBodysuit");
  }

  if (/\b(seamless|smooth|line|lines|dress|outfit|under clothing|no show|невидим)\b/i.test(context)) {
    candidates.push("#SeamlessUnderwear", "#NoShowUnderwear", "#UnderOutfit");
  }

  if (/\b(size|fit|fitting|размер|посадк)\b/i.test(context)) {
    candidates.push("#BraFit", "#FitTips", "#UnderwearFit");
  }

  if (/\b(carousel|guide|how to|education|tips|checklist)\b/i.test(context)) {
    candidates.push("#FitGuide", "#StyleTips");
  }

  candidates.push("#EverydayUnderwear", "#WomenOver40Style", "#LingerieFit");

  return dedupeHashtags(candidates).slice(0, 8);
}

function mergeHashtagSet(generated: string[], required: string[]) {
  return dedupeHashtags([ILARIA_BRAND_HASHTAG, ...generated, ...required]).slice(0, 8);
}

function dedupeHashtags(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const tag = normalizeHashtag(value);
    const key = tag.toLowerCase();

    if (!tag || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(tag);
  }

  return result;
}

function normalizeHashtag(value: string) {
  const text = safeText(value).trim();

  if (!text) {
    return "";
  }

  const body = text.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");

  return body ? `#${body}` : "";
}

function normalizeCaptionSentence(value: string) {
  const trimmed = sanitizeInspirationText(value).replace(/\s+/g, " ").trim();

  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function publicCompetitorPattern(pattern: CompetitorPlanPattern) {
  return {
    sourceType: pattern.sourceType,
    sourceId: pattern.sourceId,
    platform: pattern.platform,
    relativeScore: pattern.relativeScore,
    format: pattern.format,
    theme: sanitizeInspirationText(pattern.theme),
    hookMechanic: sanitizeInspirationText(pattern.hook),
    visualMechanic: sanitizeInspirationText(pattern.visualPattern),
    offerCue: sanitizeInspirationText(pattern.offer),
    ctaCue: sanitizeInspirationText(pattern.cta),
    whyItWorked: sanitizeInspirationText(pattern.notes),
  };
}

function buildCompetitorVisualMechanic(pattern: CompetitorPlanPattern) {
  const text = sanitizeInspirationText(`${pattern.visualPattern} ${pattern.notes}`);

  if (/\b(close-up|zoom|fabric|detail|stretch|try|style|under clothing|finished look)\b/i.test(text)) {
    return "show the selected ILARIA product through close-up fabric/details, a gentle stretch or movement proof, try-on context, and one styled-under-clothing payoff. Rebuild with ILARIA product truth only.";
  }

  return text || "use the same winning social mechanic, but rebuild with ILARIA product truth, warm adult tone, and comfort-first framing.";
}

function buildCompetitorExecutionMechanic(pattern: CompetitorPlanPattern) {
  const text = sanitizeInspirationText(pattern.hook || pattern.notes || pattern.visualPattern);

  if (/\b(comfort|comfortable|fabric|detail|stretch|try|style)\b/i.test(text)) {
    return "open with a product-comfort claim, prove it visually through detail/movement, then resolve into a real outfit use case.";
  }

  return text || "problem-solution opener";
}

function sanitizeInspirationText(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(FOREIGN_BRAND_PATTERN, "source brand")
    .replace(/\bby\s+the\s+source\s+brand\s+brand\b/gi, "from the source post")
    .replace(/\bby\s+source\s+brand\b/gi, "from the source post")
    .replace(/\bfrom\s+the\s+source\s+brand\b/gi, "from the source post")
    .replace(/\bsource\s+brand\s+brand\b/gi, "source brand")
    .replace(/\bthe\s+source\s+brand\b/gi, "the source post")
    .replace(/\bLace\s+collection\b/gi, "source collection")
    .replace(/\b(lace\s+underwear\s+set|lace\s+underwear|lace\s+bra|lace\s+panties)\b/gi, "selected ILARIA product")
    .replace(/\bfrom\s+the\s+source\s+collection\b/gi, "from the source post")
    .replace(/[💙🩵]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

function scoreCompetitorPost(post: Pick<CompetitorPost, "views" | "likes" | "comments" | "shares" | "saves">) {
  const engagement = post.likes + post.comments * 3 + post.shares * 4 + post.saves * 4;

  if (post.views > 0) {
    return engagement / Math.max(post.views, 1) + Math.log10(post.views + 10) * 0.03;
  }

  return engagement || 1;
}

function buildPlanFallback(
  profile: NormalizedProfile,
  competitorPatterns: CompetitorPlanPattern[] = [],
  targetPostCount = 30,
  recommendations: ThemeRecommendation[] = [],
) {
  const goals = profile.goals.length ? profile.goals : GOAL_LIBRARY;
  const targetCount = clampPostCount(targetPostCount);
  const recommendationItems = recommendations.slice(0, 5).map((recommendation) => [
    inferRecommendedFallbackFormat(recommendation.theme),
    recommendation.theme,
    recommendation.suggestedNextAngle || `Repeat the winning ${recommendation.theme.toLowerCase()} pattern with a fresh ILARIA angle.`,
    `Analytics-backed follow-up: ${recommendation.reason}. Use the winning visual/format behavior, but change the story so it does not feel repeated.`,
    `TikTok version: keep the proven format signal from analytics and make the hook more concrete. Evidence: ${recommendation.evidence}.`,
    `Instagram version: polish the same winning format as a saveable post or cover. Evidence: ${recommendation.evidence}.`,
  ]);

  const ilariaOriginalItems = [
    ["Reel", "Adult-life microdrama", "The outfit is perfect. The bra situation is not.", "Full-bleed mirror moment: polished outfit, tiny shoulder adjustment, product close-up as the calm fix.", "Open on the line, cut to the outfit almost working, then one close support detail and a dry smile.", "Post as Reel with a clean cover: The outfit is perfect. One detail is not."],
    ["Carousel", "Fit education", "What your chair knows that your mirror does not.", "Magazine carousel: standing pose, sitting test, waistband/strap close-ups, one rule per slide.", "Turn slide logic into a quick chair-test demo with text overlays.", "Carousel-first with slide 1 as the hook and final slide: Save before you buy."],
    ["Editorial graphic", "Mature soft confidence", "I said polished. Not compressed.", "Soft sensual product still life on knitwear with one large typographic line.", "Use as 7-second text-led reel with slow fabric movement.", "Static editorial graphic with minimal caption and product tag."],
    ["Reel", "Real-life comfort proof", "Office at 9. Dinner at 7. Bra patience at 0.", "Day-to-night outfit montage with watch, calendar, bag, and a quiet base-layer reveal.", "Fast cuts through the day; payoff is support that does not add another problem.", "Reel cover uses the timeline line; caption expands the long-wear proof."],
    ["Collage", "Review and trust proof", "The useful reviews mention time.", "Collage of customer quote, 6 PM timestamp, product detail, and warm dressing-room crop.", "Animate the quote as a TikTok proof card, then show the support detail.", "Feed collage with quote as hero and a small fit note underneath."],
    ["Reel", "Cultural memory", "Women who survived low-rise jeans deserve peace.", "Nostalgic denim flash, current soft base layer, calm adult outfit finish.", "Open with the low-rise line, then contrast old discomfort with present-day standards.", "Reel with cleaner subtitles; cover leans witty, not product-heavy."],
    ["Carousel", "Style and base-layer rituals", "What to wear under knitwear, workwear, and fitted tops.", "Three outfit textures, three base-layer solutions, full-bleed crops and simple labels.", "Use as quick outfit-matching reel with three transitions.", "Saveable carousel with one outfit need per slide."],
    ["Product banner", "Product support explainers", "Support without punishment is a design choice.", "Large product crop with two construction callouts and one warm body crop.", "Show hands pointing to band, straps, smoothing zones; no jargon.", "Product banner with callouts; caption explains why comfort is not an accident."],
    ["Reel", "Adult-life microdrama", "This looked easier in the group chat.", "Group chat screenshot opener, outfit rail, mirror pause, product as the quiet resolution.", "Use deadpan pacing and one expectation-vs-reality beat.", "Reel cover keeps the group-chat line; caption: Some plans sound simpler in text."],
    ["Editorial graphic", "Mature soft confidence", "Not every woman wants a makeover. Some want coherence.", "Wardrobe still life: blazer, lipstick, bra strap detail, soft shadow, editorial type.", "Animate as slow text reveal over dressing details.", "Static graphic for Instagram with a thoughtful, minimal caption."],
    ["Reel", "Fuller-bust support", "If your shoulders are doing all the work, that bra is not helping.", "Shoulder tension gesture, strap adjustment, then band/support close-up.", "Start with the shoulder complaint, then show where support should actually come from.", "Reel with cover: Your shoulders were not hired for all this."],
    ["Carousel", "Sizing reassurance", "Between sizes? Do not let optimism order the smaller one.", "Playful but elegant sizing carousel with two fit paths and a calm rule.", "Short Marina/founder-style video giving the between-sizes rule.", "Carousel-first; final slide invites Comment FIT."],
    ["Collage", "TikTok Shop trust", "Shopping online is fun until sizing adds suspense.", "Collage of size chart, exchange cue, product close-up, review note.", "Turn the suspense line into a mini shopping-risk reducer.", "Instagram collage with first exchange/free fit reassurance as proof layer."],
    ["Reel", "Real-life comfort proof", "Five minutes in the mirror proves very little.", "Mirror try-on, sitting, reaching, walking, end-of-day timestamp.", "Show the real test after the mirror: sit, move, breathe, keep going.", "Reel cover: The mirror is not the whole exam."],
    ["Product banner", "Invisible under clothes", "Seamless is not a magic word.", "Fabric macro, fitted top crop, line comparison without body negativity.", "Use a quick myth-busting demo: why seamless can still show.", "Banner/carousel hybrid with three reasons and one product note."],
    ["Reel", "Adult-life microdrama", "Nancy Meyers morning. Actual calendar.", "Soft kitchen/wardrobe fantasy interrupted by phone calendar and practical dressing.", "Open dreamy, then cut to logistics; product appears as the one thing that cooperates.", "Reel with aspirational cover and witty caption."],
    ["Carousel", "Support levels", "Light, medium, firm: choose by day, not ego.", "Three tactile product/detail panels, each tied to a real-life day.", "Quick try-on explainer with three use cases.", "Saveable carousel; final slide: Start with the day you actually have."],
    ["Editorial graphic", "Brand philosophy", "Smooth and put-together. Still breathing.", "Elegant type over soft fabric fold and partial body crop.", "Text-led TikTok with slow product motion and one support detail.", "Static editorial post with product tag, very little caption."],
    ["Reel", "Style and base-layer rituals", "Same outfit. Better base layer.", "Same dress before/after base-layer styling, same body, calmer line.", "Respectful visual proof; avoid transformation language.", "Reel with clean cover; caption anchors the same-body/better-infrastructure idea."],
    ["Collage", "Comment becomes content", "From comments to closet: four real questions answered.", "Comment bubbles, product crops, quick answers, soft neutral layout.", "Use comment screenshots as the hook and answer each in one beat.", "Carousel/collage with one practical answer per slide."],
    ["Reel", "Adult social truth", "Everything looks expensive until the bra joins the chat.", "Outfit close-ups, neckline/strap issue, quiet support fix.", "Fast fashion-aware humor; product bridge only at the payoff.", "Reel cover uses the line; Instagram caption stays short and dry."],
    ["Carousel", "Fit education", "Bra, brief, or bodysuit: where to start.", "Decision-tree carousel with outfit, feeling, support need, product.", "Turn the tree into a quick choose-with-me video.", "Carousel-first for saves; CTA: Save before your first order."],
    ["Product banner", "Real-life comfort proof", "Good support gets quieter by evening.", "Product on body crop with 9 AM / 6 PM timestamp overlay.", "Time-stamped proof reel: morning, afternoon, evening comfort checks.", "Banner with timestamp proof and customer-style language."],
    ["Reel", "Mature soft confidence", "Miranda standards. Human shoulders.", "Polished workwear, bag, laptop, shoulder gesture, soft support close-up.", "Open with the line, then show standards meeting wearable comfort.", "Reel with typography-forward cover; caption keeps the wit."],
    ["Carousel", "Trust proof", "How to shop shapewear online with less risk.", "Checklist carousel: reviews, support level, exchange, fabric, outfit need.", "TikTok version as quick shopping rules with finger-count beats.", "Saveable carousel with first exchange reassurance near the end."],
    ["Editorial graphic", "Cultural memory", "The body you have now still gets to dress beautifully.", "Warm body crop, refined typography, no before/after, no fixing language.", "Text-led reel with wardrobe movement and a soft product detail.", "Static graphic for emotional resonance; caption keeps it grounded."],
    ["Reel", "Product support explainers", "If it rolls, digs, or slips, the fit is probably wrong.", "Three fit issues shown as gestures, then calm correction logic.", "Quick diagnostic reel; each issue gets one visual beat.", "Reel with cleaner cover and a saveable caption."],
    ["Collage", "Color/product desire", "Apparently, you had opinions about this color.", "Restock/color drama collage with comments, shade close-up, packing moment.", "BTS TikTok: color close-up, packing, comment overlay, low-pressure CTA.", "Instagram collage/banner; caption builds small product desire."],
    ["Carousel", "Fuller-bust support", "Support should not delegate the whole job to your shoulders.", "Education carousel with strap vs band logic and comfort cues.", "Marina/founder-guide style short explainer.", "Carousel with one diagram-like slide and one real-life proof slide."],
    ["Reel", "Hot reassurance", "The first exchange matters because bodies are not spreadsheets.", "Online order, size doubt, package, calm exchange reassurance.", "Use the line as hook, then explain first exchange without sounding corporate.", "Reel or graphic banner with trust-first caption and soft CTA."],
  ];

  const competitorItems = competitorPatterns.slice(0, Math.ceil(targetCount * 0.6)).map((pattern, index) => [
    normalizeCompetitorFormat(pattern.format, index),
    pattern.theme || "Competitor-proven pattern",
    adaptCompetitorHook(pattern),
    `Inspiration-based adaptation: ${buildCompetitorVisualMechanic(pattern)}`,
    `Borrow the winning mechanic: ${buildCompetitorExecutionMechanic(pattern)} CTA/offer cue: ${sanitizeInspirationText(pattern.cta || pattern.offer) || "soft save/comment/shop cue"}.`,
    "Adapt as ILARIA, not a copy: keep only the format logic, swap in our product proof, comfort language, and calmer visual system.",
  ]);
  const targetCompetitorCount = Math.min(Math.ceil(targetCount * 0.55), competitorItems.length);
  const priorityItems = recommendationItems.length
    ? interleavePlanItems(recommendationItems, competitorItems.slice(0, targetCompetitorCount), Math.max(recommendationItems.length + targetCompetitorCount, 1))
    : competitorItems.slice(0, targetCompetitorCount);
  const balancedItems = priorityItems.length
    ? interleavePlanItems(priorityItems, ilariaOriginalItems, targetCount)
    : repeatPlanItems(ilariaOriginalItems, targetCount);

  return balancedItems.slice(0, targetCount).map(([format, theme, angle, visualConcept, tiktokExecution, instagramExecution], index) => ({
    platform: profile.monthlyPlatformFocus || Platform.BOTH,
    goal: goals[index % goals.length],
    format,
    theme,
    angle,
    visualConcept,
    tiktokExecution,
    instagramExecution,
  }));
}

function inferRecommendedFallbackFormat(theme: string) {
  const value = theme.toLowerCase();

  if (value.includes("carousel")) return "Carousel";
  if (value.includes("banner") || value.includes("graphic")) return "Offer banner";
  if (value.includes("collage")) return "Collage";
  if (value.includes("product detail")) return "Product banner";

  return "Reel";
}

function interleavePlanItems(competitorItems: string[][], ownItems: string[][], targetCount: number) {
  const result: string[][] = [];
  const ownQueue = [...ownItems];
  const competitorQueue = [...competitorItems];

  while (result.length < targetCount && (competitorQueue.length || ownQueue.length)) {
    if (competitorQueue.length) {
      result.push(competitorQueue.shift() as string[]);
    }

    if (ownQueue.length && result.length < targetCount) {
      result.push(ownQueue.shift() as string[]);
    }
  }

  return repeatPlanItems(result.concat(ownQueue), targetCount);
}

function repeatPlanItems(items: string[][], targetCount: number) {
  if (!items.length) {
    return [];
  }

  return Array.from({ length: targetCount }, (_, index) => items[index % items.length]);
}

function clampPostCount(value: number | null | undefined) {
  return Math.min(60, Math.max(1, Number.isFinite(value ?? NaN) ? Number(value) : 30));
}

function resolvePlanningPeriod(profile: Pick<ProjectProfileDto | ProjectProfile, "monthlyPostCount" | "monthlyStartDate" | "monthlyEndDate">) {
  const startDate = parsePlanDate(profile.monthlyStartDate) ?? startOfDay(new Date());
  const endDate = parsePlanDate(profile.monthlyEndDate);
  const postCount = clampPostCount(profile.monthlyPostCount);

  return {
    startDate,
    endDate: endDate && endDate >= startDate ? endDate : addDays(startDate, postCount - 1),
    postCount,
  };
}

export function distributePostDates(startDate: Date, endDate: Date, postCount: number) {
  const periodDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);

  if (postCount <= periodDays) {
    return Array.from({ length: postCount }, (_, index) => {
      const offset = Math.floor((index * periodDays) / postCount);
      return addDays(startDate, Math.min(offset, periodDays - 1));
    });
  }

  const dates: Date[] = [];
  const basePostsPerDay = Math.floor(postCount / periodDays);
  const extraPosts = postCount % periodDays;

  for (let dayIndex = 0; dayIndex < periodDays; dayIndex += 1) {
    const date = addDays(startDate, dayIndex);

    for (let slot = 0; slot < basePostsPerDay; slot += 1) {
      dates.push(date);
    }
  }

  for (let extraIndex = 0; extraIndex < extraPosts; extraIndex += 1) {
    const offset = Math.floor((extraIndex * periodDays) / extraPosts);
    dates.push(addDays(startDate, Math.min(offset, periodDays - 1)));
  }

  return dates.toSorted((left, right) => left.getTime() - right.getTime());
}

function distributePostDatesAroundAnchors(
  startDate: Date,
  endDate: Date,
  postCount: number,
  anchorDates: Date[],
) {
  if (postCount <= 0) {
    return [];
  }

  const periodDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
  const anchorKeys = new Set(anchorDates.map(dateKey));
  const openDates = Array.from({ length: periodDays }, (_, index) => addDays(startDate, index))
    .filter((date) => !anchorKeys.has(dateKey(date)));

  if (openDates.length && postCount <= openDates.length) {
    return Array.from({ length: postCount }, (_, index) => {
      const offset = Math.floor((index * openDates.length) / postCount);
      return openDates[Math.min(offset, openDates.length - 1)];
    });
  }

  return distributePostDates(startDate, endDate, postCount);
}

function buildPlanEventPosts(
  events: PlanEvent[],
  period: ReturnType<typeof resolvePlanningPeriod>,
  profile: Pick<ProjectProfile, "monthlyPlatformFocus" | "monthlyProductFocus" | "monthlyOffers">,
): DatedPlanItem[] {
  return events.flatMap((event) => {
    if (event.type === PlanEventType.SALE) {
      return buildSaleEventPosts(event, period, profile);
    }

    return buildSinglePlanEventPost(event, event.eventDate, period, profile);
  }).toSorted((left, right) => left.plannedDate.getTime() - right.plannedDate.getTime());
}

function buildSaleEventPosts(
  event: PlanEvent,
  period: ReturnType<typeof resolvePlanningPeriod>,
  profile: Pick<ProjectProfile, "monthlyPlatformFocus" | "monthlyProductFocus" | "monthlyOffers">,
) {
  const offer = event.offer || event.description || profile.monthlyOffers || "the active sale offer";
  const product = profile.monthlyProductFocus || "selected ILARIA products";
  const milestones = [
    {
      offset: -7,
      format: "Reel",
      theme: `${event.title}: sale starts`,
      angle: `The ${event.title} sale starts now: what to buy first and why it solves a real getting-dressed problem.`,
      visual: `Warm sale announcement with ${product}, product-on-body or product detail, clean negative space for sale typography, not a loud discount banner.`,
      tiktok: `Lead with the sale-start hook, then show 2-3 practical product reasons. Offer cue: ${offer}.`,
      instagram: `Polished Reel or cover-led post announcing the sale with a calm, useful buying angle. Offer cue: ${offer}.`,
    },
    {
      offset: -3,
      format: "Carousel",
      theme: `${event.title}: sale reminder`,
      angle: `Three days left to choose the pieces that make outfits easier, not louder.`,
      visual: `Saveable carousel logic: product categories, fit reassurance, offer reminder, and one simple decision rule.`,
      tiktok: `Short reminder: show the product use cases and one fit/trust cue before the sale ends.`,
      instagram: `Carousel or Reel reminder with a saveable shopping checklist and the sale offer: ${offer}.`,
    },
    {
      offset: -1,
      format: "Offer banner",
      theme: `${event.title}: last day tomorrow`,
      angle: `Tomorrow is the last day: order the base layer before the outfit asks for help again.`,
      visual: `Clean offer banner with one product focal point, refined warm palette, and empty space for final-day typography added later.`,
      tiktok: `Quick urgency post without shouting: tomorrow is the last day, show one real-life reason to order.`,
      instagram: `Offer banner/Reel cover with tasteful urgency and a clear CTA. Offer cue: ${offer}.`,
    },
    {
      offset: 0,
      format: "Reel",
      theme: `${event.title}: final hours`,
      angle: `Only a few hours left: the practical pieces are the ones you will reach for first.`,
      visual: `Final-hours vertical cover: product detail or product-on-body, refined commercial light, clear negative space for timer/CTA added later.`,
      tiktok: `Final-hours reminder with product proof, no panic language, clear shop CTA. Offer cue: ${offer}.`,
      instagram: `Final-hours Reel/Story-style post with clear CTA and product truth. Offer cue: ${offer}.`,
    },
  ];

  return milestones.flatMap((milestone) => {
    const date = addDays(event.eventDate, milestone.offset);

    if (!isDateInsidePeriod(date, period)) {
      return [];
    }

    return [{
      plannedDate: date,
      platform: event.platform,
      goal: "Conversion",
      format: milestone.format,
      theme: milestone.theme,
      angle: milestone.angle,
      visualConcept: `${milestone.visual} Sale event: ${event.description || event.title}.`,
      tiktokExecution: milestone.tiktok,
      instagramExecution: milestone.instagram,
    }];
  });
}

function buildSinglePlanEventPost(
  event: PlanEvent,
  date: Date,
  period: ReturnType<typeof resolvePlanningPeriod>,
  profile: Pick<ProjectProfile, "monthlyPlatformFocus" | "monthlyProductFocus" | "monthlyOffers">,
) {
  if (!isDateInsidePeriod(date, period)) {
    return [];
  }

  const topic = event.requiredTopic || event.title;
  const eventTypeLabel = event.type === PlanEventType.LAUNCH ? "Launch" : event.type === PlanEventType.OTHER ? "Calendar event" : "Must-post";
  const product = profile.monthlyProductFocus || "the selected product focus";

  return [{
    plannedDate: date,
    platform: event.platform,
    goal: event.type === PlanEventType.LAUNCH ? "Launch / conversion" : "Required content",
    format: event.type === PlanEventType.LAUNCH ? "Reel" : "Carousel",
    theme: topic,
    angle: event.description || `${eventTypeLabel}: ${topic}`,
    visualConcept: `Required date-specific post for ${formatISO(date, { representation: "date" })}. Use ${product} only when relevant. Build the visual around: ${event.description || topic}.`,
    tiktokExecution: `Create a date-specific TikTok/Reel execution for: ${topic}. Keep the reason for this exact date clear.`,
    instagramExecution: `Create a polished Instagram version for: ${topic}. Keep the post tied to the calendar date and campaign context.`,
  }];
}

function isDateInsidePeriod(date: Date, period: ReturnType<typeof resolvePlanningPeriod>) {
  const time = startOfDay(date).getTime();
  return time >= period.startDate.getTime() && time <= period.endDate.getTime();
}

function dateKey(date: Date) {
  return formatISO(startOfDay(date), { representation: "date" });
}

function parsePlanDate(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = parseISO(trimmed);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

function normalizeCompetitorFormat(format: string, index: number) {
  const value = format.toLowerCase();

  if (value.includes("carousel")) return "Carousel";
  if (value.includes("banner") || value.includes("static")) return "Product banner";
  if (value.includes("collage")) return "Collage";
  if (value.includes("graphic")) return "Editorial graphic";

  return index % 3 === 0 ? "Carousel" : "Reel";
}

function adaptCompetitorHook(pattern: CompetitorPlanPattern) {
  const hook = sanitizeInspirationText(pattern.hook);

  if (/\b(comfort|comfortable|fabric|detail|stretch|try|style)\b/i.test(`${hook} ${pattern.visualPattern}`)) {
    return "ILARIA product proof: comfort shown through close-up detail, movement, try-on, and real outfit styling.";
  }

  if (pattern.offer) {
    return "The offer mechanic worked elsewhere; make it feel like ILARIA comfort reassurance, not pressure.";
  }

  if (hook) {
    return `ILARIA take on: ${hook}`;
  }

  return "A source-post pattern overperformed; rebuild it around ILARIA support without punishment.";
}

function buildPacketFallback(
  post: ContentPost,
  profile: NormalizedProfile,
  captionPatterns: CompetitorPlanPattern[] = [],
): GeneratedPacket {
  const lowerTheme = post.theme.toLowerCase();
  const captionVariants = buildCaptionFallbacks(post, profile, captionPatterns);

  return {
    objective: `${post.goal}: make ${lowerTheme} feel recognizable, useful, and desirable without body-fixing language.`,
    coreAngle: post.angle,
    hookVariants: [
      post.angle,
      `The small ${lowerTheme} detail that changes the whole day.`,
      `Support should make the outfit easier, not louder.`,
    ],
    captionVariants,
    ctaVariants: ["Save this before your next outfit decision.", "Comment FIT if you want help choosing your first size."],
    hashtagSet: buildHashtagSet(post, profile),
    visualBrief: `${post.visualConcept || "Use a full-bleed, soft sensual modern visual with one clear hook and one proof detail."} TikTok: ${post.tiktokExecution || "Lead with recognition."} Instagram: ${post.instagramExecution || "Polish the cover and make it saveable."}`,
    imagePromptVariants: [
      `Soft sensual modern ILARIA social image for ${lowerTheme}, woman 38-55, real-life dressing moment, premium realism, full-bleed crop, calm product detail`,
      `Editorial intimates and shapewear visual for "${post.angle}", warm daylight, tactile fabric, polished but human, readable negative space for headline`,
    ],
    reviewChecklist: [
      "Does the first frame create recognition before it explains?",
      "Does the copy avoid fixing, hiding, or transformation language?",
      "Is there a clear fit, comfort, proof, or trust cue?",
    ],
    ...buildTypeSpecificFallback(post),
  };
}

// Deterministic type-specific sections used when there is no LLM output. Each
// returns only the section matching post.postType; the others stay empty so the
// wrong structure is never persisted.
function buildTypeSpecificFallback(
  post: ContentPost,
): Pick<GeneratedPacket, "videoScript" | "carouselSlides" | "bannerBrief"> {
  if (post.postType === "VIDEO") {
    return { videoScript: buildVideoScriptFallback(post), carouselSlides: [], bannerBrief: null };
  }
  if (post.postType === "CAROUSEL") {
    return { videoScript: null, carouselSlides: buildCarouselSlidesFallback(post), bannerBrief: null };
  }
  return { videoScript: null, carouselSlides: [], bannerBrief: buildBannerBriefFallback(post) };
}

function buildVideoScriptFallback(post: ContentPost): VideoScriptDto {
  const lowerTheme = post.theme.toLowerCase();
  const scenes: VideoSceneDto[] = [
    {
      index: 1,
      durationSec: 3,
      description: `Open on a recognizable real-life dressing moment around ${lowerTheme}.`,
      onScreenText: post.angle,
      voiceOver: "",
    },
    {
      index: 2,
      durationSec: 5,
      description: "Show the everyday tension or doubt this product quietly solves.",
      onScreenText: "The part nobody talks about",
      voiceOver: "",
    },
    {
      index: 3,
      durationSec: 5,
      description: "Cut to clear product proof: fit, comfort, fabric, or how it sits after movement.",
      onScreenText: "Here's the difference",
      voiceOver: "",
    },
    {
      index: 4,
      durationSec: 4,
      description: "Close on a calm payoff and a soft CTA.",
      onScreenText: "Save this for your next order",
      voiceOver: "",
    },
  ];
  return {
    coverHook: post.angle || `The small ${lowerTheme} detail that changes the whole day.`,
    totalDurationSec: scenes.reduce((sum, scene) => sum + scene.durationSec, 0),
    scenes,
  };
}

function buildCarouselSlidesFallback(post: ContentPost): CarouselSlideDto[] {
  const lowerTheme = post.theme.toLowerCase();
  const base: Array<Omit<CarouselSlideDto, "index" | "kicker">> = [
    {
      frameType: "WITH_PERSON",
      frameDescription: "",
      headline: post.angle || `Let's talk about ${lowerTheme}.`,
      body: "A small fit clue that changes the whole decision.",
      mediaPrompt: `Soft sensual modern ILARIA cover image for ${lowerTheme}, woman 38-55, real-life dressing moment, premium realism, clean negative space for a headline`,
    },
    {
      frameType: "PRODUCT_ONLY",
      frameDescription: "",
      headline: "What to actually look for",
      body: "Pressure, rolling, straps, fabric tension, and where it sits after ten minutes.",
      mediaPrompt: `Clean product-only studio shot for ${lowerTheme}, tactile fabric detail, soft daylight, no model, readable construction`,
    },
    {
      frameType: "USEFUL",
      frameDescription: "",
      headline: "The quick fit rule",
      body: "Use this as a calm shopping rule, not a body judgment.",
      mediaPrompt: `Simple useful infographic-style layout summarizing the fit rule for ${lowerTheme}, brand colors, minimal icons, lots of negative space`,
    },
    {
      frameType: "WITH_PERSON",
      frameDescription: "",
      headline: cleanCarouselLine(post.visualConcept || post.goal),
      body: "How it looks in real clothes, sitting and moving.",
      mediaPrompt: `Editorial intimates visual for "${post.angle}", warm daylight, polished but human, product readable`,
    },
    {
      frameType: "PRODUCT_ONLY",
      frameDescription: "",
      headline: "Save this before your next order",
      body: "Keep it as a reference when you choose your first size.",
      mediaPrompt: `Calm closing product flat-lay for ${lowerTheme}, premium packaging feel, brand palette, space for a CTA`,
    },
  ];
  return base.map((slide, index) => ({
    ...slide,
    index: index + 1,
    kicker: `Slide ${String(index + 1).padStart(2, "0")}`,
  }));
}

function buildBannerBriefFallback(post: ContentPost): BannerBriefDto {
  const lowerTheme = post.theme.toLowerCase();
  const frameType = post.defaultFrameType;
  return {
    frameType,
    frameDescription: frameType === "OTHER" ? post.frameDescription : "",
    overlayText: post.angle || post.theme,
    imagePrompt: `Editorial banner background for ${lowerTheme}, premium ILARIA feel, warm daylight, ${
      frameType === "PRODUCT_ONLY" ? "product-only composition" : "tasteful real-life scene"
    }, generous clean negative space on one side for overlay text, no text in the image`,
  };
}

function buildRecommendationFallback(patterns: RecommendationSeed[]) {
  return Array.from({ length: 3 }, (_, index) => {
    const pattern = patterns[index % patterns.length];

    return {
      theme: pattern.theme,
      goal: pattern.goal,
      platform: pattern.platform,
      reason: `${pattern.theme} is outperforming your baseline on ${labelPlatform(pattern.platform)} with a median score of ${pattern.medianScore.toFixed(2)}.`,
      suggestedNextAngle: `Create a follow-up that keeps ${pattern.theme.toLowerCase()} but changes the framing to highlight ${pattern.wins[0] ?? "the winning metric"}.`,
      evidence: {
        medianScore: Number(pattern.medianScore.toFixed(2)),
        wins: pattern.wins,
        basedOnPosts: pattern.basedOnPosts,
        samplePosts: pattern.samplePosts ?? [],
      },
    };
  });
}

function groupPublishedRecommendations(posts: PublishedPost[]) {
  const grouped = new Map<string, RecommendationSeed>();

  for (const post of posts) {
    const format = normalizePublishedFormat(post.format || post.title || post.textPreview);
    const visualType = inferVisualType(post);
    const key = `${post.platform}::${format}::${visualType}`;
    const current = grouped.get(key) ?? {
      theme: `${format} with ${visualType}`,
      goal: "Use more of the published formats that already earn attention, saves, and action.",
      platform: post.platform,
      medianScore: 0,
      notes: [],
      wins: [],
      basedOnPosts: 0,
      samplePosts: [],
    };

    const score = scorePublishedPost(post);
    const title = post.title || post.textPreview || post.postUrl;
    current.notes.push(post.notes || title);
    current.basedOnPosts += 1;
    current.medianScore += score;

    if (current.samplePosts && current.samplePosts.length < 3) {
      current.samplePosts.push(title);
    }

    if (post.leads > 0) {
      current.wins.push("leads");
    }
    if (post.followerGain > 0) {
      current.wins.push("followers");
    }
    if (post.saves > 0) {
      current.wins.push("saves");
    }
    if (post.shares > 0) {
      current.wins.push("shares");
    }
    if (post.comments > 0) {
      current.wins.push("comments");
    }
    if (post.views > 0) {
      current.wins.push("views");
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      medianScore: group.medianScore / group.basedOnPosts,
      wins: Array.from(new Set(group.wins)),
    }))
    .toSorted((a, b) => b.medianScore - a.medianScore);
}

function scorePublishedPost(post: PublishedPost) {
  const weightedActions =
    post.likes +
    post.comments * 2 +
    post.shares * 3 +
    post.saves * 3 +
    post.profileVisits * 2 +
    post.followerGain * 4 +
    post.leads * 5;
  const visibleBase = Math.max(post.views, post.reach, 1);
  const engagementRate = weightedActions / visibleBase;
  const scale = Math.log10(visibleBase + 1);

  return engagementRate * 10 + scale;
}

function normalizePublishedFormat(value: string) {
  const text = value.toLowerCase();

  if (/\b(reel|video|tiktok|clip|ugc)\b/.test(text)) {
    return "Video";
  }

  if (/\b(carousel|slides?|swipe)\b/.test(text)) {
    return "Carousel";
  }

  if (/\b(collage|moodboard)\b/.test(text)) {
    return "Collage";
  }

  if (/\b(banner|graphic|poster|quote|typography|text)\b/.test(text)) {
    return "Graphic/banner";
  }

  if (/\b(photo|image|picture|still)\b/.test(text)) {
    return "Static image";
  }

  return "Unsorted format";
}

function inferVisualType(post: PublishedPost) {
  const text = `${post.format} ${post.title} ${post.textPreview} ${post.notes}`.toLowerCase();

  if (/\b(person|woman|model|body|wearing|try-?on|outfit|on body|mirror)\b/.test(text)) {
    return "person or product-on-body visuals";
  }

  if (/\b(product|fabric|lace|bra|bodysuit|shapewear|detail|close-?up)\b/.test(text)) {
    return "product detail visuals";
  }

  if (/\b(text|quote|typography|checklist|diagram|rules|tips)\b/.test(text)) {
    return "text-led educational visuals";
  }

  if (/\b(review|comment|testimonial|proof)\b/.test(text)) {
    return "proof and comment visuals";
  }

  return "mixed visuals";
}

function extractPlanItems(response: RawPlanResponse) {
  if (Array.isArray(response)) {
    return response;
  }

  return response.items ?? response.posts ?? response.socialContentIdeas ?? response.calendar ?? [];
}

function planLooksUsable(plan: RawPlanItem[]) {
  const banned = /\b(goddess|sexy|unapologetic|empower|empowering|transform your body|hide flaws|perfect hourglass|real women,\s*real results)\b/i;

  return plan.every((item) => {
    const text = Object.values(item).map((value) => safeText(value)).join(" ");
    return !banned.test(text) && !safeText(item.format).includes("|");
  });
}

function normalizePlanItem(item: RawPlanItem, profile: NormalizedProfile, index: number): PlanItem {
  const rawPlatform = String(item.platform).toUpperCase();
  const platform = rawPlatform === "TIKTOK" ? Platform.TIKTOK : rawPlatform === "INSTAGRAM" ? Platform.INSTAGRAM : Platform.BOTH;
  const theme = sanitizeInspirationText(safeText(item.theme)) || profile.contentPillars[index % profile.contentPillars.length] || "Fit education";
  const goal = sanitizeInspirationText(safeText(item.goal)) || profile.goals[index % profile.goals.length] || "Follower growth";
  const angle = sanitizeInspirationText(safeText(item.angle)) || buildAngle(theme, goal, profile.brandName, index);
  const format = sanitizeInspirationText(safeText(item.format)) || ["Reel", "Carousel", "Editorial graphic", "Product banner", "Collage"][index % 5];

  return {
    platform,
    goal,
    format,
    theme,
    angle,
    visualConcept: sanitizeInspirationText(safeText(item.visualConcept)) || "Full-bleed soft modern visual with one clear hook and one proof detail.",
    tiktokExecution: sanitizeInspirationText(safeText(item.tiktokExecution)) || `Turn this into a fast recognition-led ${format.toLowerCase()} with a clear first-second hook.`,
    instagramExecution: sanitizeInspirationText(safeText(item.instagramExecution)) || `Adapt the same idea into a polished ${format.toLowerCase()} with readable cover text and saveable structure.`,
  };
}

function safeText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => safeText(item))
      .filter(Boolean)
      .join(" ");
  }

  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => safeText(item))
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

async function parsePublishedPostPreview(postUrl: string) {
  try {
    const response = await fetch(postUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 ContentCalendarHelper/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return emptyPreview();
    }

    const html = await response.text();
    const title = readMeta(html, "og:title") || readMeta(html, "twitter:title") || readTitle(html);
    const textPreview = readMeta(html, "og:description") || readMeta(html, "twitter:description");
    const imageUrl = readMeta(html, "og:image") || readMeta(html, "twitter:image");

    return {
      title: cleanMeta(title),
      textPreview: cleanMeta(textPreview),
      imageUrl: cleanMeta(imageUrl),
    };
  } catch (error) {
    console.warn("Published post preview parser failed.", error);
    return emptyPreview();
  }
}

function emptyPreview() {
  return {
    title: "",
    textPreview: "",
    imageUrl: "",
  };
}

function readMeta(html: string, key: string) {
  const escapedKey = escapeRegExp(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return "";
}

function readTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(stripTags(match[1])) : "";
}

function cleanMeta(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePacket(
  packet: GeneratedPacket,
  post: ContentPost,
  profile: NormalizedProfile,
  captionPatterns: CompetitorPlanPattern[] = [],
): GeneratedPacket {
  const fallbackCaptions = buildCaptionFallbacks(post, profile, captionPatterns);
  const captions = safeArray(packet.captionVariants)
    .filter((caption) => captionLooksSpecific(caption))
    .slice(0, 2);
  const hashtags = mergeHashtagSet(safeArray(packet.hashtagSet), buildHashtagSet(post, profile));
  const typeSpecific = normalizePacketTypeSpecific(packet, post);

  return {
    objective: safeText(packet.objective) || post.goal,
    coreAngle: safeText(packet.coreAngle) || post.angle,
    hookVariants: safeArray(packet.hookVariants).slice(0, 3),
    captionVariants: captions.length >= 2 ? captions : fallbackCaptions,
    ctaVariants: safeArray(packet.ctaVariants).slice(0, 2),
    hashtagSet: hashtags,
    visualBrief: safeText(packet.visualBrief) || "Use a clean, believable scene with a premium editorial feel.",
    imagePromptVariants: safeArray(packet.imagePromptVariants).slice(0, 2),
    reviewChecklist: safeArray(packet.reviewChecklist).slice(0, 3),
    ...typeSpecific,
  };
}

const VALID_FRAME_TYPES: FrameTypeValue[] = ["WITH_PERSON", "PRODUCT_ONLY", "USEFUL", "OTHER"];

function coerceFrameType(value: unknown): FrameTypeValue {
  return VALID_FRAME_TYPES.includes(value as FrameTypeValue) ? (value as FrameTypeValue) : "WITH_PERSON";
}

// Keeps only the type-specific section that matches the post type and normalizes
// it into the DTO shape (falling back to a deterministic structure when the LLM
// omitted or malformed it). The other two sections are forced empty so they are
// not persisted for the wrong post type.
function normalizePacketTypeSpecific(
  packet: GeneratedPacket,
  post: ContentPost,
): Pick<GeneratedPacket, "videoScript" | "carouselSlides" | "bannerBrief"> {
  if (post.postType === "VIDEO") {
    return {
      videoScript: normalizeVideoScript(packet.videoScript) ?? buildVideoScriptFallback(post),
      carouselSlides: [],
      bannerBrief: null,
    };
  }

  if (post.postType === "CAROUSEL") {
    const slides = normalizeCarouselSlides(packet.carouselSlides);
    return {
      videoScript: null,
      carouselSlides: slides.length ? slides : buildCarouselSlidesFallback(post),
      bannerBrief: null,
    };
  }

  return {
    videoScript: null,
    carouselSlides: [],
    bannerBrief: normalizeBannerBrief(packet.bannerBrief) ?? buildBannerBriefFallback(post),
  };
}

function normalizeVideoScript(value: unknown): VideoScriptDto | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<VideoScriptDto>;
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const normalizedScenes = scenes.map((scene, index) => ({
    index: typeof scene?.index === "number" ? scene.index : index + 1,
    durationSec: typeof scene?.durationSec === "number" ? scene.durationSec : 0,
    description: safeText(scene?.description),
    onScreenText: safeText(scene?.onScreenText),
    voiceOver: safeText(scene?.voiceOver),
  }));
  if (!safeText(raw.coverHook) && !normalizedScenes.length) return null;
  return {
    coverHook: safeText(raw.coverHook),
    totalDurationSec:
      typeof raw.totalDurationSec === "number" && raw.totalDurationSec > 0
        ? raw.totalDurationSec
        : normalizedScenes.reduce((sum, scene) => sum + (scene.durationSec || 0), 0),
    scenes: normalizedScenes,
  };
}

function normalizeCarouselSlides(value: unknown): CarouselSlideDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((slide, index) => ({
      index: typeof slide?.index === "number" ? slide.index : index + 1,
      frameType: coerceFrameType(slide?.frameType),
      frameDescription: safeText(slide?.frameDescription),
      kicker: safeText(slide?.kicker) || `Slide ${String(index + 1).padStart(2, "0")}`,
      headline: safeText(slide?.headline),
      body: safeText(slide?.body),
      mediaPrompt: safeText(slide?.mediaPrompt),
    }))
    .filter((slide) => slide.headline || slide.body || slide.mediaPrompt)
    .slice(0, 8);
}

function normalizeBannerBrief(value: unknown): BannerBriefDto | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<BannerBriefDto>;
  const overlayText = safeText(raw.overlayText);
  const imagePrompt = safeText(raw.imagePrompt);
  if (!overlayText && !imagePrompt) return null;
  return {
    frameType: coerceFrameType(raw.frameType),
    frameDescription: safeText(raw.frameDescription),
    overlayText,
    imagePrompt,
  };
}

function packetLooksUsable(packet: GeneratedPacket) {
  const banned = /\b(goddess|sexy|unapologetic|empower|empowering|transform your body|hide flaws|perfect hourglass|bodylove|body love|confidence boost|upgrade your fit game|choose ilaria|discover comfort|embrace your curves|designed for every body)\b/i;
  return !banned.test(Object.values(packet).map((value) => safeText(value)).join(" "));
}

function captionLooksSpecific(caption: string) {
  const text = caption.trim();
  const generic =
    /\b(let'?s do this|clean,?\s+clear|beautifully crafted|we aim for nothing less|discover comfort|embrace your curves|feel confident|upgrade your wardrobe|designed for every body|choose ilaria|perfect for any occasion|elevate your everyday|style meets comfort)\b/i;

  return text.length >= 80 && !generic.test(text);
}

function buildAngle(theme: string, goal: string, brandName: string, index: number) {
  const frames = [
    `Show the working system behind ${theme.toLowerCase()} and connect it to ${goal.toLowerCase()}.`,
    `Turn ${theme.toLowerCase()} into a practical lesson that a follower can apply today.`,
    `Use ${brandName} as a live example of how ${theme.toLowerCase()} supports ${goal.toLowerCase()}.`,
  ];

  return frames[index % frames.length];
}

function labelPlatform(platform: Platform) {
  if (platform === Platform.BOTH) {
    return "TikTok + Instagram";
  }

  return platform === Platform.TIKTOK ? "TikTok" : "Instagram";
}

function mapPost(post: PostWithRelations): ContentPostDto {
  return {
    id: post.id,
    projectId: post.projectId,
    platform: post.platform,
    plannedDate: formatISO(post.plannedDate),
    goal: post.goal,
    format: post.format,
    postType: post.postType,
    defaultFrameType: post.defaultFrameType,
    frameDescription: post.frameDescription,
    productId: post.productId,
    theme: post.theme,
    angle: post.angle,
    visualConcept: post.visualConcept,
    tiktokExecution: post.tiktokExecution,
    instagramExecution: post.instagramExecution,
    assetLinks: post.assetLinks,
    imageFormatKey: post.imageFormatKey,
    imageResolution: post.imageResolution,
    imageStyle: post.imageStyle,
    imageObjects: post.imageObjects,
    imageImpression: post.imageImpression,
    imageReferenceIds: safeArray(post.imageReferenceIds),
    status: post.status,
    packet: post.packet ? mapPacket(post.packet) : null,
    review: post.review
      ? {
          id: post.review.id,
          reach: post.review.reach,
          views: post.review.views,
          likes: post.review.likes,
          leads: post.review.leads,
          followerGain: post.review.followerGain,
          manualVerdict: post.review.manualVerdict,
          manualNote: post.review.manualNote,
          autoScore: post.review.autoScore,
          autoClass: post.review.autoClass,
          reviewedAt: formatISO(post.review.reviewedAt),
        }
      : null,
    images: post.images.map((image) => ({
      id: image.id,
      imagePath: image.imagePath,
      prompt: image.prompt,
      variant: image.variant,
    })),
  };
}

function mapImageAsset(asset: ImageAsset): ImageAssetDto {
  return {
    id: asset.id,
    projectId: asset.projectId,
    type: asset.type,
    name: asset.name,
    sourcePath: asset.sourcePath,
    description: asset.description,
    productCategory: asset.productCategory,
    colors: asset.colors,
    tags: asset.tags,
    notes: asset.notes,
    isActive: asset.isActive,
  };
}

function mapPlanEvent(event: PlanEvent): PlanEventDto {
  return {
    id: event.id,
    projectId: event.projectId,
    type: event.type,
    title: event.title,
    eventDate: formatISO(event.eventDate),
    description: event.description,
    requiredTopic: event.requiredTopic,
    offer: event.offer,
    platform: event.platform,
    isActive: event.isActive,
  };
}

function mapPublishedPost(post: PublishedPost): PublishedPostDto {
  return {
    id: post.id,
    projectId: post.projectId,
    platform: post.platform,
    postUrl: post.postUrl,
    publishedAt: formatISO(post.publishedAt),
    capturedAt: formatISO(post.capturedAt),
    title: post.title,
    textPreview: post.textPreview,
    imageUrl: post.imageUrl,
    format: post.format,
    views: post.views,
    reach: post.reach,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    saves: post.saves,
    profileVisits: post.profileVisits,
    followerGain: post.followerGain,
    leads: post.leads,
    notes: post.notes,
  };
}

function mapCompetitorPosts(posts: CompetitorPost[]): CompetitorPostDto[] {
  const patterns = buildCompetitorPlanPatterns(posts);
  const scoreById = new Map(patterns.map((pattern) => [pattern.sourceId, pattern.relativeScore]));

  return posts.map((post) => ({
    id: post.id,
    projectId: post.projectId,
    sourceType: (post.sourceType || "COMPETITOR") as CompetitorPostDto["sourceType"],
    competitorName: post.competitorName,
    platform: post.platform,
    postUrl: post.postUrl,
    publishedAt: formatISO(post.publishedAt),
    capturedAt: formatISO(post.capturedAt),
    relativeScore: scoreById.get(post.id) ?? 1,
    format: post.format,
    theme: post.theme,
    hook: post.hook,
    visualPattern: post.visualPattern,
    offer: post.offer,
    cta: post.cta,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    saves: post.saves,
    notes: post.notes,
    isActive: post.isActive,
  }));
}

function projectToDto(project: Project): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
  };
}

function mapPacket(packet: CampaignPacket): CampaignPacketDto {
  return {
    id: packet.id,
    objective: packet.objective,
    targetPlatform: packet.targetPlatform,
    coreAngle: packet.coreAngle,
    hookVariants: safeArray(packet.hookVariants),
    captionVariants: safeArray(packet.captionVariants),
    ctaVariants: safeArray(packet.ctaVariants),
    hashtagSet: safeArray(packet.hashtagSet),
    visualBrief: packet.visualBrief,
    imagePromptVariants: safeArray(packet.imagePromptVariants),
    reviewChecklist: safeArray(packet.reviewChecklist),
    videoScript: parseVideoScript(packet.videoScript),
    carouselSlides: parseCarouselSlides(packet.carouselSlides),
    bannerBrief: parseBannerBrief(packet.bannerBrief),
  };
}

function parseVideoScript(value: string): VideoScriptDto | null {
  if (!value || !value.trim()) return null;
  try {
    const raw = JSON.parse(value) as Partial<VideoScriptDto>;
    if (!raw || typeof raw !== "object") return null;
    return {
      coverHook: typeof raw.coverHook === "string" ? raw.coverHook : "",
      totalDurationSec: typeof raw.totalDurationSec === "number" ? raw.totalDurationSec : 0,
      scenes: Array.isArray(raw.scenes)
        ? raw.scenes.map((scene, index) => ({
            index: typeof scene?.index === "number" ? scene.index : index,
            durationSec: typeof scene?.durationSec === "number" ? scene.durationSec : 0,
            description: typeof scene?.description === "string" ? scene.description : "",
            onScreenText: typeof scene?.onScreenText === "string" ? scene.onScreenText : "",
            voiceOver: typeof scene?.voiceOver === "string" ? scene.voiceOver : "",
          }))
        : [],
    };
  } catch {
    return null;
  }
}

function parseCarouselSlides(value: string): CarouselSlideDto[] {
  if (!value || !value.trim()) return [];
  try {
    const raw = JSON.parse(value);
    if (!Array.isArray(raw)) return [];
    const validFrameTypes: FrameTypeValue[] = ["WITH_PERSON", "PRODUCT_ONLY", "USEFUL", "OTHER"];
    return raw.map((slide, index) => ({
      index: typeof slide?.index === "number" ? slide.index : index,
      frameType: validFrameTypes.includes(slide?.frameType) ? (slide.frameType as FrameTypeValue) : "WITH_PERSON",
      frameDescription: typeof slide?.frameDescription === "string" ? slide.frameDescription : "",
      kicker: typeof slide?.kicker === "string" ? slide.kicker : "",
      headline: typeof slide?.headline === "string" ? slide.headline : "",
      body: typeof slide?.body === "string" ? slide.body : "",
      mediaPrompt: typeof slide?.mediaPrompt === "string" ? slide.mediaPrompt : "",
    }));
  } catch {
    return [];
  }
}

function parseBannerBrief(value: string): BannerBriefDto | null {
  if (!value || !value.trim()) return null;
  try {
    const raw = JSON.parse(value) as Partial<BannerBriefDto>;
    if (!raw || typeof raw !== "object") return null;
    const validFrameTypes: FrameTypeValue[] = ["WITH_PERSON", "PRODUCT_ONLY", "USEFUL", "OTHER"];
    return {
      frameType: validFrameTypes.includes(raw.frameType as FrameTypeValue) ? (raw.frameType as FrameTypeValue) : "WITH_PERSON",
      frameDescription: typeof raw.frameDescription === "string" ? raw.frameDescription : "",
      overlayText: typeof raw.overlayText === "string" ? raw.overlayText : "",
      imagePrompt: typeof raw.imagePrompt === "string" ? raw.imagePrompt : "",
    };
  } catch {
    return null;
  }
}

function profileToDto(profile: ProjectProfile): ProjectProfileDto {
  return {
    id: profile.id,
    projectId: profile.projectId,
    brandName: profile.brandName,
    audience: profile.audience,
    offers: profile.offers,
    goals: profile.goals,
    contentPillars: profile.contentPillars,
    currentPriorities: profile.currentPriorities,
    tone: profile.tone,
    language: profile.language,
    monthlyPostCount: profile.monthlyPostCount,
    monthlyStartDate: profile.monthlyStartDate,
    monthlyEndDate: profile.monthlyEndDate,
    monthlyCampaignName: profile.monthlyCampaignName,
    monthlyPlatformFocus: profile.monthlyPlatformFocus as ProjectProfileDto["monthlyPlatformFocus"],
    monthlyProductFocus: profile.monthlyProductFocus,
    monthlyOffers: profile.monthlyOffers,
    monthlyPriorities: profile.monthlyPriorities,
    monthlyMustInclude: profile.monthlyMustInclude,
    monthlyAvoid: profile.monthlyAvoid,
    logoReferenceUrl: profile.logoReferenceUrl,
    visualFonts: profile.visualFonts,
    visualColors: profile.visualColors,
    productReferenceUrl: profile.productReferenceUrl,
    bannerReferenceUrl: profile.bannerReferenceUrl,
    layoutReferenceNotes: profile.layoutReferenceNotes,
  };
}

function settingsToDto(settings: AppSettings): AppSettingsDto {
  return {
    id: settings.id,
    ollamaModel: settings.ollamaModel,
    planTextProvider: settings.planTextProvider === "OPENAI" || settings.planTextProvider === "ANTHROPIC" ? settings.planTextProvider : "OLLAMA",
    planTextModel: settings.planTextModel,
    copyTextProvider: settings.copyTextProvider === "OPENAI" || settings.copyTextProvider === "ANTHROPIC" ? settings.copyTextProvider : "OLLAMA",
    copyTextModel: settings.copyTextModel,
    insightsProvider: settings.insightsProvider === "OPENAI" || settings.insightsProvider === "ANTHROPIC" ? settings.insightsProvider : "OLLAMA",
    insightsModel: settings.insightsModel,
    defaultLanguage: settings.defaultLanguage,
    brandVoice: settings.brandVoice,
    imageProvider:
      settings.imageProvider === "OPENAI" || settings.imageProvider === "SHOOT_STUDIO"
        ? settings.imageProvider
        : "LOCAL_SD_WEBUI",
    imageModel: settings.imageModel,
    localImageEndpoint: settings.localImageEndpoint,
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    imageRenderingConfigured: isImageRenderingConfigured(settings),
  };
}

interface NormalizedProfile {
  brandName: string;
  audience: string;
  offers: string[];
  goals: string[];
  contentPillars: string[];
  currentPriorities: string[];
  tone: string;
  language: string;
  monthlyPostCount: number;
  monthlyStartDate: string;
  monthlyEndDate: string;
  monthlyCampaignName: string;
  monthlyPlatformFocus: Platform;
  monthlyProductFocus: string;
  monthlyOffers: string[];
  monthlyPriorities: string[];
  monthlyMustInclude: string[];
  monthlyAvoid: string[];
  logoReferenceUrl: string;
  visualFonts: string;
  visualColors: string;
  productReferenceUrl: string;
  bannerReferenceUrl: string;
  layoutReferenceNotes: string;
}

function normalizeProfile(profile: ProjectProfileDto | ProjectProfile): NormalizedProfile {
  return {
    brandName: profile.brandName,
    audience: profile.audience,
    offers: splitLines(profile.offers),
    goals: splitLines(profile.goals),
    contentPillars: splitLines(profile.contentPillars),
    currentPriorities: splitLines(profile.currentPriorities),
    tone: profile.tone,
    language: profile.language,
    monthlyPostCount: clampPostCount(profile.monthlyPostCount),
    monthlyStartDate: profile.monthlyStartDate,
    monthlyEndDate: profile.monthlyEndDate,
    monthlyCampaignName: profile.monthlyCampaignName,
    monthlyPlatformFocus: profile.monthlyPlatformFocus as Platform,
    monthlyProductFocus: profile.monthlyProductFocus,
    monthlyOffers: splitLines(profile.monthlyOffers),
    monthlyPriorities: splitLines(profile.monthlyPriorities),
    monthlyMustInclude: splitLines(profile.monthlyMustInclude),
    monthlyAvoid: splitLines(profile.monthlyAvoid),
    logoReferenceUrl: profile.logoReferenceUrl,
    visualFonts: profile.visualFonts,
    visualColors: profile.visualColors,
    productReferenceUrl: profile.productReferenceUrl,
    bannerReferenceUrl: profile.bannerReferenceUrl,
    layoutReferenceNotes: profile.layoutReferenceNotes,
  };
}

export function serializeProfileInput(input: NormalizedProfile): Omit<ProjectProfileDto, "id" | "projectId"> {
  return {
    brandName: input.brandName,
    audience: input.audience,
    offers: toLineBlock(input.offers),
    goals: toLineBlock(input.goals),
    contentPillars: toLineBlock(input.contentPillars),
    currentPriorities: toLineBlock(input.currentPriorities),
    tone: input.tone,
    language: input.language,
    monthlyPostCount: input.monthlyPostCount,
    monthlyStartDate: input.monthlyStartDate,
    monthlyEndDate: input.monthlyEndDate,
    monthlyCampaignName: input.monthlyCampaignName,
    monthlyPlatformFocus: input.monthlyPlatformFocus,
    monthlyProductFocus: input.monthlyProductFocus,
    monthlyOffers: toLineBlock(input.monthlyOffers),
    monthlyPriorities: toLineBlock(input.monthlyPriorities),
    monthlyMustInclude: toLineBlock(input.monthlyMustInclude),
    monthlyAvoid: toLineBlock(input.monthlyAvoid),
    logoReferenceUrl: input.logoReferenceUrl,
    visualFonts: input.visualFonts,
    visualColors: input.visualColors,
    productReferenceUrl: input.productReferenceUrl,
    bannerReferenceUrl: input.bannerReferenceUrl,
    layoutReferenceNotes: input.layoutReferenceNotes,
  };
}

async function buildUniqueSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";

  let slug = base;
  let suffix = 2;

  while (await prisma.project.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
