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
import { describeReferenceStyle, generateJsonWithTextRoute } from "@/lib/text-generation";
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

interface RenderPromptSpec {
  prompt: string;
  frameType: FrameTypeValue;
  frameDescription?: string;
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
  modelId: string;
  theme: string;
  angle: string;
  visualConcept: string;
  tiktokExecution: string;
  instagramExecution: string;
  assetLinks: string;
  referenceImageUrl: string;
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

export async function generateMonthlyPlan(
  projectId = DEFAULT_PROJECT_ID,
  mode: "recreate" | "complete" = "recreate",
) {
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

  const existingPosts = await prisma.contentPost.findMany({
    where: {
      projectId,
    },
  });

  const dayKey = (date: Date) => startOfDay(date).getTime();
  const periodStart = dayKey(planningPeriod.startDate);
  const periodEnd = dayKey(planningPeriod.endDate);
  const inPeriod = (date: Date) => {
    const day = dayKey(date);
    return day >= periodStart && day <= periodEnd;
  };

  // "complete" keeps the existing in-period posts and only fills the empty dates
  // around them (top up after the user deletes the ideas they dislike). "recreate"
  // ignores them and rebuilds the whole period from scratch. Inputs-anchored dates
  // are always (re)built in both modes. Posts dated OUTSIDE the period are left as
  // history either way.
  const keptExistingPosts = mode === "complete" ? existingPosts.filter((post) => inPeriod(post.plannedDate)) : [];
  const occupiedDates = [
    ...anchoredPosts.map((post) => post.plannedDate),
    ...keptExistingPosts.map((post) => post.plannedDate),
  ];
  const fillPostCount = Math.max(targetPostCount - occupiedDates.length, 0);
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
    occupiedDates,
  );

  const datedPlanItems: DatedPlanItem[] = [
    ...anchoredPosts,
    ...dates.map((date, index) => ({
      ...planItems[index],
      plannedDate: date,
    })),
  ].toSorted((left, right) => left.plannedDate.getTime() - right.plannedDate.getTime());

  const targetDateKeys = new Set(datedPlanItems.map((item) => dayKey(item.plannedDate)));
  const replaceablePostIds = existingPosts
    .filter((post) => {
      const day = dayKey(post.plannedDate);
      // Always clear a post sitting on a date we are about to (re)create (e.g. an
      // anchored date) so regeneration leaves no duplicate. In "recreate" also clear
      // the whole period; in "complete" every other existing post is kept.
      if (targetDateKeys.has(day)) {
        return true;
      }
      return mode === "recreate" && day >= periodStart && day <= periodEnd;
    })
    .map((post) => post.id);

  const nextPosts = datedPlanItems.map((item) => ({
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
  }));

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
        modelId: input.modelId,
        theme: input.theme,
        angle: input.angle,
        visualConcept: input.visualConcept,
        tiktokExecution: input.tiktokExecution,
        instagramExecution: input.instagramExecution,
        assetLinks: input.assetLinks,
        referenceImageUrl: input.referenceImageUrl,
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

export async function deletePost(postId: string) {
  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
    select: { projectId: true },
  });

  if (!post) {
    throw new Error("Post not found.");
  }

  // CampaignPacket, GeneratedImage, and ReviewResult cascade on delete (schema),
  // so removing the post cleans up its packet, images, and review automatically.
  await prisma.contentPost.delete({
    where: { id: postId },
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

  // When the post has a style reference, describe it once with vision and weave
  // that style brief into every render prompt so the output echoes its look (the
  // garment still comes from the selected product, not the reference).
  const styleBrief = post.referenceImageUrl ? await describeReferenceStyle(post.referenceImageUrl) : "";

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
          prompt: applyStyleBrief(prompt.prompt, styleBrief),
          postId,
          variant: index + 1,
          settings,
          imageFormatKey: post.imageFormatKey,
          productId: post.productId,
          modelId: post.modelId,
          frameType: prompt.frameType,
          referenceImages: referenceList,
        });

        slideImages.push({ prompt: prompt.prompt, imagePath, variant: index + 1 });
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
      prompt: applyStyleBrief(prompt.prompt, styleBrief),
      postId,
      variant: index + 1,
      settings,
      imageFormatKey: post.imageFormatKey,
      productId: post.productId,
      modelId: post.modelId,
      frameType: prompt.frameType,
      referenceImages: referenceList,
    });

    images.push({
      prompt: prompt.prompt,
      imagePath,
      variant: index + 1,
    });
  }

  await replaceGeneratedImages(postId, images);

  return getDashboardState(post.projectId);
}

