import "dotenv/config";
import { PrismaClient, AutoClass, ManualVerdict, Platform, PostStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.project.upsert({
    where: { id: 1 },
    update: {
      name: "ILARIA",
      slug: "ilaria",
      description: "Comfort-first intimates and shapewear content system",
    },
    create: {
      id: 1,
      name: "ILARIA",
      slug: "ilaria",
      description: "Comfort-first intimates and shapewear content system",
    },
  });

  await prisma.project.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: "Founder Blog",
      slug: "founder-blog",
      description: "Personal founder-led essays, ideas, and distribution experiments",
    },
  });

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      ollamaModel: "llama3.1:8b",
      planTextProvider: "OPENAI",
      planTextModel: "gpt-4o-mini",
      copyTextProvider: "OPENAI",
      copyTextModel: "gpt-4o-mini",
      insightsProvider: "OPENAI",
      insightsModel: "gpt-4o-mini",
      defaultLanguage: "English",
      brandVoice: "Useful, observational, practical, and calm.",
      imageProvider: "LOCAL_SD_WEBUI",
      imageModel: "segmind/tiny-sd",
      localImageEndpoint: "http://127.0.0.1:7861/sdapi/v1/img2img",
    },
  });

  await prisma.projectProfile.upsert({
    where: { projectId: 1 },
    update: {},
    create: {
      projectId: 1,
      brandName: "ILARIA",
      audience: "Women 38-55 who want comfortable shaping, fuller-bust support, and calm confidence in the body they have now.",
      offers: "Comfort-first bras\nGentle shapewear\nLong-wear support pieces",
      goals: "Follower growth\nLead generation\nBrand recall",
      contentPillars: "Fit education\nReal-life comfort proof\nProduct support explainers\nSizing reassurance",
      currentPriorities: "Reduce purchase anxiety\nExplain support without harsh compression\nBuild trust around fit, returns, and quality",
      tone: "Warm, human, specific, calm, and conversational.",
      language: "English",
    },
  });

  await prisma.projectProfile.upsert({
    where: { projectId: 2 },
    update: {},
    create: {
      projectId: 2,
      brandName: "Founder Blog",
      audience: "Operators, founders, and creative builders interested in honest notes from building brands and tools.",
      offers: "Essays\nBuild notes\nBehind-the-scenes systems",
      goals: "Newsletter growth\nThought leadership\nRelationship building",
      contentPillars: "Build in public\nLessons learned\nCreative process\nOperator notes",
      currentPriorities: "Create a repeatable publishing rhythm\nTurn working notes into useful posts",
      tone: "Direct, reflective, practical, and human.",
      language: "English",
    },
  });

  const sampleDates = [18, 14, 11, 7, 4, 2].map((daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(10, 0, 0, 0);
    return date;
  });

  await prisma.generatedImage.deleteMany();
  await prisma.reviewResult.deleteMany();
  await prisma.campaignPacket.deleteMany();
  await prisma.contentPost.deleteMany();
  await prisma.themeRecommendation.deleteMany();

  const samplePosts = [
    {
      platform: Platform.INSTAGRAM,
      goal: "Follower growth",
      theme: "Real-life comfort proof",
      angle: "Show how support feels after a full workday, not just in a try-on.",
      review: { reach: 1800, views: 2500, likes: 160, leads: 7, followerGain: 18, manualVerdict: ManualVerdict.WORKED, manualNote: "Long-wear specificity made the comfort promise believable.", autoScore: 1.32, autoClass: AutoClass.STRONG },
    },
    {
      platform: Platform.TIKTOK,
      goal: "Lead generation",
      theme: "Fit education",
      angle: "Explain why a bra can feel supportive at 9 AM and punishing by 5 PM.",
      review: { reach: 1400, views: 3100, likes: 120, leads: 10, followerGain: 12, manualVerdict: ManualVerdict.WORKED, manualNote: "A clear pain point drove saves and profile visits.", autoScore: 1.24, autoClass: AutoClass.STRONG },
    },
    {
      platform: Platform.INSTAGRAM,
      goal: "Brand recall",
      theme: "Product support explainers",
      angle: "Break down smoothing without making harsh compression the hero.",
      review: { reach: 950, views: 1400, likes: 88, leads: 3, followerGain: 8, manualVerdict: ManualVerdict.NEUTRAL, manualNote: "Helpful, but not surprising enough to travel.", autoScore: 0.97, autoClass: AutoClass.NORMAL },
    },
    {
      platform: Platform.TIKTOK,
      goal: "Follower growth",
      theme: "Sizing reassurance",
      angle: "Answer the sizing question women ask when their body has recently changed.",
      review: { reach: 2050, views: 3600, likes: 210, leads: 6, followerGain: 26, manualVerdict: ManualVerdict.WORKED, manualNote: "Gentle reassurance outperformed polished promo.", autoScore: 1.41, autoClass: AutoClass.STRONG },
    },
    {
      platform: Platform.INSTAGRAM,
      goal: "Lead generation",
      theme: "Real-life comfort proof",
      angle: "Turn one customer note into a practical before-and-after comfort story.",
      review: { reach: 1120, views: 1700, likes: 98, leads: 9, followerGain: 9, manualVerdict: ManualVerdict.WORKED, manualNote: "Concrete proof made the CTA believable.", autoScore: 1.18, autoClass: AutoClass.STRONG },
    },
    {
      platform: Platform.TIKTOK,
      goal: "Brand recall",
      theme: "Product support explainers",
      angle: "Correct one common misconception about shapewear comfort.",
      review: { reach: 760, views: 1200, likes: 51, leads: 1, followerGain: 4, manualVerdict: ManualVerdict.MISSED, manualNote: "Informative, but too abstract and low-energy.", autoScore: 0.71, autoClass: AutoClass.WEAK },
    },
  ];

  for (const [index, sample] of samplePosts.entries()) {
    const post = await prisma.contentPost.create({
      data: {
        projectId: 1,
        platform: sample.platform,
        plannedDate: sampleDates[index],
        goal: sample.goal,
        theme: sample.theme,
        angle: sample.angle,
        status: PostStatus.DONE,
      },
    });

    await prisma.campaignPacket.create({
      data: {
        postId: post.id,
        objective: sample.goal,
        targetPlatform: sample.platform,
        coreAngle: sample.angle,
        hookVariants: JSON.stringify([
          `What actually moved this ${sample.goal.toLowerCase()} result?`,
          `The simple shift behind this ${sample.theme.toLowerCase()} post`,
          `A better way to frame ${sample.theme.toLowerCase()} content`,
        ]),
        captionVariants: JSON.stringify([
          `We tested a ${sample.theme.toLowerCase()} post built around ${sample.angle.toLowerCase()}.`,
          `This post focused on ${sample.goal.toLowerCase()} by showing ${sample.theme.toLowerCase()} in a more practical way.`,
        ]),
        ctaVariants: JSON.stringify(["Comment FIT if you want sizing help.", "DM for help choosing your support level."]),
        hashtagSet: JSON.stringify(["#comfortfirst", "#shapewear", "#brafit", "#bodyconfidence"]),
        visualBrief: "Use soft editorial lighting, realistic bodies, clear product context, and room for headline overlays.",
        imagePromptVariants: JSON.stringify([
          `Editorial comfort-first intimates scene for ${sample.theme.toLowerCase()} content, warm natural light, real-life dressing moment, social-first framing`,
          `High-end shapewear support concept that signals ${sample.goal.toLowerCase()}, human touch, calm surfaces, premium realism`,
        ]),
        reviewChecklist: JSON.stringify([
          "Does the hook stop a cold viewer?",
          "Is the CTA aligned with the post goal?",
          "Would the visual still make sense without text?",
        ]),
      },
    });

    await prisma.reviewResult.create({
      data: {
        postId: post.id,
        ...sample.review,
        reviewedAt: sampleDates[index],
      },
    });
  }

  await prisma.themeRecommendation.createMany({
    data: [
      {
        rank: 1,
        theme: "Sizing reassurance",
        goal: "Follower growth",
        platform: Platform.TIKTOK,
        reason: "Sizing reassurance is producing both views and follower lift.",
        suggestedNextAngle: "Answer one common fit worry with calm specifics and a clear next step.",
        evidence: JSON.stringify({ medianScore: 1.365, wins: ["views", "followers"], basedOnPosts: 2 }),
        projectId: 1,
      },
      {
        rank: 2,
        theme: "Real-life comfort proof",
        goal: "Lead generation",
        platform: Platform.INSTAGRAM,
        reason: "Specific comfort proof is generating believable conversion intent.",
        suggestedNextAngle: "Turn one customer comfort note into a practical day-in-the-life example before the CTA.",
        evidence: JSON.stringify({ medianScore: 1.18, wins: ["leads"], basedOnPosts: 1 }),
        projectId: 1,
      },
      {
        rank: 3,
        theme: "Fit education",
        goal: "Lead generation",
        platform: Platform.TIKTOK,
        reason: "Specific fit education is attracting the right curiosity and profile visits.",
        suggestedNextAngle: "Name one late-day discomfort pattern, then show how the support design addresses it.",
        evidence: JSON.stringify({ medianScore: 1.24, wins: ["views", "leads"], basedOnPosts: 1 }),
        projectId: 1,
      },
    ],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