// Appends the vision-derived style brief to a render prompt so the generated
// image echoes the reference's look while keeping ILARIA's own product.
function applyStyleBrief(prompt: string, styleBrief: string): string {
  if (!styleBrief.trim()) {
    return prompt;
  }
  return `${prompt}\n\nMatch this visual style — mimic the composition, framing, lighting, palette, and mood, but do NOT copy it exactly and keep ILARIA's own product: ${styleBrief.trim()}`;
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
function buildCarouselSlideRenderPrompts(post: ContentPost & { packet: CampaignPacket }): RenderPromptSpec[] {
  const slides = parseCarouselSlides(post.packet.carouselSlides);

  return slides
    .flatMap((slide) => {
      const base = slide.mediaPrompt || post.packet.visualBrief || post.visualConcept || post.angle;
      if (!base) return [];
      return [{
        prompt: [
          base,
          `Carousel ${slide.kicker || `slide ${slide.index}`} for "${post.theme}".`,
          frameTypeRenderGuidance(slide.frameType, slide.frameDescription),
          "Leave clean negative space for the headline typography added later. No text in the image.",
        ]
          .filter(Boolean)
          .join("\n"),
        frameType: slide.frameType,
        frameDescription: slide.frameDescription,
      } satisfies RenderPromptSpec];
    });
}

function buildShootStudioRenderPrompts(post: ContentPost & { packet: CampaignPacket }, prompts: string[], mode: string): RenderPromptSpec[] {
  const seedPrompt = prompts[0] || post.packet.visualBrief || post.visualConcept || post.angle;
  const defaultFrameType = post.defaultFrameType;

  if (mode === "scene_refs") {
    // Prefer the generated video script's scenes as filming references; fall back
    // to the generic three-beat structure when there is no script yet.
    const videoScript = parseVideoScript(post.packet.videoScript);
    if (videoScript && videoScript.scenes.length) {
      return videoScript.scenes.map((scene) =>
        ({
          prompt: [
            scene.description || seedPrompt,
            `Scene reference ${scene.index} for "${post.theme}".`,
            defaultFrameType === "WITH_PERSON"
              ? "Make it useful as a filming reference: clear composition, adult model, product readable, no text."
              : "Make it useful as a filming reference: clear product/composition, no person, no model, no body, no text.",
          ].join("\n"),
          frameType: defaultFrameType,
        }),
      );
    }

    return [
      {
        prompt: [
          seedPrompt,
          `Scene reference 1: first-frame / cover scene for "${post.theme}".`,
          defaultFrameType === "WITH_PERSON"
            ? "Make it useful as a filming reference: clear composition, adult model, product readable, no text."
            : "Make it product-first: no person, no model, no body, no text.",
        ].join("\n"),
        frameType: defaultFrameType,
      },
      {
        prompt: [
          seedPrompt,
          `Scene reference 2: problem or tension moment for "${post.angle}".`,
          defaultFrameType === "WITH_PERSON"
            ? "Show the real-life situation clearly, tasteful and social-ready, no text."
            : "Show the product/problem visually without any human body, no text.",
        ].join("\n"),
        frameType: defaultFrameType,
      },
      {
        prompt: [
          seedPrompt,
          `Scene reference 3: product proof / detail moment for "${post.goal}".`,
          "Focus on product logic, fabric, fit, comfort, or outfit use. No text.",
        ].join("\n"),
        frameType: defaultFrameType,
      },
    ];
  }

  // BANNER posts render a single banner background from the banner brief.
  if (post.postType === "BANNER") {
    const banner = parseBannerBrief(post.packet.bannerBrief);
    if (banner && (banner.imagePrompt || banner.overlayText)) {
      return [
        {
          prompt: [
            banner.imagePrompt || seedPrompt,
            `Banner background for "${post.theme}".`,
            frameTypeRenderGuidance(banner.frameType, banner.frameDescription),
            banner.overlayText
              ? `Leave generous clean negative space for the overlay text: "${banner.overlayText}".`
              : "Leave generous clean negative space for overlay text.",
            "No text in the image.",
          ].join("\n"),
          frameType: banner.frameType,
          frameDescription: banner.frameDescription,
        },
      ];
    }
  }

  // VIDEO cover uses the script's first-frame hook as the framing intent.
  const coverHook = post.postType === "VIDEO" ? parseVideoScript(post.packet.videoScript)?.coverHook ?? "" : "";

  return [
    {
      prompt: [
        seedPrompt,
        `Cover image for "${post.theme}".`,
        coverHook ? `First-frame hook: "${coverHook}".` : "",
        frameTypeRenderGuidance(defaultFrameType, post.frameDescription),
        "Create one strong social first-frame image. Leave clean negative space for typography added later. No text in the image.",
      ]
        .filter(Boolean)
        .join("\n"),
      frameType: defaultFrameType,
      frameDescription: post.frameDescription,
    },
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
        "For ILARIA-original posts: spread ideas across the four content territories below and make each one specific, stylish, and desirable.",
        `Plan one content idea per day. Respect the monthly platform focus ${normalizedProfile.monthlyPlatformFocus}; if it is BOTH, publish on TikTok and Instagram at the same time.`,
        "Mix formats: reels, carousels, editorial graphics, product close-up banners, review/proof posts, and collage-style posts.",
        'Each item must be shaped as {"platform":"BOTH","goal":"...","format":"Reel|Carousel|Editorial graphic|Product banner|Collage","theme":"...","angle":"...","visualConcept":"...","tiktokExecution":"...","instagramExecution":"..."}',
        "Mark adapted inspiration ideas inside visualConcept or execution notes with a short phrase like 'Inspiration-based adaptation: ...'. Mark original ILARIA gap-fill ideas with 'ILARIA original gap-fill: ...'.",
        "The content must feel tasteful, aspirational, and desirable: good vibes, great mood, real styling, all-day comfort, and a clean modern look. Do NOT target by age and do NOT use body-decline or 'why your body changed' framing.",
        ...buildContentTerritoryGuide(),
        "Do not use these words or ideas: goddess, sexy, unapologetic confidence, real women real results, empower, transform your body, hide flaws, perfect hourglass.",
        ...buildStyleGuard(),
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
      "Also return a videoScript object with keys: coverHook (string, the first visual idea — a scene, not text), totalDurationSec (number, 15-45), and scenes (array of 3-6 objects).",
      "Each scene object has keys: index (1-based number), durationSec (number), description (a VISUAL generation direction for THIS frame: the setting/environment, props and what to use, the camera angle and shot, the movement, and the mood — NO on-screen text), onScreenText (leave as an empty string: the video is generated, so no burned-in text), voiceOver (leave empty unless clearly useful).",
      "Scenes must form a clear visual sequence (opening scene, the look or feature building, the payoff). Each description must be concrete enough to GENERATE that frame as a short video clip — no text, no color codes, no font names.",
    ];
  }

  if (post.postType === "CAROUSEL") {
    return [
      "This is a CAROUSEL (multi-slide) post.",
      frameLine,
      "Also return carouselSlides: an array of 5-7 slide objects.",
      "Each slide object has keys: index (1-based number), frameType (one of WITH_PERSON, PRODUCT_ONLY, USEFUL, OTHER), frameDescription (string; fill ONLY when frameType is OTHER, else empty string), kicker (short label like 'Slide 01'), headline (string), body (string), mediaPrompt (a concrete standalone image prompt to shoot THIS slide).",
      "The slides must tell ONE story with a clear arc, not a list of tips: slide 1 is a scroll-stopping hook scene; the middle slides build a specific styling/feature narrative (what to wear it under, how the look comes together, the detail that makes it work); the final slide is a satisfying payoff with a soft save/CTA. Every slide must ADVANCE the story — never repeat the same point.",
      "Make each headline and body specific to THIS post's theme and angle (concrete moments and details), not generic shapewear lines. Vary frameType across the slides (mix WITH_PERSON, PRODUCT_ONLY, and at least one USEFUL/infographic). Each mediaPrompt must visualize that slide's beat and stand on its own as an image brief.",
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
        ...buildCopyMechanicsGuide(),
        ...buildStyleGuard(),
        ...postTypeInstructions,
        typeSpecificKey,
        "When a product is named above, make the copy, scenes/slides/banner, and every image prompt specifically about THAT product (its fit promise, needs, and construction). Do not drift to a different garment.",
        "Caption rules:",
        "- Return TWO distinct captions: social-native, specific, human, good-vibes — not a brand manifesto, and NOT the same shape as your other posts.",
        "- Lead with one concrete line from this post's angle/theme, then a real styling or wearability detail. Make the two captions different in structure from each other.",
        "- Tie any 'feel great' to the style and the look, never to fixing the body; no age framing.",
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
        ...buildStyleGuard(),
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

export type PostIntent =
  | "styling"
  | "self-care"
  | "feature"
  | "wearability"
  | "general";

// Lightweight territory detection from the planned post's own fields. Used to make
// deterministic fallbacks (hooks/CTAs) match the post's content territory instead
// of emitting the same generic two lines for every post.
export function detectPostIntent(post: ContentPost): PostIntent {
  const text =
    `${post.theme} ${post.angle} ${post.goal} ${post.format} ${post.visualConcept} ${post.tiktokExecution} ${post.instagramExecution}`.toLowerCase();

  if (/\b(get ready|getting ready|grwm|routine|ritual|self-?care|morning)\b/.test(text)) {
    return "self-care";
  }
  if (/\b(strap|straps|pad|pads|insert|inserts|unsnap|detachable|seamless|seam|fabric|panel|panels|material|no bra|bra needed|construction)\b/.test(text)) {
    return "feature";
  }
  if (/\b(all[- ]day|invisible|no lines|under clothes|under your clothes|under anything|easy to put on|on in|forget|works under)\b/.test(text)) {
    return "wearability";
  }
  if (/\b(style|styling|outfit|outfits|look|looks|capsule|wardrobe|pair|pairing|layer|layers|mix|lookbook|what to wear|wear under)\b/.test(text)) {
    return "styling";
  }
  return "general";
}

// Copy-level direction guide distilled from docs/CONTENT_TOPIC_SYSTEM.md and
// docs/COMPETITOR_TEXT_ANALYSIS.md. STRUCTURES, not competitor wording — shipped in
// every packet prompt so single-post copy stays on the styling / feature /
// wearability direction even with no competitor rows in the database. Contains NO
// competitor brand names so the model can never echo one into published copy.
export function buildCopyMechanicsGuide(): string[] {
  return [
    "Write this post's copy like current, aspirational styling/intimates content — desire and good vibes, never problems or age. Adapt the SHAPE of these mechanics, never copy any brand's wording, and never name another brand:",
    "Hook shapes (lead with desire and specificity, not problems):",
    "- Outcome / showcase: show the look or feature paying off ('one piece, three outfits').",
    "- What-to-wear-under: position the piece as the thing that makes an outfit or trend work.",
    "- Feature aha: reveal a concrete feature as a delightful surprise (wide/cushioned straps, a detachable bottom, soft inner pads, invisible seamless build) and the benefit it unlocks.",
    "- Wearability-as-desire: all-day comfort, easy to put on, invisible under clothes, works under anything.",
    "- Specific and concrete: one real detail beats three adjectives; no vague curiosity gaps.",
    "Caption rules:",
    "- Sound social-native and human; tie any 'feel great' to STYLE and FEEL, not to fixing the body.",
    "- Show that women look great at any weight, figure, and age THROUGH styling and product, never through slogans.",
    "CTA rules (calm; treat as test hypotheses):",
    "- Prefer specific, low-pressure CTAs ('save this look', 'save before you pack', 'tell us which you'd wear').",
    "- Inviting a real reply in comments is the safest engagement cue ('ask your styling question below').",
    "- No fake urgency, countdowns, 'only a few left', or manufactured deadlines.",
    "Format to goal: carousels for save-worthy styling/feature/lookbook copy; reels for discovery.",
    "Hard avoids: no age-targeting or 'why your body changed'; no body-shaming or 'hide flaws'; no 'transform your body', 'flawless', or 'snatched'; no before/after slimming; no generic empowerment ('discover comfort', 'feel confident', 'embrace your curves', 'designed for every body', 'goddess', 'unapologetic'); no unsupported 'science-backed'/'clinically proven' claims; no fabricated proof; never name a competitor or other brand.",
  ];
}

// Provider-agnostic style guard injected into every text prompt (plan, copy,
// insights). It pushes output away from formulaic "AI voice" clichés toward the
// brand's restrained, specific, human register — closer to the calmer, more
// concrete tone the owner prefers. Plain prompt text, so it works identically on
// OpenAI, Anthropic, and Ollama.
export function buildStyleGuard(): string[] {
  return [
    "Writing style — sound like a specific, calm human who knows the product, not an AI assistant or a brand bot:",
    "- Be concrete and specific. One real, observed detail beats three adjectives.",
    "- Vary sentence length and rhythm; short fragments are fine. Do not make every line the same shape.",
    "- Do NOT use rule-of-three lists as a default crutch.",
    "Banned AI-cliche openers and transitions: 'In today's world', 'In a world where', 'Let's face it', 'Picture this', 'Imagine', 'Let's dive in', 'When it comes to', 'At the end of the day', 'That said', 'Moreover', 'Furthermore', 'Here's the thing', 'Remember:', 'Pro tip:', 'The bottom line', 'In conclusion'.",
    "Banned hype verbs and buzzwords: 'elevate', 'unlock', 'unleash', 'revolutionize', 'supercharge', 'game-changer', 'level up', 'next-level', 'effortless', 'curated', 'must-have'.",
    "Banned constructions: \"It's not just X, it's Y\"; \"X isn't just about Y\"; \"Whether you're ___ or ___\"; \"Say goodbye to ___\"; filler rhetorical-question openers.",
    "Banned empty intensifiers: 'truly', 'absolutely', 'definitely', 'incredibly', 'seriously', 'literally'.",
    "Do not overuse em dashes, do not stuff emojis, and do not restate the brief or hedge ('it's worth noting', 'as you may know').",
    "If a line could appear in any brand's caption, rewrite it so it could only be ours.",
  ];
}

function postPieceLabel(post: ContentPost): string {
  const product = findShootStudioProduct(post.productId, SHOOT_STUDIO_PRODUCTS);
  return product?.name ?? "this piece";
}

// Territory-aware deterministic hooks, shaped by the copy-direction guide. The
// first hook is always the planner's own angle (the most post-specific line); the
// other two adapt a desire/showcase trigger that matches the post's territory.
export function buildHookFallbacks(post: ContentPost): string[] {
  const lowerTheme = post.theme.toLowerCase();
  const piece = postPieceLabel(post);
  const lead = post.angle?.trim()
    ? post.angle.trim()
    : `The ${lowerTheme} detail that just goes with everything.`;

  const byIntent: Record<PostIntent, [string, string]> = {
    styling: [
      "Same piece, a completely different outfit.",
      "The layer that quietly makes the whole look work.",
    ],
    "self-care": [
      "Getting ready when you actually like getting dressed.",
      "The two minutes that make the outfit sit right.",
    ],
    feature: [
      `The detail you'll notice first about ${piece}.`,
      "A small feature, and it earns its place all day.",
    ],
    wearability: [
      "On in the morning, forgotten by noon.",
      "Invisible under everything — even the fitted stuff.",
    ],
    general: [
      "A piece you'll actually reach for.",
      `The ${lowerTheme} detail that just goes with everything.`,
    ],
  };

  const [second, third] = byIntent[detectPostIntent(post)];
  return [lead, second, third];
}

// Territory-aware deterministic CTAs, shaped by the copy-direction guide — calm,
// low-pressure save / tell-us / comment cues (treated as test hypotheses).
export function buildCtaFallbacks(post: ContentPost): string[] {
  const byIntent: Record<PostIntent, [string, string]> = {
    styling: [
      "Save the look you'd wear first.",
      "Tell us which version you'd style.",
    ],
    "self-care": [
      "Save it for a slow morning.",
      "Share your easy go-to below.",
    ],
    feature: [
      "Comment if you didn't know these existed.",
      "Save this one for the details.",
    ],
    wearability: [
      "Save it for your next fitted outfit.",
      "Tell us your longest day in it.",
    ],
    general: [
      "Save this for later.",
      "Ask your styling question below — we answer each one.",
    ],
  };

  return [...byIntent[detectPostIntent(post)]];
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
  const firstCta = ctaCue || "Save this for your next outfit.";
  const secondCta = post.postType === "CAROUSEL"
    ? "Swipe through, then save it for when you're getting dressed."
    : "Save it for the next time you're putting an outfit together.";

  if (post.postType === "CAROUSEL") {
    return [
      `${lead}\n\n${proofLine}\n\nThe useful part is the styling, not the theory — here's how it actually comes together.\n\n${firstCta}`,
      `${inspirationHook ? `${normalizeCaptionSentence(inspirationHook)}\n\n` : ""}${post.theme} is worth saving before you get dressed next.\n\nStart with the outfit you actually want, then build the look around it.\n\n${secondCta}`,
    ];
  }

  if (post.postType === "BANNER") {
    return [
      `${lead}\n\n${proofLine}\n\n${offerCue ? `${normalizeCaptionSentence(offerCue)} ` : ""}It earns its place because it makes the whole outfit easier to wear, not because a banner said so.\n\n${firstCta}`,
      `${post.theme} works best when it just slips under whatever you're wearing and you stop thinking about it.\n\n${secondCta}`,
    ];
  }

  return [
    `${lead}\n\n${proofLine}\n\nThat's the difference between a piece you tolerate and one you actually reach for.\n\n${firstCta}`,
    `${inspirationHook ? `${normalizeCaptionSentence(inspirationHook)}\n\n` : ""}${profile.brandName} note: the right base layer should make getting dressed feel good, not like work.\n\n${secondCta}`,
  ];
}

function buildCaptionProofLine(post: ContentPost) {
  const text = `${post.theme} ${post.angle} ${post.visualConcept} ${post.tiktokExecution} ${post.instagramExecution}`.toLowerCase();

  if (/\b(style|styling|outfit|look|capsule|wardrobe|pair|layer|wear under|what to wear)\b/.test(text)) {
    return "The trick is in how it's styled, not in changing anything about you.";
  }

  if (/\b(strap|pad|insert|unsnap|detachable|seam|fabric|panel|material|no bra|construction)\b/.test(text)) {
    return "The detail does a quiet job: comfortable on, easy to live in, invisible under what you put over it.";
  }

  if (/\b(all[- ]day|invisible|no lines|under clothes|under anything|easy|forget)\b/.test(text)) {
    return "The point is simple: it stays comfortable all day and disappears under whatever you wear.";
  }

  return "The real test is whether you reach for it again — and whether it still feels good by evening.";
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
    candidates.push("#SeamlessUnderwear", "#NoShowUnderwear", "#InvisibleUnderwear");
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

// --- Content idea pool (current direction) --------------------------------
// Replaces the retired hardcoded motif list. Ideas are grounded in the
// styling / feature / wearability direction (see docs/CONTENT_TOPIC_SYSTEM.md);
// each carries a content territory + a "technique" tag so the planner can cover
// all four territories and avoid repeating a device. ILARIA-original and
// compliant: no age framing, no competitor names, no body-fixing language.
type ContentTerritory = "T1" | "T2" | "T3" | "T4";

interface SeedIdea {
  territory: ContentTerritory;
  topic: string;
  hookLine: string;
  format: "Reel" | "Carousel";
  technique: string;
  cta: string;
}

const TERRITORY_LABELS: Record<ContentTerritory, string> = {
  T1: "Styling & looks",
  T2: "Staying chic & self-care",
  T3: "Product features & craft",
  T4: "Everyday wearability",
};

const ILARIA_IDEA_POOL: SeedIdea[] = [
  // T1 — Styling & looks
  { territory: "T1", topic: "One piece, three ways", hookLine: "One piece, three outfits — same ten minutes to get dressed.", format: "Reel", technique: "one-piece-many-ways", cta: "Save the look you'd wear first." },
  { territory: "T1", topic: "A pack-light weekend capsule", hookLine: "Everything for three days away, and it all mixes.", format: "Carousel", technique: "travel-capsule", cta: "Save this before you pack." },
  { territory: "T1", topic: "What to wear under the sheer-skirt look", hookLine: "The sheer-skirt look only works with the right layer underneath.", format: "Carousel", technique: "what-to-wear-under", cta: "Save it for when you try the trend." },
  { territory: "T1", topic: "Desk to dinner on one base", hookLine: "Same base, two completely different evenings.", format: "Reel", technique: "work-to-night", cta: "Tell us which version you'd wear out." },
  { territory: "T1", topic: "What actually disappears under white", hookLine: "Under a white outfit, only one base layer truly disappears.", format: "Carousel", technique: "under-white", cta: "Save before your next white outfit." },
  // T2 — Staying chic & self-care
  { territory: "T2", topic: "Get ready, the easy version", hookLine: "Getting ready when you actually like getting dressed.", format: "Reel", technique: "grwm", cta: "Tell us your go-to easy outfit." },
  { territory: "T2", topic: "The base that makes the outfit", hookLine: "The two minutes that make the whole outfit sit right.", format: "Reel", technique: "quick-base", cta: "Save it for slow mornings." },
  { territory: "T2", topic: "A small good-vibes morning ritual", hookLine: "A calm five minutes before the day starts.", format: "Reel", technique: "self-care-ritual", cta: "Share yours below." },
  // T3 — Product features & craft
  { territory: "T3", topic: "The bodysuit detail you'll love", hookLine: "Bodysuit, but the bottom unsnaps — no full undress for the bathroom.", format: "Reel", technique: "feature-unsnap", cta: "Comment if you didn't know these existed." },
  { territory: "T3", topic: "Straps that don't dig", hookLine: "Wide, cushioned straps — no shoulder dents by 3pm.", format: "Carousel", technique: "feature-straps", cta: "Save for your next everyday piece." },
  { territory: "T3", topic: "Cushioned inside, smooth outside", hookLine: "Soft where it touches you, invisible under what you wear.", format: "Carousel", technique: "feature-fabric", cta: "Save this one." },
  { territory: "T3", topic: "No separate bra needed", hookLine: "Built-in support that works solo or layered.", format: "Reel", technique: "feature-double-duty", cta: "Tell us where you'd wear it." },
  { territory: "T3", topic: "The inserts that do the quiet work", hookLine: "The shaping comes from smart panels, not from squeezing.", format: "Carousel", technique: "feature-inserts", cta: "Save for the details." },
  // T4 — Everyday wearability
  { territory: "T4", topic: "On at 8, forgot by noon", hookLine: "On at 8am, forgot about it by noon.", format: "Reel", technique: "all-day-comfort", cta: "Tell us your longest day in it." },
  { territory: "T4", topic: "Invisible under everything", hookLine: "No lines, even under the clingy dress.", format: "Reel", technique: "invisible-under-clothes", cta: "Save for your next fitted outfit." },
  { territory: "T4", topic: "On in ten seconds", hookLine: "On in ten seconds, off just as fast.", format: "Reel", technique: "easy-on", cta: "Comment if getting dressed should be this easy." },
  { territory: "T4", topic: "Works under anything", hookLine: "One base layer, every kind of outfit over it.", format: "Carousel", technique: "wear-under-anything", cta: "Save the combos you'd try." },
];

function seedIdeaToPlanRow(idea: SeedIdea): string[] {
  const label = TERRITORY_LABELS[idea.territory];
  const isCarousel = idea.format === "Carousel";
  const visualConcept = isCarousel
    ? `${label}: ${idea.topic}. Saveable multi-slide layout, one clear idea per slide, warm modern styling, good-vibes energy.`
    : `${label}: ${idea.topic}. Full-bleed styling shot, clear first-frame hook, real and stylish, good-vibes energy.`;
  const tiktokExecution = isCarousel
    ? `Swipe-through reel built from the slides; open on the hook: ${idea.hookLine}`
    : `Open on the hook (${idea.hookLine}); keep it fast, real, and stylish.`;
  const instagramExecution = isCarousel
    ? `Carousel-first for saves; final slide CTA: ${idea.cta}`
    : `Reel with a clean cover line; caption ends on: ${idea.cta}`;
  return [idea.format, idea.topic, idea.hookLine, visualConcept, tiktokExecution, instagramExecution];
}

// Orders the pool round-robin across the four territories so a generated plan
// covers every territory and spaces techniques out (a technique only repeats
// after the whole pool has been used once).
export function buildIdeaPoolItems(): string[][] {
  const territories: ContentTerritory[] = ["T1", "T2", "T3", "T4"];
  const byTerritory: Record<ContentTerritory, SeedIdea[]> = { T1: [], T2: [], T3: [], T4: [] };
  for (const idea of ILARIA_IDEA_POOL) {
    byTerritory[idea.territory].push(idea);
  }
  const ordered: SeedIdea[] = [];
  for (let depth = 0; ordered.length < ILARIA_IDEA_POOL.length; depth += 1) {
    for (const territory of territories) {
      const idea = byTerritory[territory][depth];
      if (idea) {
        ordered.push(idea);
      }
    }
  }
  return ordered.map(seedIdeaToPlanRow);
}

// LLM-prompt guidance for the content direction + four territories + format map.
// Brand-name-free so the model never echoes a competitor into published copy.
export function buildContentTerritoryGuide(): string[] {
  return [
    "Content direction — aspirational, age-agnostic, good vibes. Show that women look and feel chic at any weight, figure, and age THROUGH styling and product, never through slogans. Do NOT target by age, do NOT explain 'why your body changed', and do NOT use problem/anxiety or body-fixing framing.",
    "Spread ideas across four content territories:",
    "- T1 Styling & looks: mix & match, lookbooks, capsule and travel wardrobes, 'what to wear under what'. Strongest angle: the piece that makes an outfit or trend work (e.g. the right layer under a sheer skirt, slip dress, or tee-on-tee).",
    "- T2 Staying chic & self-care: getting-ready, routines, feeling fabulous — tied to style and feel, not to fixing the body.",
    "- T3 Product features & craft: name a concrete feature and the benefit it unlocks (wide/cushioned straps, massage pads, bodysuit inserts, a detachable bottom for easy bathroom use, soft fabric, invisible seamless build); show double-duty versatility.",
    "- T4 Everyday wearability: all-day comfort, easy to put on, invisible under clothing (wearable under any fitted outfit), versatility, easy care.",
    "Lead hooks with desire and specificity (outcome/showcase, 'what to wear under', feature aha), not problems. Avoid stale generic openers, and never use age or body-decline angles.",
    "Format to goal: carousels for save-worthy styling/feature/lookbook content; reels for discovery (one-piece-many-looks, get-ready, comfort-in-motion). Put a 'save this' cue on carousels.",
  ];
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

  const ilariaOriginalItems = buildIdeaPoolItems();

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
    hookVariants: buildHookFallbacks(post),
    captionVariants,
    ctaVariants: buildCtaFallbacks(post),
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
  // A light styling story arc: hook scene -> the look coming together -> the detail
  // that makes it work -> how to wear it -> finished-look payoff. Styling-first, no
  // fit-anxiety framing. The real creativity comes from the LLM; this is the safety net.
  const base: Array<Omit<CarouselSlideDto, "index" | "kicker">> = [
    {
      frameType: "WITH_PERSON",
      frameDescription: "",
      headline: post.angle || `Styling ${lowerTheme}`,
      body: "Start with the look you actually want to wear.",
      mediaPrompt: `Scroll-stopping opening styling scene for ${lowerTheme}, woman in a real, chic outfit moment, premium realism, clean negative space for a headline`,
    },
    {
      frameType: "WITH_PERSON",
      frameDescription: "",
      headline: "Here's how the look comes together",
      body: cleanCarouselLine(post.visualConcept || "The outfit, and the piece that quietly makes it sit right underneath."),
      mediaPrompt: `Outfit-building styling shot for "${post.angle}", layered look coming together, warm daylight, polished but human`,
    },
    {
      frameType: "PRODUCT_ONLY",
      frameDescription: "",
      headline: "The detail that makes it work",
      body: "Soft where it touches you, smooth and invisible under whatever you put over it.",
      mediaPrompt: `Clean product-only detail shot for ${lowerTheme}, tactile fabric and construction, soft daylight, no model`,
    },
    {
      frameType: "USEFUL",
      frameDescription: "",
      headline: "What to wear it under",
      body: "Three outfits this one piece quietly upgrades.",
      mediaPrompt: `Simple styling infographic for ${lowerTheme}: one base piece, three outfit pairings, brand colors, minimal icons, lots of negative space`,
    },
    {
      frameType: "WITH_PERSON",
      frameDescription: "",
      headline: "The finished look",
      body: "Save this for the next time you're getting dressed.",
      mediaPrompt: `Confident finished-look styling shot for "${post.angle}", full outfit, good-vibes energy, product readable`,
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
  const minCaptionLength = minCaptionLengthForPost(post);
  const liveCaptions = safeArray(packet.captionVariants)
    .filter((caption) => captionLooksSpecific(caption, minCaptionLength))
    .slice(0, 2);
  // Keep whatever live captions passed the filter and only top up the remainder
  // from the deterministic fallbacks, instead of discarding all live captions when
  // fewer than two survive.
  const captions = [...liveCaptions];
  for (const fallback of fallbackCaptions) {
    if (captions.length >= 2) break;
    if (!captions.includes(fallback)) captions.push(fallback);
  }
  const hashtags = mergeHashtagSet(safeArray(packet.hashtagSet), buildHashtagSet(post, profile));
  const typeSpecific = normalizePacketTypeSpecific(packet, post);

  return {
    objective: safeText(packet.objective) || post.goal,
    coreAngle: safeText(packet.coreAngle) || post.angle,
    hookVariants: safeArray(packet.hookVariants).slice(0, 3),
    captionVariants: captions.slice(0, 2),
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

function minCaptionLengthForPost(post: ContentPost) {
  // Reels/video captions are meant to be short and witty (see buildPacket caption
  // rules), so a short live caption is valid and should not be discarded. Carousel
  // and banner captions carry more explanatory copy, so keep the higher bar.
  return post.postType === "VIDEO" ? 40 : 80;
}

function captionLooksSpecific(caption: string, minLength = 80) {
  const text = caption.trim();
  const generic =
    /\b(let'?s do this|clean,?\s+clear|beautifully crafted|we aim for nothing less|discover comfort|embrace your curves|feel confident|upgrade your wardrobe|designed for every body|choose ilaria|perfect for any occasion|elevate your everyday|style meets comfort)\b/i;

  return text.length >= minLength && !generic.test(text);
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
    modelId: post.modelId,
    theme: post.theme,
    angle: post.angle,
    visualConcept: post.visualConcept,
    tiktokExecution: post.tiktokExecution,
    instagramExecution: post.instagramExecution,
    assetLinks: post.assetLinks,
    referenceImageUrl: post.referenceImageUrl,
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
