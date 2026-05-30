"use client";

import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Copy,
  ImageIcon,
  Layers3,
  Sparkles,
  Target,
} from "lucide-react";
import { AUTO_CLASS_LABELS, FRAME_TYPE_LABELS, FRAME_TYPE_OPTIONS, PLATFORM_OPTIONS, POST_TYPE_OPTIONS, STATUS_LABELS, STATUS_OPTIONS } from "@/lib/constants";
import { AppSettingsDto, BannerBriefDto, CarouselSlideDto, CompetitorPostDto, ContentPostDto, DashboardState, FrameTypeValue, ImageAssetDto, PlanEventDto, ProjectDto, ProjectProfileDto, PublishedPostDto, VideoScriptDto } from "@/lib/types";
import { SHOOT_STUDIO_PRODUCTS, type ShootStudioProduct } from "@/lib/shoot-studio-catalog";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  initialState: DashboardState;
}

const IMAGE_FORMAT_TEMPLATES = [
  {
    key: "carousel",
    label: "Carousel",
    resolution: "1080x1350",
    aspect: "4:5 vertical Instagram feed frame",
    hint: "premium editorial carousel cover, warm refined light, tasteful fashion-magazine quality",
    subjectRule: "one clear central subject that carries the post idea; no multi-panel mockup unless requested",
    compositionRule: "balanced feed composition with a calm headline area, clear visual hierarchy, and no cluttered collage",
    cameraRule: "natural 50mm editorial perspective, medium crop or detail crop, no distorted wide angle",
    textRule: "leave clean negative space for typography added later; do not render words inside the image",
  },
  {
    key: "offer_banner",
    label: "Offer banner",
    resolution: "1080x1350",
    aspect: "4:5 or 1:1 social promo frame",
    hint: "premium offer banner, polished commercial editorial, warm neutrals with one accent color",
    subjectRule: "single offer/product focal point with room for a short headline and price/CTA added later",
    compositionRule: "structured banner layout, product or person on one side, clean readable negative space on the other",
    cameraRule: "studio-commercial framing, sharp product detail, controlled shadows",
    textRule: "reserve a clean typography zone; do not generate readable or fake text",
  },
  {
    key: "reels_tiktok_cover",
    label: "Reels/TikTok cover",
    resolution: "1080x1920",
    aspect: "9:16 vertical mobile cover",
    hint: "premium editorial vertical cover, warm refined light, immediate first-frame impact",
    subjectRule: "one strong first-frame subject visible in the upper and middle thirds",
    compositionRule: "mobile-first composition with clear focal point, face/product/detail not cropped, negative space for cover title",
    cameraRule: "vertical portrait/editorial framing, natural perspective, crisp details",
    textRule: "leave a clean title area; no generated words, letters, subtitles, or UI overlays",
  },
  {
    key: "product_on_body",
    label: "Product on body",
    resolution: "1080x1350",
    aspect: "4:5 vertical product-on-body frame",
    hint: "premium product-on-body editorial photo, realistic adult model, warm refined light",
    subjectRule: "adult woman wearing the selected product; garment fit, shape, color, fabric, straps, and details must match the product reference",
    compositionRule: "product detail visible, tasteful crop, elegant posture, clean background with negative space",
    cameraRule: "realistic editorial photography, 50mm lens feel, natural body proportions and skin texture",
    textRule: "no text inside the image; leave optional quiet space for later typography",
  },
  {
    key: "product_still",
    label: "Product still",
    resolution: "1080x1350",
    aspect: "4:5 or 1:1 product-only frame",
    hint: "premium product still life, tactile fabric detail, refined commercial lighting",
    subjectRule: "selected product only; show fabric, construction, silhouette, and true color accurately",
    compositionRule: "clean still-life arrangement, product is the hero, no person or body unless explicitly requested",
    cameraRule: "studio product photography, sharp detail, soft shadows, natural texture",
    textRule: "no generated text; leave negative space only if the brief asks for later typography",
  },
  {
    key: "graphic_collage",
    label: "Graphic collage",
    resolution: "1080x1350",
    aspect: "4:5 editorial graphic frame",
    hint: "premium editorial collage, refined graphic composition, tasteful contrast and texture",
    subjectRule: "one concept-led visual system with selected product/style references used deliberately",
    compositionRule: "layered but readable composition, strong hierarchy, limited elements, clear breathing room",
    cameraRule: "mix of editorial cutouts, paper texture, product detail, and soft photographic shadows",
    textRule: "do not generate words; reserve graphic space for designed typography added later",
  },
];

const INSPIRATION_SOURCE_TYPES = [
  { value: "COMPETITOR", label: "Competitor" },
  { value: "PINTEREST", label: "Pinterest" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INTERNAL", label: "Internal idea" },
];

const PLAN_EVENT_TYPES = [
  { value: "MUST_POST", label: "Must-post topic" },
  { value: "SALE", label: "Sale / promo" },
  { value: "LAUNCH", label: "Launch" },
  { value: "OTHER", label: "Other event" },
];

export function DashboardShell({ initialState }: DashboardShellProps) {
  const [dashboard, setDashboard] = useState(initialState);
  const planningFormRef = useRef<HTMLFormElement>(null);
  const [selectedPostId, setSelectedPostId] = useState(
    initialState.todayPriorities[0]?.id ?? initialState.calendar[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [productionPrompt, setProductionPrompt] = useState<{ postId: string; text: string; kind: "image" | "video" } | null>(null);
  const [activeTab, setActiveTab] = useState<"inputs" | "calendar" | "analytics" | "feed">("inputs");
  const [activeInputTab, setActiveInputTab] = useState<"plan" | "inspiration" | "strategy" | "advanced">("plan");
  const [productOptions, setProductOptions] = useState<ShootStudioProduct[]>(SHOOT_STUDIO_PRODUCTS);
  const [frameTypeChoice, setFrameTypeChoice] = useState<FrameTypeValue>("WITH_PERSON");
  const [frameTypePostId, setFrameTypePostId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isBusy = isPending || busyAction !== null;

  // Pull the live Shoot Studio catalog so the product picker reflects the same
  // roster the renderer resolves against; the bundled snapshot is the seed and
  // the fallback if the live pull is unavailable.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/shoot-studio/catalog");
        if (!response.ok) return;
        const catalog = (await response.json()) as { products?: ShootStudioProduct[] };
        if (!cancelled && Array.isArray(catalog.products) && catalog.products.length) {
          setProductOptions(catalog.products);
        }
      } catch {
        // Keep the bundled snapshot already in state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPost =
    dashboard.calendar.find((post) => post.id === selectedPostId) ?? dashboard.calendar[0] ?? null;
  const selectedPostFrameType = selectedPost?.defaultFrameType ?? "WITH_PERSON";

  // Reset the frame-type control when the selected post changes, so the
  // conditional "describe" field reflects the post being edited. This is the
  // "adjust state during render" pattern (no effect, no cascading-render warning).
  if (selectedPost && selectedPost.id !== frameTypePostId) {
    setFrameTypePostId(selectedPost.id);
    setFrameTypeChoice(selectedPostFrameType);
  }

  const selectedProductionPrompt =
    productionPrompt && selectedPost && productionPrompt.postId === selectedPost.id
      ? productionPrompt.text
      : null;
  const selectedProductionBriefKind =
    productionPrompt && selectedPost && productionPrompt.postId === selectedPost.id
      ? productionPrompt.kind
      : null;
  const publishedPosts = dashboard.publishedPosts ?? [];
  const planningPeriod = getPlanningPeriodSummary(dashboard.profile);

  const filteredCalendar = dashboard.calendar.filter((post) => {
    if (!deferredQuery.trim()) {
      return true;
    }

    const haystack = `${post.theme} ${post.goal} ${post.format} ${post.angle} ${post.platform}`.toLowerCase();
    return haystack.includes(deferredQuery.toLowerCase());
  });
  const groupedCalendar = groupPostsByDay(
    filteredCalendar,
    planningPeriod.startDate,
    planningPeriod.endDate,
    !deferredQuery.trim(),
  );

  async function callJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const payload = (await response.json()) as T & { error?: string; details?: { fieldErrors?: Record<string, string[]> } };

    if (!response.ok) {
      const fieldErrors = payload.details?.fieldErrors
        ? Object.entries(payload.details.fieldErrors)
            .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
            .join("; ")
        : "";

      throw new Error(fieldErrors || payload.error || "Request failed.");
    }

    return payload;
  }

  function projectUrl(path: string, projectId = dashboard.activeProject.id) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}projectId=${projectId}`;
  }

  function syncDashboard(next: DashboardState, message: string) {
    startTransition(() => {
      setDashboard(next);
      setSelectedPostId((current) =>
        next.calendar.some((post) => post.id === current) ? current : next.calendar[0]?.id ?? "",
      );
      setFlash(message);
      setError(null);
    });
  }

  async function refreshDashboard(message?: string, projectId = dashboard.activeProject.id) {
    try {
      const next = await callJson<DashboardState>(projectUrl("/api/dashboard", projectId));
      syncDashboard(next, message ?? "Dashboard refreshed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refresh failed.");
    }
  }

  function buildProfilePayload(formData: FormData): Omit<ProjectProfileDto, "id" | "projectId"> {
    return {
      brandName: String(formData.get("brandName") ?? ""),
      audience: String(formData.get("audience") ?? ""),
      offers: String(formData.get("offers") ?? ""),
      goals: String(formData.get("goals") ?? ""),
      contentPillars: String(formData.get("contentPillars") ?? ""),
      currentPriorities: String(formData.get("currentPriorities") ?? ""),
      tone: String(formData.get("tone") ?? ""),
      language: String(formData.get("language") ?? ""),
      monthlyPostCount: Number(formData.get("monthlyPostCount") ?? 30),
      monthlyStartDate: String(formData.get("monthlyStartDate") ?? ""),
      monthlyEndDate: String(formData.get("monthlyEndDate") ?? ""),
      monthlyCampaignName: String(formData.get("monthlyCampaignName") ?? ""),
      monthlyPlatformFocus: String(formData.get("monthlyPlatformFocus") ?? "BOTH") as ProjectProfileDto["monthlyPlatformFocus"],
      monthlyProductFocus: String(formData.get("monthlyProductFocus") ?? ""),
      monthlyOffers: String(formData.get("monthlyOffers") ?? ""),
      monthlyPriorities: String(formData.get("monthlyPriorities") ?? ""),
      monthlyMustInclude: String(formData.get("monthlyMustInclude") ?? ""),
      monthlyAvoid: String(formData.get("monthlyAvoid") ?? ""),
      logoReferenceUrl: String(formData.get("logoReferenceUrl") ?? ""),
      visualFonts: String(formData.get("visualFonts") ?? ""),
      visualColors: String(formData.get("visualColors") ?? ""),
      productReferenceUrl: String(formData.get("productReferenceUrl") ?? ""),
      bannerReferenceUrl: String(formData.get("bannerReferenceUrl") ?? ""),
      layoutReferenceNotes: String(formData.get("layoutReferenceNotes") ?? ""),
    };
  }

  async function savePlanningInputs(formData: FormData) {
    return callJson<ProjectProfileDto>(projectUrl("/api/profile"), {
      method: "POST",
      body: JSON.stringify(buildProfilePayload(formData)),
    });
  }

  async function handleProfileSubmit(formData: FormData) {
    try {
      await savePlanningInputs(formData);
      await refreshDashboard("Profile saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile save failed.");
    }
  }

  async function handleProjectCreate(formData: FormData) {
    const payload: Pick<ProjectDto, "name" | "description"> = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    };

    try {
      const next = await callJson<DashboardState>("/api/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      syncDashboard(next, "Project created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project creation failed.");
    }
  }

  async function handleSettingsSubmit(formData: FormData) {
    const payload: Omit<AppSettingsDto, "id" | "hasOpenAiApiKey" | "imageRenderingConfigured"> = {
      ollamaModel: String(formData.get("ollamaModel") ?? ""),
      planTextProvider: String(formData.get("planTextProvider") ?? "OLLAMA") as AppSettingsDto["planTextProvider"],
      planTextModel: String(formData.get("planTextModel") ?? ""),
      copyTextProvider: String(formData.get("copyTextProvider") ?? "OLLAMA") as AppSettingsDto["copyTextProvider"],
      copyTextModel: String(formData.get("copyTextModel") ?? ""),
      insightsProvider: String(formData.get("insightsProvider") ?? "OLLAMA") as AppSettingsDto["insightsProvider"],
      insightsModel: String(formData.get("insightsModel") ?? ""),
      defaultLanguage: String(formData.get("defaultLanguage") ?? ""),
      brandVoice: String(formData.get("brandVoice") ?? ""),
      imageProvider: String(formData.get("imageProvider") ?? "LOCAL_SD_WEBUI") as AppSettingsDto["imageProvider"],
      imageModel: String(formData.get("imageModel") ?? ""),
      localImageEndpoint: String(formData.get("localImageEndpoint") ?? ""),
    };

    try {
      await callJson<AppSettingsDto>("/api/settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refreshDashboard("Settings saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Settings save failed.");
    }
  }

  async function runDashboardAction(
    url: string,
    message: string,
    workingMessage = "Working...",
    options: { savePlanningInputsFirst?: boolean; body?: Record<string, unknown> } = {},
  ) {
    setBusyAction(url);
    setFlash(options.savePlanningInputsFirst ? "Saving planning inputs..." : workingMessage);
    setError(null);

    try {
      if (options.savePlanningInputsFirst && planningFormRef.current) {
        await savePlanningInputs(new FormData(planningFormRef.current));
        setFlash(workingMessage);
      }

      const next = await callJson<DashboardState>(url, {
        method: "POST",
        body: JSON.stringify(options.body ?? {}),
      });
      syncDashboard(next, message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateMediaBrief() {
    if (!selectedPost) {
      return;
    }

    const kind = isVideoPost(selectedPost) ? "video" : "image";
    const prompt = kind === "video"
      ? buildProductionVideoBrief(selectedPost, dashboard.profile, [])
      : buildProductionImagePrompt(selectedPost, []);
    setProductionPrompt({ postId: selectedPost.id, text: prompt, kind });
    setError(null);

    try {
      await navigator.clipboard.writeText(prompt);
      setFlash(kind === "video"
        ? "Video brief copied. Send it to the creator, editor, or production specialist."
        : "Image brief copied. Paste it into ChatGPT, Nano Banana, or ComfyUI.");
    } catch {
      setFlash(kind === "video" ? "Video brief prepared. Copy it from the field below." : "Image brief prepared. Copy it from the field below.");
    }
  }

  async function handlePostIdeaSubmit(formData: FormData) {
    if (!selectedPost) {
      return;
    }

    const payload = {
      goal: String(formData.get("goal") ?? ""),
      format: String(formData.get("format") ?? ""),
      postType: String(formData.get("postType") ?? "VIDEO"),
      defaultFrameType: String(formData.get("defaultFrameType") ?? "WITH_PERSON"),
      frameDescription: String(formData.get("frameDescription") ?? ""),
      theme: String(formData.get("theme") ?? ""),
      angle: String(formData.get("angle") ?? ""),
      visualConcept: String(formData.get("visualConcept") ?? ""),
      tiktokExecution: String(formData.get("tiktokExecution") ?? ""),
      instagramExecution: String(formData.get("instagramExecution") ?? ""),
      assetLinks: String(formData.get("assetLinks") ?? ""),
      referenceImageUrl: String(formData.get("referenceImageUrl") ?? ""),
      productId: String(formData.get("productId") ?? ""),
      imageFormatKey: String(formData.get("imageFormatKey") ?? "reels_tiktok_cover"),
      imageResolution: String(formData.get("imageResolution") ?? "1080x1920"),
      imageStyle: String(formData.get("imageStyle") ?? ""),
      imageObjects: String(formData.get("imageObjects") ?? ""),
      imageImpression: String(formData.get("imageImpression") ?? ""),
      imageReferenceIds: [],
    };

    try {
      const next = await callJson<DashboardState>(`/api/posts/${selectedPost.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setProductionPrompt(null);
      syncDashboard(next, "Idea saved. Regenerate the packet when you are ready.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Idea save failed.");
    }
  }

  async function handlePlanEventSubmit(formData: FormData, eventId?: string) {
    const payload = {
      type: String(formData.get("type") ?? "MUST_POST"),
      title: String(formData.get("title") ?? ""),
      eventDate: String(formData.get("eventDate") ?? format(new Date(), "yyyy-MM-dd")),
      description: String(formData.get("description") ?? ""),
      requiredTopic: String(formData.get("requiredTopic") ?? ""),
      offer: String(formData.get("offer") ?? ""),
      platform: String(formData.get("platform") ?? "BOTH"),
      isActive: formData.get("isActive") === "on",
    };

    try {
      const next = await callJson<DashboardState>(eventId ? `/api/plan-events/${eventId}` : projectUrl("/api/plan-events"), {
        method: eventId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      syncDashboard(next, eventId ? "Plan event updated." : "Plan event added.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Plan event save failed.");
    }
  }

  async function handlePublishedPostSubmit(formData: FormData) {
    const payload = {
      platform: String(formData.get("platform") ?? "INSTAGRAM"),
      postUrl: String(formData.get("postUrl") ?? ""),
      publishedAt: String(formData.get("publishedAt") ?? format(new Date(), "yyyy-MM-dd")),
      title: String(formData.get("title") ?? ""),
      textPreview: String(formData.get("textPreview") ?? ""),
      imageUrl: String(formData.get("imageUrl") ?? ""),
      format: String(formData.get("format") ?? ""),
      views: Number(formData.get("views") ?? 0),
      reach: Number(formData.get("reach") ?? 0),
      likes: Number(formData.get("likes") ?? 0),
      comments: Number(formData.get("comments") ?? 0),
      shares: Number(formData.get("shares") ?? 0),
      saves: Number(formData.get("saves") ?? 0),
      profileVisits: Number(formData.get("profileVisits") ?? 0),
      followerGain: Number(formData.get("followerGain") ?? 0),
      leads: Number(formData.get("leads") ?? 0),
      notes: String(formData.get("notes") ?? ""),
    };

    try {
      const next = await callJson<DashboardState>(projectUrl("/api/published-posts"), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      syncDashboard(next, "Performance snapshot added.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Published post save failed.");
    }
  }

  async function handleStatusChange(postId: string, status: ContentPostDto["status"]) {
    try {
      const next = await callJson<DashboardState>(`/api/posts/${postId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      syncDashboard(next, `Status updated to ${STATUS_LABELS[status]}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status update failed.");
    }
  }

  async function handleDeletePost(postId: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this post? This also removes its packet, images, and review.")) {
      return;
    }
    try {
      const next = await callJson<DashboardState>(`/api/posts/${postId}`, { method: "DELETE" });
      syncDashboard(next, "Post deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed.");
    }
  }

  async function handleCompetitorPostSubmit(formData: FormData) {
    const payload = {
      sourceType: String(formData.get("sourceType") ?? "COMPETITOR"),
      competitorName: String(formData.get("competitorName") ?? ""),
      platform: String(formData.get("platform") ?? "INSTAGRAM"),
      postUrl: String(formData.get("postUrl") ?? ""),
      publishedAt: String(formData.get("publishedAt") ?? format(new Date(), "yyyy-MM-dd")),
      format: String(formData.get("format") ?? ""),
      theme: String(formData.get("theme") ?? ""),
      hook: String(formData.get("hook") ?? ""),
      visualPattern: String(formData.get("visualPattern") ?? ""),
      offer: String(formData.get("offer") ?? ""),
      cta: String(formData.get("cta") ?? ""),
      views: Number(formData.get("views") ?? 0),
      likes: Number(formData.get("likes") ?? 0),
      comments: Number(formData.get("comments") ?? 0),
      shares: Number(formData.get("shares") ?? 0),
      saves: Number(formData.get("saves") ?? 0),
      notes: String(formData.get("notes") ?? ""),
      isActive: formData.get("isActive") === "on",
    };

    try {
      const next = await callJson<DashboardState>(projectUrl("/api/competitor-posts"), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      syncDashboard(next, "Competitor post added to planning source.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Competitor post save failed.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ea] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[18px] border border-[#ded8cc] bg-[#fffcf7]/95 p-5 shadow-[0_24px_80px_rgba(46,40,28,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#23211d] text-[#fffcf7]">
                  <Sparkles size={22} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Shared content operating system</p>
                  <h1 className="text-4xl font-semibold tracking-[-0.04em]">{dashboard.profile.brandName}</h1>
                </div>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                Plan the selected content period from date rules, published-post analytics, inspiration, and brand strategy. Then generate post packets and creative briefs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                disabled={isBusy}
                onClick={() =>
                  runDashboardAction(
                    projectUrl("/api/plan/generate-month"),
                    "Plan rebuilt for the selected period.",
                    "Rebuilding the whole plan for the period...",
                    { savePlanningInputsFirst: true, body: { mode: "recreate" } },
                  )
                }
              >
                {busyAction?.includes("/api/plan/generate-month") ? "Generating..." : "Recreate plan"}
              </ActionButton>
              <ActionButton
                disabled={isBusy}
                tone="secondary"
                onClick={() =>
                  runDashboardAction(
                    projectUrl("/api/plan/generate-month"),
                    "Empty dates filled with fresh ideas.",
                    "Filling the empty dates in the period...",
                    { savePlanningInputsFirst: true, body: { mode: "complete" } },
                  )
                }
              >
                Complete plan
              </ActionButton>
            </div>
          </div>
        </header>

        <nav className="mt-4 grid gap-2 rounded-[16px] border border-[#ded8cc] bg-[#fffcf7]/80 p-2 shadow-[0_14px_40px_rgba(46,40,28,0.06)] sm:grid-cols-2 lg:grid-cols-4">
          <TabButton active={activeTab === "inputs"} onClick={() => setActiveTab("inputs")} label="Inputs" icon={<Target size={16} />} />
          <TabButton active={activeTab === "calendar"} onClick={() => setActiveTab("calendar")} label="Content Calendar" icon={<CalendarDays size={16} />} />
          <TabButton active={activeTab === "feed"} onClick={() => setActiveTab("feed")} label="Feed preview" icon={<ImageIcon size={16} />} />
          <TabButton active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} label="Analytics" icon={<BarChart3 size={16} />} />
        </nav>

        <div
          className={cn(
            "mt-4 flex-1 gap-4",
            activeTab === "inputs" && "grid",
            activeTab === "calendar" && "grid xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)]",
            activeTab === "analytics" && "hidden",
            activeTab === "feed" && "hidden",
          )}
        >
          <section className={cn(
            "flex min-h-[70vh] flex-col gap-4 rounded-[18px] border border-[#ded8cc] bg-[#fffcf7]/90 p-4 shadow-[0_18px_60px_rgba(46,40,28,0.06)]",
            activeTab !== "inputs" && "hidden",
          )}>
            <SectionHeader eyebrow="Planning inputs" title="Monthly plan setup" />
            <div className="grid gap-2 rounded-[14px] border border-[#ded8cc] bg-[#f3f0e9] p-2 md:grid-cols-3">
              <InputSubTabButton active={activeInputTab === "plan"} onClick={() => setActiveInputTab("plan")} icon={<CalendarDays size={15} />} label="Plan setup" />
              <InputSubTabButton active={activeInputTab === "inspiration"} onClick={() => setActiveInputTab("inspiration")} icon={<Sparkles size={15} />} label="Inspiration" />
              <InputSubTabButton active={activeInputTab === "strategy"} onClick={() => setActiveInputTab("strategy")} icon={<Layers3 size={15} />} label="Strategy" />
            </div>
            <form
              ref={planningFormRef}
              action={(formData) => startTransition(() => void handleProfileSubmit(formData))}
              className="space-y-3"
            >
              <div className={cn("space-y-3", activeInputTab !== "plan" && "hidden")}>
                <div className="grid gap-3 rounded-[16px] border border-[#e8d1bf] bg-[#fff5eb] p-3 md:grid-cols-[150px_170px_170px_minmax(0,1fr)_180px]">
                  <Field label="Total posts" name="monthlyPostCount" defaultValue={String(dashboard.profile.monthlyPostCount)} type="number" min={1} max={60} />
                  <Field label="Period start" name="monthlyStartDate" defaultValue={dashboard.profile.monthlyStartDate || format(new Date(), "yyyy-MM-dd")} type="date" />
                  <Field label="Period end" name="monthlyEndDate" defaultValue={dashboard.profile.monthlyEndDate} type="date" />
                  <Field label="Campaign / month name" name="monthlyCampaignName" defaultValue={dashboard.profile.monthlyCampaignName} />
                  <SelectField label="Platform focus" name="monthlyPlatformFocus" defaultValue={dashboard.profile.monthlyPlatformFocus} options={PLATFORM_OPTIONS} />
                </div>
                <p className="rounded-[12px] border border-[#c8dde4] bg-[#eef6f8] p-3 text-[15px] font-medium leading-6 text-slate-800">
                  Current generation period: {planningPeriod.label}. Posts are distributed across the full period: fewer posts leave quiet days, more posts create multi-post days.
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Main product / product group" name="monthlyProductFocus" defaultValue={dashboard.profile.monthlyProductFocus} textarea />
                  <Field label="Monthly offers" name="monthlyOffers" defaultValue={dashboard.profile.monthlyOffers} textarea />
                  <Field label="Monthly priorities" name="monthlyPriorities" defaultValue={dashboard.profile.monthlyPriorities} textarea />
                  <Field label="Must include this month" name="monthlyMustInclude" defaultValue={dashboard.profile.monthlyMustInclude} textarea />
                </div>
                <Field label="Avoid this month" name="monthlyAvoid" defaultValue={dashboard.profile.monthlyAvoid} textarea />
              </div>

              <div className={cn("rounded-[16px] border border-[#cfdcc6] bg-[#f1f6ee] p-3", activeInputTab !== "strategy" && "hidden")}>
                <SectionHeader eyebrow="Generator context" title="Brand strategy" />
                <div className="mt-4 grid gap-3">
                  <Field label="Brand name" name="brandName" defaultValue={dashboard.profile.brandName} />
                  <Field label="Audience" name="audience" defaultValue={dashboard.profile.audience} textarea />
                  <Field label="Always-on offers" name="offers" defaultValue={dashboard.profile.offers} textarea />
                  <Field label="Goals" name="goals" defaultValue={dashboard.profile.goals} textarea />
                  <Field label="Content pillars" name="contentPillars" defaultValue={dashboard.profile.contentPillars} textarea />
                  <Field label="Current priorities" name="currentPriorities" defaultValue={dashboard.profile.currentPriorities} textarea />
                  <Field label="Tone" name="tone" defaultValue={dashboard.profile.tone} textarea />
                  <Field label="Language" name="language" defaultValue={dashboard.profile.language} />
                </div>
              </div>

              <HiddenProfileVisualFields profile={dashboard.profile} />
              <div className={cn((activeInputTab === "inspiration" || activeInputTab === "advanced") && "hidden")}>
                <ActionButton type="submit" disabled={isBusy}>
                  Save planning inputs
                </ActionButton>
              </div>
            </form>

            <div className={cn("rounded-[16px] border border-[#d7c9b8] bg-white/60 p-3", activeInputTab !== "plan" && "hidden")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeader eyebrow="Important dates" title="Calendar rules for this plan" />
                <p className="max-w-2xl text-[15px] font-medium leading-6 text-slate-700">
                  Add topics that must happen on exact dates. Sale events automatically create warm-up posts: 7 days before, 3 days before, 1 day before, and final-hours day.
                </p>
              </div>
              <form
                action={(formData) => startTransition(() => void handlePlanEventSubmit(formData))}
                className="mt-4 grid gap-3 rounded-[14px] border border-black/8 bg-[#fffcf7] p-3"
              >
                <div className="grid gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)_180px]">
                  <SelectField label="Event type" name="type" defaultValue="MUST_POST" options={PLAN_EVENT_TYPES} />
                  <Field label="Date" name="eventDate" defaultValue={dashboard.profile.monthlyStartDate || format(new Date(), "yyyy-MM-dd")} type="date" />
                  <Field label="Event name" name="title" defaultValue="" />
                  <SelectField label="Platform" name="platform" defaultValue={dashboard.profile.monthlyPlatformFocus || "BOTH"} options={PLATFORM_OPTIONS} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Required topic" name="requiredTopic" defaultValue="" textarea />
                  <Field label="Offer / sale details" name="offer" defaultValue="" textarea />
                </div>
                <Field label="Notes for generator" name="description" defaultValue="" textarea />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4 accent-slate-900" />
                    Active in Create plan
                  </label>
                  <ActionButton type="submit" tone="secondary" disabled={isBusy}>
                    <CalendarPlus size={15} />
                    Add date rule
                  </ActionButton>
                </div>
              </form>
              <PlanEventList
                events={dashboard.planEvents}
                isBusy={isBusy}
                onSubmit={(formData, eventId) => startTransition(() => void handlePlanEventSubmit(formData, eventId))}
              />
            </div>

            <div className={cn("rounded-[16px] border border-[#e8d1bf] bg-[#fff5eb] p-4", activeInputTab !== "inspiration" && "hidden")}>
              <SectionHeader eyebrow="Inspiration inbox" title="Posts and ideas to repeat" />
              <p className="mt-2 text-[15px] font-medium leading-6 text-slate-700">
                Add competitor, Pinterest, Instagram, TikTok, or internal ideas here. The planner will score and reuse the best mechanics first, then fill the rest with ILARIA-original funnel and pillar ideas.
              </p>
              <form
                action={(formData) => startTransition(() => void handleCompetitorPostSubmit(formData))}
                className="mt-4 grid gap-3 border border-black/8 bg-white/45 p-3"
              >
                <div className="grid gap-3 md:grid-cols-[170px_180px_160px_minmax(0,1fr)_160px]">
                  <SelectField label="Source type" name="sourceType" defaultValue="COMPETITOR" options={INSPIRATION_SOURCE_TYPES} />
                  <Field label="Source name" name="competitorName" defaultValue="" />
                  <SelectField label="Platform" name="platform" defaultValue="INSTAGRAM" options={PLATFORM_OPTIONS} />
                  <Field label="Post URL (optional)" name="postUrl" defaultValue="" />
                  <Field label="Published" name="publishedAt" defaultValue={format(new Date(), "yyyy-MM-dd")} type="date" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Format" name="format" defaultValue="" />
                  <Field label="Theme" name="theme" defaultValue="" />
                  <Field label="Offer" name="offer" defaultValue="" />
                </div>
                <Field label="Hook" name="hook" defaultValue="" textarea />
                <Field label="Visual pattern" name="visualPattern" defaultValue="" textarea />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(5,100px)]">
                  <Field label="CTA" name="cta" defaultValue="" />
                  <Field label="Views" name="views" defaultValue="0" type="number" min={0} />
                  <Field label="Likes" name="likes" defaultValue="0" type="number" min={0} />
                  <Field label="Comments" name="comments" defaultValue="0" type="number" min={0} />
                  <Field label="Shares" name="shares" defaultValue="0" type="number" min={0} />
                  <Field label="Saves" name="saves" defaultValue="0" type="number" min={0} />
                </div>
                <Field label="Notes / why it worked" name="notes" defaultValue="" textarea />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4 accent-slate-900" />
                  Active in content planning
                </label>
                <ActionButton type="submit" tone="secondary" disabled={isBusy}>
                  Add inspiration
                </ActionButton>
              </form>
              <CompetitorPostTable posts={dashboard.competitorPosts} />
            </div>

            <div className={cn("rounded-[16px] border border-[#ded8cc] bg-[#f3f0e9] p-4", activeInputTab !== "advanced" && "hidden")}>
              <SectionHeader eyebrow="Advanced" title="Developer settings" />
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 rounded-[14px] border border-black/8 bg-white/55 p-3 md:grid-cols-[280px_minmax(0,1fr)]">
                  <SelectField
                    key={dashboard.activeProject.id}
                    label="Project"
                    name="activeProject"
                    defaultValue={String(dashboard.activeProject.id)}
                    options={dashboard.projects.map((project) => ({
                      value: String(project.id),
                      label: project.name,
                    }))}
                    onChange={(value) => void refreshDashboard(`Switched to ${dashboard.projects.find((project) => String(project.id) === value)?.name ?? "project"}.`, Number(value))}
                  />
                  {dashboard.activeProject.description ? (
                    <p className="self-end pb-2 text-[15px] font-medium leading-6 text-slate-700">{dashboard.activeProject.description}</p>
                  ) : null}
                </div>

                <div className="rounded-[14px] border border-black/8 bg-white/55 p-3">
                  <SectionHeader eyebrow="Projects" title="Create workspace" />
                  <form
                    action={(formData) => startTransition(() => void handleProjectCreate(formData))}
                    className="mt-4 space-y-3"
                  >
                    <Field label="Project name" name="name" defaultValue="" />
                    <Field label="Description" name="description" defaultValue="" textarea />
                    <ActionButton type="submit" tone="secondary" disabled={isBusy}>
                      Add project
                    </ActionButton>
                  </form>
                </div>

                <div className="rounded-[14px] border border-black/8 bg-white/55 p-3">
                  <SectionHeader eyebrow="Runtime" title="Local settings" />
                  <form
                    action={(formData) => startTransition(() => void handleSettingsSubmit(formData))}
                    className="mt-4 space-y-3"
                  >
                    <Field label="Ollama model" name="ollamaModel" defaultValue={dashboard.settings.ollamaModel} />
                    <ModelRouteFields
                      title="Content plan"
                      providerName="planTextProvider"
                      modelName="planTextModel"
                      providerValue={dashboard.settings.planTextProvider}
                      modelValue={dashboard.settings.planTextModel}
                    />
                    <ModelRouteFields
                      title="Post copy"
                      providerName="copyTextProvider"
                      modelName="copyTextModel"
                      providerValue={dashboard.settings.copyTextProvider}
                      modelValue={dashboard.settings.copyTextModel}
                    />
                    <ModelRouteFields
                      title="Analytics insights"
                      providerName="insightsProvider"
                      modelName="insightsModel"
                      providerValue={dashboard.settings.insightsProvider}
                      modelValue={dashboard.settings.insightsModel}
                    />
                    <Field label="Default language" name="defaultLanguage" defaultValue={dashboard.settings.defaultLanguage} />
                    <Field label="Brand voice" name="brandVoice" defaultValue={dashboard.settings.brandVoice} textarea />
                    <SelectField
                      label="Image provider"
                      name="imageProvider"
                      defaultValue={dashboard.settings.imageProvider}
                      options={[
                        { value: "SHOOT_STUDIO", label: "ILARIA Shoot Studio" },
                        { value: "LOCAL_SD_WEBUI", label: "Local generator (draft)" },
                        { value: "OPENAI", label: "OpenAI images" },
                      ]}
                    />
                    <Field label="Image model" name="imageModel" defaultValue={dashboard.settings.imageModel} />
                    <Field label="Image API endpoint" name="localImageEndpoint" defaultValue={dashboard.settings.localImageEndpoint} />
                    <div className="rounded-[12px] border border-black/8 bg-white/70 p-3 text-sm font-medium leading-6 text-slate-700">
                      Ollama and local image endpoints only run on this computer. On Vercel, choose OpenAI/Anthropic for hosted AI text, or the app will use metric-based fallback logic for recommendations. Local rendering is treated as a draft preview unless it points to a production ComfyUI, FLUX, or SDXL workflow.
                    </div>
                    <ActionButton type="submit" tone="secondary" disabled={isBusy}>
                      Save settings
                    </ActionButton>
                  </form>
                </div>
              </div>
            </div>
          </section>

          <section className={cn(
            "flex min-h-[70vh] flex-col rounded-[18px] border border-[#ded8cc] bg-[#fffcf7]/90 shadow-[0_18px_60px_rgba(46,40,28,0.06)] xl:max-h-[calc(100vh-13rem)]",
            activeTab !== "calendar" && "hidden",
          )}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 px-4 py-4">
              <div>
                <SectionHeader eyebrow="Calendar" title={`${planningPeriod.postCount}-post content view`} />
                <p className="mt-1 text-[15px] font-medium text-slate-700">{planningPeriod.label}</p>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Filter content calendar"
                className="w-full max-w-xs rounded-[10px] border border-black/10 bg-white/80 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-900"
                placeholder="Filter by theme, goal, or angle"
              />
            </div>
            <div className="flex-1 overflow-auto px-3 py-3 [content-visibility:auto]">
              {groupedCalendar.length ? (
                groupedCalendar.map((group) => (
                  <div key={group.key} className="mb-3 rounded-[16px] border border-black/8 bg-[#f8f5ef] p-2">
                    <div className="flex items-center justify-between gap-3 px-2 py-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">{format(group.date, "EEE")}</p>
                        <p className="text-lg font-semibold tracking-[-0.03em]">{format(group.date, "MMM d")}</p>
                      </div>
                      <span className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
                        group.posts.length > 1
                          ? "bg-[#87936d] text-white"
                          : group.posts.length === 1
                            ? "bg-[#fff0e8] text-slate-800"
                            : "bg-[#e7e1d7] text-slate-700",
                      )}>
                        {group.posts.length === 0 ? "quiet day" : `${group.posts.length} ${group.posts.length === 1 ? "post" : "posts"}`}
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {group.posts.length ? group.posts.map((post, index) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setSelectedPostId(post.id)}
                          className={cn(
                            "grid w-full grid-cols-[8px_minmax(0,1fr)_84px] gap-3 rounded-[12px] border border-black/6 bg-white/70 px-3 py-3 text-left transition-colors hover:bg-white",
                            selectedPost?.id === post.id && "border-[#ff4c16]/45 bg-[#fff5eb]",
                          )}
                        >
                          <span className={cn("h-full min-h-14 rounded-full", postAccentClass(post, index))} />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold tracking-[-0.02em] text-slate-950">{post.theme}</p>
                            <p className="truncate text-sm font-medium text-slate-700">{post.format} · {post.goal}</p>
                            <p className="mt-1 line-clamp-2 text-[15px] font-medium leading-6 text-slate-700">{labelPlatform(post.platform)} · {post.angle}</p>
                          </div>
                          <div className="text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                            <p>{STATUS_LABELS[post.status]}</p>
                            {post.review ? <p className="mt-1">{AUTO_CLASS_LABELS[post.review.autoClass]}</p> : null}
                          </div>
                        </button>
                      )) : (
                        <div className="rounded-[12px] border border-dashed border-black/10 bg-white/45 px-3 py-4 text-[15px] font-medium leading-6 text-slate-700">
                          No content scheduled for this date.
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-black/12 bg-white/45 p-6 text-[15px] font-medium leading-6 text-slate-700">No posts match this filter yet.</div>
              )}
            </div>
          </section>

          <section className={cn(
            "flex min-h-[70vh] flex-col gap-4 overflow-auto rounded-[18px] border border-[#ded8cc] bg-[#fffcf7]/88 p-4 shadow-[0_18px_60px_rgba(46,40,28,0.06)] xl:max-h-[calc(100vh-13rem)]",
            activeTab !== "calendar" && "hidden",
          )}>
            <SectionHeader eyebrow="Workspace" title={selectedPost ? selectedPost.theme : "Select a post"} />

            {selectedPost ? (
              <>
                <div className="space-y-2 border-b border-black/8 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">{labelPlatform(selectedPost.platform)}</p>
                      <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{selectedPost.format} · {selectedPost.goal}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                        {format(new Date(selectedPost.plannedDate), "MMM d")}
                      </span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => startTransition(() => void handleDeletePost(selectedPost.id))}
                        className="rounded-[10px] border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                    Status
                    <select
                      value={selectedPost.status}
                      disabled={isBusy}
                      onChange={(event) =>
                        startTransition(() =>
                          void handleStatusChange(selectedPost.id, event.target.value as ContentPostDto["status"]),
                        )
                      }
                      className="rounded-[10px] border border-black/10 bg-white/90 px-3 py-1.5 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-slate-900"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <form
                    key={`${selectedPost.id}-${selectedPost.theme}-${selectedPost.angle}-${selectedPost.visualConcept}-${selectedPost.imageFormatKey}-${selectedPost.productId}`}
                    action={(formData) => startTransition(() => void handlePostIdeaSubmit(formData))}
                    className="grid gap-3 border-t border-black/6 pt-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Topic" name="theme" defaultValue={selectedPost.theme} />
                      <Field label="Goal" name="goal" defaultValue={selectedPost.goal} />
                      <Field label="Format" name="format" defaultValue={selectedPost.format} />
                      <Field label="Core idea" name="angle" defaultValue={selectedPost.angle} textarea />
                      <Field label="Visual direction" name="visualConcept" defaultValue={selectedPost.visualConcept} textarea />
                      <Field label="TikTok version" name="tiktokExecution" defaultValue={selectedPost.tiktokExecution} textarea />
                      <Field label="Instagram version" name="instagramExecution" defaultValue={selectedPost.instagramExecution} textarea />
                      <Field label="Prepared image / video links, files, or folders" name="assetLinks" defaultValue={selectedPost.assetLinks} textarea />
                      <Field label="Reference image to replicate (URL)" name="referenceImageUrl" defaultValue={selectedPost.referenceImageUrl} placeholder="https://… a direct image link; its style is mimicked on generate" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-slate-800">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Post type</span>
                        <select
                          name="postType"
                          defaultValue={selectedPost.postType || "VIDEO"}
                          className="rounded-[10px] border border-black/10 bg-white/90 px-3 py-2.5 text-[15px] font-medium leading-6 text-slate-950 outline-none focus:border-slate-900 md:text-base"
                        >
                          {POST_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-800">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Frame type</span>
                        <select
                          name="defaultFrameType"
                          value={frameTypeChoice}
                          onChange={(event) => setFrameTypeChoice(event.currentTarget.value as FrameTypeValue)}
                          className="rounded-[10px] border border-black/10 bg-white/90 px-3 py-2.5 text-[15px] font-medium leading-6 text-slate-950 outline-none focus:border-slate-900 md:text-base"
                        >
                          {FRAME_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {frameTypeChoice === "OTHER" ? (
                      <Field
                        label="Frame description (required for Other)"
                        name="frameDescription"
                        defaultValue={selectedPost.frameDescription}
                        textarea
                      />
                    ) : (
                      <input type="hidden" name="frameDescription" value={selectedPost.frameDescription} />
                    )}
                    <div className="grid gap-3 border border-black/8 bg-white/45 p-3">
                      <SectionHeader
                        eyebrow={isVideoPost(selectedPost) ? "Media brief" : "Image brief"}
                        title={isVideoPost(selectedPost) ? "Cover image inputs" : "External generation brief"}
                      />
                      <label className="grid gap-2 text-sm font-medium text-slate-800">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Product</span>
                        <select
                          name="productId"
                          defaultValue={selectedPost.productId || ""}
                          className="rounded-[10px] border border-black/10 bg-white/90 px-3 py-2.5 text-[15px] font-medium leading-6 text-slate-950 outline-none focus:border-slate-900 md:text-base"
                        >
                          <option value="">Auto — detect from brief</option>
                          {productOptions.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] font-normal leading-4 text-slate-500">
                          Pins the exact Shoot Studio garment and auto-selects the matching model size.
                        </span>
                      </label>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                        <label className="grid gap-2 text-sm font-medium text-slate-800">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Template</span>
                          <select
                            name="imageFormatKey"
                            defaultValue={selectedPost.imageFormatKey || "reels_tiktok_cover"}
                            onChange={(event) => {
                              const template = IMAGE_FORMAT_TEMPLATES.find((item) => item.key === event.currentTarget.value);
                              const resolutionInput = event.currentTarget.form?.elements.namedItem("imageResolution");

                              if (template && resolutionInput instanceof HTMLInputElement) {
                                resolutionInput.value = template.resolution;
                              }
                            }}
                            className="rounded-[10px] border border-black/10 bg-white/90 px-3 py-2.5 text-[15px] font-medium leading-6 text-slate-950 outline-none focus:border-slate-900 md:text-base"
                          >
                            {IMAGE_FORMAT_TEMPLATES.map((template) => (
                              <option key={template.key} value={template.key}>
                                {template.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Field
                          label="Resolution"
                          name="imageResolution"
                          defaultValue={selectedPost.imageResolution || getImageTemplate(selectedPost.imageFormatKey).resolution}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Main style"
                          name="imageStyle"
                          defaultValue={selectedPost.imageStyle || getImageTemplate(selectedPost.imageFormatKey).hint}
                          textarea
                        />
                        <Field
                          label="Important objects"
                          name="imageObjects"
                          defaultValue={selectedPost.imageObjects || ""}
                          textarea
                        />
                      </div>
                      <Field
                        label="General impression"
                        name="imageImpression"
                        defaultValue={selectedPost.imageImpression || "tasteful, modern, sensual but not explicit, social-ready, clear first-frame impact"}
                        textarea
                      />
                    </div>
                    <ActionButton type="submit" tone="secondary" disabled={isBusy}>
                      Save idea
                    </ActionButton>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton disabled={isBusy} onClick={() => runDashboardAction(`/api/posts/${selectedPost.id}/generate-packet`, "Campaign packet generated.", "Generating campaign packet...")}>
                      {busyAction?.includes(`/api/posts/${selectedPost.id}/generate-packet`)
                        ? "Generating..."
                        : selectedPost.packet
                          ? "Regenerate packet"
                          : "Generate packet"}
                    </ActionButton>
                    <ActionButton disabled={isBusy} tone="secondary" onClick={() => void handleGenerateMediaBrief()}>
                      <Copy size={15} />
                      {isVideoPost(selectedPost) ? "Generate video brief" : "Generate image brief"}
                    </ActionButton>
                    <ActionButton
                      disabled={isBusy || !selectedPost.packet || !dashboard.settings.imageRenderingConfigured}
                      tone="secondary"
                      onClick={() => runDashboardAction(
                        `/api/posts/${selectedPost.id}/render-images`,
                        "Cover image generated and attached.",
                        "Generating cover image through ILARIA Shoot Studio...",
                        { body: { mode: "cover" } },
                      )}
                    >
                      <ImageIcon size={15} />
                      {busyAction?.includes(`/api/posts/${selectedPost.id}/render-images`) ? "Generating..." : "Generate cover image"}
                    </ActionButton>
                    <ActionButton
                      disabled={isBusy || !selectedPost.packet}
                      tone="secondary"
                      onClick={() => runDashboardAction(
                        `/api/posts/${selectedPost.id}/render-images`,
                        "Carousel slides generated and attached.",
                        "Building carousel slides with typography...",
                        { body: { mode: "carousel" } },
                      )}
                    >
                      <ImageIcon size={15} />
                      Generate carousel slides
                    </ActionButton>
                    <ActionButton
                      disabled={isBusy || !selectedPost.packet || !dashboard.settings.imageRenderingConfigured}
                      tone="secondary"
                      onClick={() => runDashboardAction(
                        `/api/posts/${selectedPost.id}/render-images`,
                        "Video scene references generated and attached.",
                        "Generating scene references through ILARIA Shoot Studio...",
                        { body: { mode: "scene_refs" } },
                      )}
                    >
                      <ImageIcon size={15} />
                      Generate scene refs
                    </ActionButton>
                  </div>
                  {selectedProductionPrompt ? (
                    <div className="grid gap-2 border border-black/8 bg-white/55 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                        <Copy size={14} />
                        {selectedProductionBriefKind === "video" ? "Video production brief" : "Compact image brief"}
                      </div>
                      <textarea
                        readOnly
                        value={selectedProductionPrompt}
                        rows={10}
                        className="resize-y rounded-[10px] border border-black/10 bg-white/95 px-3 py-2.5 font-mono text-sm font-medium leading-6 text-slate-900 outline-none"
                      />
                    </div>
                  ) : null}
                </div>

                {selectedPost.packet ? (
                  <div className="space-y-4">
                    <TextBlock title="Objective" body={selectedPost.packet.objective} />
                    <TextBlock title="Core angle" body={selectedPost.packet.coreAngle} />
                    <PacketSection title="Hooks" items={selectedPost.packet.hookVariants} />
                    <PacketSection title="Captions" items={selectedPost.packet.captionVariants} />
                    <PacketSection title="CTAs" items={selectedPost.packet.ctaVariants} />
                    <PacketSection title="Hashtags" items={selectedPost.packet.hashtagSet} inline />
                    <TextBlock title="Visual brief" body={selectedPost.packet.visualBrief} />
                    {selectedPost.postType === "VIDEO" && selectedPost.packet.videoScript ? (
                      <VideoScriptBlock script={selectedPost.packet.videoScript} />
                    ) : null}
                    {selectedPost.postType === "CAROUSEL" && selectedPost.packet.carouselSlides.length ? (
                      <CarouselSlidesBlock slides={selectedPost.packet.carouselSlides} />
                    ) : null}
                    {selectedPost.postType === "BANNER" && selectedPost.packet.bannerBrief ? (
                      <BannerBriefBlock brief={selectedPost.packet.bannerBrief} />
                    ) : null}
                    <PacketSection title="Image prompts" items={selectedPost.packet.imagePromptVariants} />
                    <PacketSection title="Review checklist" items={selectedPost.packet.reviewChecklist} />

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                        <ImageIcon size={14} />
                        Generated images
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {selectedPost.images.length ? (
                          selectedPost.images.map((image) => (
                            <VisualReferenceCard key={image.id} image={image} theme={selectedPost.theme} />
                          ))
                        ) : (
                          <p className="text-[15px] font-medium leading-6 text-slate-700">No generated images are attached yet. Generate the packet, then use Generate image.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-sm border border-dashed border-black/12 bg-white/45 p-4 text-[15px] font-medium leading-6 text-slate-700">
                    Generate a campaign packet to populate copy, prompts, and the review checklist.
                  </div>
                )}

                <div className="border-t border-black/8 pt-4">
                  <SectionHeader eyebrow="Post assets" title="Generated media and external links" />
                  <div className="mt-3">
                    <AssetLinks value={selectedPost.assetLinks} />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-sm border border-dashed border-black/12 bg-white/45 p-4 text-[15px] font-medium leading-6 text-slate-700">
                Generate a month of posts and select one to start building assets.
              </div>
            )}
          </section>
        </div>

        {activeTab === "analytics" ? (
          <section className="mt-4 grid gap-4">
            <div className="rounded-[18px] border border-[#ded8cc] bg-[#fff5eb]/88 p-4 shadow-[0_18px_60px_rgba(46,40,28,0.06)]">
              <SectionHeader eyebrow="Published posts" title="Add performance snapshot" />
              <form
                action={(formData) => startTransition(() => void handlePublishedPostSubmit(formData))}
                className="mt-4 grid gap-3"
              >
                <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_180px_160px]">
                  <SelectField
                    label="Platform"
                    name="platform"
                    defaultValue="INSTAGRAM"
                    options={[
                      { value: "INSTAGRAM", label: "Instagram" },
                      { value: "TIKTOK", label: "TikTok" },
                    ]}
                  />
                  <Field label="Post link" name="postUrl" defaultValue="" />
                  <Field label="Published date" name="publishedAt" defaultValue={format(new Date(), "yyyy-MM-dd")} type="date" />
                  <Field label="Format" name="format" defaultValue="" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Title override" name="title" defaultValue="" />
                  <Field label="Preview image URL override" name="imageUrl" defaultValue="" />
                  <Field label="Text preview override" name="textPreview" defaultValue="" textarea />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Field label="Views" name="views" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Reach" name="reach" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Likes" name="likes" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Comments" name="comments" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Shares" name="shares" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Saves" name="saves" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Profile visits" name="profileVisits" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Follower gain" name="followerGain" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Leads / clicks" name="leads" defaultValue="0" type="number" min={0} step={1} />
                  <Field label="Notes" name="notes" defaultValue="" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ActionButton type="submit" disabled={isBusy}>
                    {isBusy ? "Saving..." : "Add snapshot"}
                  </ActionButton>
                  <p className="text-[15px] font-medium leading-6 text-slate-700">
                    Add the same post again later to create a new history line. The parser pulls public preview text and image when the platform allows it; metrics stay editable.
                  </p>
                </div>
              </form>
            </div>

            <div className="rounded-[18px] border border-[#ded8cc] bg-[#fffcf7]/88 p-4 shadow-[0_18px_60px_rgba(46,40,28,0.06)]">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionHeader eyebrow="Performance history" title="All published post snapshots" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{publishedPosts.length} rows</span>
              </div>
              <PublishedPostHistoryTable posts={publishedPosts} />
            </div>

            <div className="rounded-[18px] border border-[#cfdcc6] bg-[#f1f6ee]/88 p-4 shadow-[0_18px_60px_rgba(46,40,28,0.06)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeader eyebrow="Recommendations" title="What to make next" />
                <ActionButton disabled={isBusy} tone="secondary" onClick={() => runDashboardAction(projectUrl("/api/insights/recompute"), "Insights recomputed.", "Recomputing recommendations...")}>
                  {busyAction?.includes("/api/insights/recompute") ? "Recomputing..." : "Recompute recommendations"}
                </ActionButton>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {dashboard.suggestedThemes.length ? (
                  dashboard.suggestedThemes.map((item) => (
                    <div key={item.id} className="border border-black/8 bg-white/55 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[15px] font-semibold tracking-[-0.02em] text-slate-950">{item.theme}</p>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{labelPlatform(item.platform)}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-700">{item.goal}</p>
                      <p className="mt-3 text-[15px] font-medium leading-6 text-slate-800">{item.reason}</p>
                      <p className="mt-3 text-[15px] font-medium leading-6 text-slate-700">{item.suggestedNextAngle}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[15px] font-medium leading-6 text-slate-700">Add published post snapshots, then recompute recommendations.</p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "feed" ? (
          <FeedPreview calendar={dashboard.calendar} publishedPosts={publishedPosts} />
        ) : null}

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#ded8cc] bg-[#fffcf7]/85 px-4 py-3 text-sm text-slate-600">
          <p>{flash ?? "Ready."}</p>
          <p className={cn(error ? "text-red-600" : "text-slate-500")}>{error ?? "Local data stays on this workstation."}</p>
        </footer>
      </div>
    </main>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[12px] border px-4 py-3 text-sm font-medium transition-colors",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-black/8 bg-[#f3f0e9] text-slate-700 hover:bg-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function InputSubTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-transparent bg-white/55 text-slate-700 hover:bg-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function AssetLinks({ value }: { value: string }) {
  const items = splitAssetLines(value);

  if (!items.length) {
    return (
      <div className="rounded-sm border border-dashed border-black/12 bg-white/45 p-4 text-[15px] font-medium leading-6 text-slate-700">
        Add generated image URLs, video links, Drive links, or production storage links in the post idea form above.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        isUrl(item) ? (
          <a
            key={`${item}-${index}`}
            href={item}
            target="_blank"
            rel="noreferrer"
            className="break-all border border-black/8 bg-white/65 p-3 text-[15px] font-medium leading-6 text-slate-800 hover:bg-white"
          >
            {item}
          </a>
        ) : (
          <p key={`${item}-${index}`} className="border border-black/8 bg-white/65 p-3 text-[15px] font-medium leading-6 text-slate-800">
            {item}
          </p>
        )
      ))}
    </div>
  );
}

function HiddenProfileVisualFields({ profile }: { profile: ProjectProfileDto }) {
  return (
    <div className="hidden" aria-hidden="true">
      <input type="hidden" name="logoReferenceUrl" value={profile.logoReferenceUrl} />
      <input type="hidden" name="productReferenceUrl" value={profile.productReferenceUrl} />
      <input type="hidden" name="visualFonts" value={profile.visualFonts} />
      <input type="hidden" name="visualColors" value={profile.visualColors} />
      <input type="hidden" name="bannerReferenceUrl" value={profile.bannerReferenceUrl} />
      <input type="hidden" name="layoutReferenceNotes" value={profile.layoutReferenceNotes} />
    </div>
  );
}

function PlanEventList({
  events,
  isBusy,
  onSubmit,
}: {
  events: PlanEventDto[];
  isBusy: boolean;
  onSubmit: (formData: FormData, eventId: string) => void;
}) {
  if (!events.length) {
    return (
      <p className="mt-4 rounded-[14px] border border-dashed border-black/12 bg-white/45 p-4 text-[15px] font-medium leading-6 text-slate-700">
        No fixed dates yet. Create plan will use the period, analytics recommendations, inspiration, and brand strategy only.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      {events.map((event) => (
        <form
          key={event.id}
          action={(formData) => onSubmit(formData, event.id)}
          className={cn(
            "grid gap-3 rounded-[14px] border border-black/8 bg-white/65 p-3",
            !event.isActive && "opacity-60",
          )}
        >
          <div className="grid gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)_180px]">
            <SelectField label="Event type" name="type" defaultValue={event.type} options={PLAN_EVENT_TYPES} />
            <Field label="Date" name="eventDate" defaultValue={format(new Date(event.eventDate), "yyyy-MM-dd")} type="date" />
            <Field label="Event name" name="title" defaultValue={event.title} />
            <SelectField label="Platform" name="platform" defaultValue={event.platform} options={PLATFORM_OPTIONS} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Required topic" name="requiredTopic" defaultValue={event.requiredTopic} textarea />
            <Field label="Offer / sale details" name="offer" defaultValue={event.offer} textarea />
          </div>
          <Field label="Notes for generator" name="description" defaultValue={event.description} textarea />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1 text-sm font-medium leading-6 text-slate-700">
              <span>
                {labelPlanEventType(event.type)} · {format(new Date(event.eventDate), "MMM d, yyyy")}
              </span>
              {event.type === "SALE" ? <span>Sale rule creates 4 anchored posts when dates fall inside the period.</span> : null}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input name="isActive" type="checkbox" defaultChecked={event.isActive} className="h-4 w-4 accent-slate-900" />
                Active
              </label>
              <ActionButton type="submit" tone="secondary" disabled={isBusy}>
                Update rule
              </ActionButton>
            </div>
          </div>
        </form>
      ))}
    </div>
  );
}

function VisualReferenceCard({
  image,
  theme,
}: {
  image: ContentPostDto["images"][number];
  theme: string;
}) {
  const canPreview = canRenderVisualReferenceImage(image.imagePath);

  return (
    <figure className="space-y-2">
      <div className="relative aspect-square overflow-hidden bg-black/5">
        {canPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.imagePath}
            alt={`Generated image ${image.variant} for ${theme}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col justify-between bg-[#ede7dc] p-4 text-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              <ArrowUpRight size={14} />
              Generated media
            </div>
            <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Open generated media</p>
            <p className="break-all text-sm font-medium leading-6 text-slate-700">{image.imagePath}</p>
          </div>
        )}
      </div>
      <figcaption className="space-y-1 text-sm font-medium leading-6 text-slate-700">
        <p>{image.prompt}</p>
        <a
          href={image.imagePath}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-slate-900 underline decoration-black/25 underline-offset-2"
        >
          Open image
          <ArrowUpRight size={12} />
        </a>
      </figcaption>
    </figure>
  );
}

function CompetitorPostTable({ posts }: { posts: CompetitorPostDto[] }) {
  if (!posts.length) {
    return (
              <p className="mt-4 border border-dashed border-black/12 bg-white/45 p-4 text-[15px] font-medium leading-6 text-slate-700">
        Add competitor, Pinterest, Instagram, TikTok, or internal inspiration links to activate the inspiration-based planning flow.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto [content-visibility:auto]">
      <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
        <thead className="border-y border-black/10 bg-white/50 text-xs uppercase tracking-[0.18em] text-slate-500">
          <tr>
            <th className="px-3 py-3 font-medium">Source</th>
            <th className="px-3 py-3 font-medium">Name</th>
            <th className="px-3 py-3 font-medium">Platform</th>
            <th className="px-3 py-3 font-medium">Published</th>
            <th className="px-3 py-3 font-medium">Relative</th>
            <th className="px-3 py-3 font-medium">Format</th>
            <th className="px-3 py-3 font-medium">Hook / Pattern</th>
            <th className="px-3 py-3 font-medium">Metrics</th>
            <th className="px-3 py-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {posts.slice(0, 12).map((post) => (
            <tr key={post.id} className="border-b border-black/6 align-top text-[15px] font-medium text-slate-800">
              <td className="px-3 py-3 text-slate-700">{labelInspirationSource(post.sourceType)}</td>
              <td className="px-3 py-3 font-medium text-slate-900">{post.competitorName}</td>
              <td className="px-3 py-3 text-slate-700">{labelPlatform(post.platform)}</td>
              <td className="px-3 py-3 text-slate-700">{format(new Date(post.publishedAt), "MMM d")}</td>
              <td className="px-3 py-3 text-slate-700">{post.relativeScore.toFixed(2)}x</td>
              <td className="px-3 py-3 text-slate-700">{post.format || "Unknown"}</td>
              <td className="px-3 py-3 text-slate-700">
                <p className="font-semibold text-slate-950">{post.hook || post.theme || "Untitled pattern"}</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-slate-700">{post.visualPattern || post.notes}</p>
              </td>
              <td className="px-3 py-3 text-sm font-medium leading-6 text-slate-700">
                {post.views} views · {post.likes} likes · {post.comments} comments · {post.saves} saves
              </td>
              <td className="px-3 py-3">
                {post.postUrl ? (
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-900 underline decoration-black/25 underline-offset-2"
                  >
                    Open
                    <ArrowUpRight size={12} />
                  </a>
                ) : (
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">No URL</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function canRenderVisualReferenceImage(path: string) {
  const value = path.toLowerCase().split("?")[0];

  if (value.startsWith("data:image/")) {
    return true;
  }

  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/")
  ) && (
    value.includes("images.unsplash.com") ||
    /\.(avif|gif|jpeg|jpg|png|webp)$/i.test(value)
  );
}

interface FeedTileItem {
  id: string;
  kind: "planned" | "published";
  date: string;
  image: string;
  label: string;
  postType?: string;
}

function feedCoverUrl(post: ContentPostDto) {
  const cover = [...post.images]
    .sort((a, b) => a.variant - b.variant)
    .find((image) => canRenderVisualReferenceImage(image.imagePath));
  return cover?.imagePath ?? "";
}

// Merges planned posts (calendar) and published posts into one platform feed,
// newest first — so future planned tiles sit on top, showing how the grid will
// look once published. platform=BOTH posts appear in both feeds.
function buildFeedItems(
  calendar: ContentPostDto[],
  published: PublishedPostDto[],
  platform: "INSTAGRAM" | "TIKTOK",
): FeedTileItem[] {
  const onPlatform = (value: string) => value === platform || value === "BOTH";

  const planned: FeedTileItem[] = calendar
    .filter((post) => onPlatform(post.platform))
    .map((post) => ({
      id: `plan-${post.id}`,
      kind: "planned",
      date: post.plannedDate,
      image: feedCoverUrl(post),
      label: post.theme || post.angle || "Planned post",
      postType: post.postType,
    }));

  // A post can be logged repeatedly as history snapshots; show each published post
  // once in the feed, using its most recent snapshot.
  const latestByPost = new Map<string, PublishedPostDto>();
  for (const post of published.filter((post) => onPlatform(post.platform))) {
    const key = post.postUrl || post.id;
    const current = latestByPost.get(key);
    if (!current || new Date(post.capturedAt).getTime() > new Date(current.capturedAt).getTime()) {
      latestByPost.set(key, post);
    }
  }
  const live: FeedTileItem[] = [...latestByPost.values()].map((post) => ({
    id: `live-${post.id}`,
    kind: "published",
    date: post.publishedAt,
    image: canRenderVisualReferenceImage(post.imageUrl) ? post.imageUrl : "",
    label: post.title || post.format || "Published post",
  }));

  return [...planned, ...live].toSorted(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
}

function FeedPreview({
  calendar,
  publishedPosts,
}: {
  calendar: ContentPostDto[];
  publishedPosts: PublishedPostDto[];
}) {
  return (
    <section className="mt-4 grid gap-4 lg:grid-cols-2">
      <FeedColumn title="Instagram" items={buildFeedItems(calendar, publishedPosts, "INSTAGRAM")} />
      <FeedColumn title="TikTok" items={buildFeedItems(calendar, publishedPosts, "TIKTOK")} />
    </section>
  );
}

function FeedColumn({ title, items }: { title: string; items: FeedTileItem[] }) {
  return (
    <div className="rounded-[18px] border border-[#ded8cc] bg-[#fffcf7]/90 p-4 shadow-[0_18px_60px_rgba(46,40,28,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader eyebrow="Feed preview" title={title} />
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{items.length} tiles</span>
      </div>
      {items.length ? (
        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {items.map((item) => (
            <FeedTile key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[15px] font-medium leading-6 text-slate-700">
          No planned or published posts for this feed yet. Recreate the plan, or log a published post in Analytics.
        </p>
      )}
    </div>
  );
}

function FeedTile({ item }: { item: FeedTileItem }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-[8px] border border-black/10 bg-[#f3f0e9]">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] font-medium leading-4 text-slate-600">
          {item.label}
        </div>
      )}
      <span
        className={cn(
          "absolute left-1 top-1 rounded-[6px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]",
          item.kind === "planned" ? "bg-slate-900/80 text-white" : "bg-emerald-600/85 text-white",
        )}
      >
        {item.kind === "planned" ? "Plan" : "Live"}
      </span>
      <span className="absolute bottom-1 right-1 rounded-[6px] bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">
        {format(new Date(item.date), "MMM d")}
      </span>
    </div>
  );
}

function PublishedPostHistoryTable({ posts }: { posts: PublishedPostDto[] }) {
  if (!posts.length) {
    return (
      <p className="mt-4 border border-dashed border-black/12 bg-white/45 p-4 text-[15px] font-medium leading-6 text-slate-700">
        Add a TikTok or Instagram post link above to start building the performance history.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto [content-visibility:auto]">
      <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
        <thead className="border-y border-black/10 bg-white/50 text-xs uppercase tracking-[0.18em] text-slate-500">
          <tr>
            <th className="px-3 py-3 font-medium">Captured</th>
            <th className="px-3 py-3 font-medium">Published</th>
            <th className="px-3 py-3 font-medium">Platform</th>
            <th className="px-3 py-3 font-medium">Preview</th>
            <th className="px-3 py-3 font-medium">Text</th>
            <th className="px-3 py-3 font-medium">Format</th>
            <th className="px-3 py-3 font-medium">Views</th>
            <th className="px-3 py-3 font-medium">Reach</th>
            <th className="px-3 py-3 font-medium">Likes</th>
            <th className="px-3 py-3 font-medium">Comments</th>
            <th className="px-3 py-3 font-medium">Shares</th>
            <th className="px-3 py-3 font-medium">Saves</th>
            <th className="px-3 py-3 font-medium">Visits</th>
            <th className="px-3 py-3 font-medium">Follows</th>
            <th className="px-3 py-3 font-medium">Leads</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className="border-b border-black/6 align-top text-[15px] font-medium text-slate-800">
              <td className="px-3 py-3 text-slate-700">{format(new Date(post.capturedAt), "MMM d, HH:mm")}</td>
              <td className="px-3 py-3 text-slate-700">{format(new Date(post.publishedAt), "MMM d, yyyy")}</td>
              <td className="px-3 py-3 text-slate-700">{labelPlatform(post.platform)}</td>
              <td className="px-3 py-3">
                <a
                  href={post.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-20 w-16 bg-black/5 bg-cover bg-center"
                  style={post.imageUrl ? { backgroundImage: `url("${post.imageUrl}")` } : undefined}
                  aria-label={`Open ${post.platform} post`}
                >
                  {!post.imageUrl ? (
                    <span className="flex h-full items-center justify-center px-2 text-center text-[10px] uppercase tracking-[0.12em] text-slate-400">
                      No image
                    </span>
                  ) : null}
                </a>
              </td>
              <td className="max-w-xs px-3 py-3">
                <a
                  href={post.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block font-medium tracking-[-0.02em] text-slate-900 hover:underline"
                >
                  {post.title || post.postUrl}
                </a>
                {post.textPreview ? (
                  <p className="mt-1 line-clamp-2 leading-6 text-slate-700">{post.textPreview}</p>
                ) : null}
                {post.notes ? <p className="mt-1 line-clamp-2 leading-6 text-slate-700">{post.notes}</p> : null}
              </td>
              <td className="px-3 py-3 text-slate-700">{post.format || "Unsorted"}</td>
              <MetricCell value={post.views} />
              <MetricCell value={post.reach} />
              <MetricCell value={post.likes} />
              <MetricCell value={post.comments} />
              <MetricCell value={post.shares} />
              <MetricCell value={post.saves} />
              <MetricCell value={post.profileVisits} />
              <MetricCell value={post.followerGain} />
              <MetricCell value={post.leads} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCell({ value }: { value: number }) {
  return <td className="px-3 py-3 tabular-nums text-slate-700">{value.toLocaleString()}</td>;
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">{eyebrow}</p>
      <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  textarea,
  type = "text",
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  textarea?: boolean;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-800">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{label}</span>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          rows={4}
          placeholder={placeholder}
          className="min-h-[112px] rounded-[10px] border border-black/10 bg-white/90 px-3 py-2.5 text-[15px] font-medium leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-900 md:text-base"
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          inputMode={type === "number" ? "numeric" : undefined}
          className="rounded-[10px] border border-black/10 bg-white/90 px-3 py-2.5 text-[15px] font-medium leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-900 md:text-base"
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-800">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(event) => onChange?.(event.target.value)}
        className="rounded-[10px] border border-black/10 bg-white/90 px-3 py-2.5 text-[15px] font-medium leading-6 text-slate-950 outline-none focus:border-slate-900 md:text-base"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModelRouteFields({
  title,
  providerName,
  modelName,
  providerValue,
  modelValue,
}: {
  title: string;
  providerName: string;
  modelName: string;
  providerValue: string;
  modelValue: string;
}) {
  return (
    <div className="grid gap-3 rounded-[14px] border border-black/8 bg-white/55 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{title}</p>
      <SelectField
        label="Provider"
        name={providerName}
        defaultValue={providerValue}
        options={[
          { value: "OLLAMA", label: "Ollama local" },
          { value: "OPENAI", label: "OpenAI GPT" },
          { value: "ANTHROPIC", label: "Anthropic Claude" },
        ]}
      />
      <Field label="Model" name={modelName} defaultValue={modelValue} />
    </div>
  );
}

function PacketSection({
  title,
  items,
  inline,
}: {
  title: string;
  items: string[];
  inline?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{title}</p>
      <div className={cn("grid gap-2 text-[15px] font-medium leading-7 text-slate-900", inline && "grid-cols-2")}>
        {items.map((item, index) => (
          <p key={`${title}-${index}`} className="border-b border-black/6 pb-2">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function TextBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{title}</p>
      <p className="text-[15px] font-medium leading-7 text-slate-900">{body}</p>
    </div>
  );
}

function VideoScriptBlock({ script }: { script: VideoScriptDto }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
        Video script{script.totalDurationSec ? ` · ${script.totalDurationSec}s` : ""}
      </p>
      {script.coverHook ? (
        <p className="text-[15px] font-semibold leading-7 text-slate-900">Cover hook: {script.coverHook}</p>
      ) : null}
      <div className="grid gap-2">
        {script.scenes.map((scene) => (
          <div key={scene.index} className="space-y-1 border border-black/8 bg-white/55 p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              <span>Scene {scene.index}</span>
              {scene.durationSec ? <span>{scene.durationSec}s</span> : null}
            </div>
            {scene.description ? (
              <p className="text-[15px] font-medium leading-6 text-slate-900">{scene.description}</p>
            ) : null}
            {scene.onScreenText ? (
              <p className="text-sm font-medium leading-6 text-slate-700">On-screen: {scene.onScreenText}</p>
            ) : null}
            {scene.voiceOver ? (
              <p className="text-sm font-medium leading-6 text-slate-700">VO: {scene.voiceOver}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CarouselSlidesBlock({ slides }: { slides: CarouselSlideDto[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Carousel slides</p>
      <div className="grid gap-2">
        {slides.map((slide) => (
          <div key={slide.index} className="space-y-1 border border-black/8 bg-white/55 p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              <span>{slide.kicker || `Slide ${slide.index}`}</span>
              <span>{FRAME_TYPE_LABELS[slide.frameType]}</span>
            </div>
            {slide.headline ? (
              <p className="text-[15px] font-semibold leading-6 text-slate-900">{slide.headline}</p>
            ) : null}
            {slide.body ? <p className="text-sm font-medium leading-6 text-slate-700">{slide.body}</p> : null}
            {slide.frameType === "OTHER" && slide.frameDescription ? (
              <p className="text-sm italic leading-6 text-slate-600">Frame: {slide.frameDescription}</p>
            ) : null}
            {slide.mediaPrompt ? (
              <p className="font-mono text-xs leading-5 text-slate-500">{slide.mediaPrompt}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function BannerBriefBlock({ brief }: { brief: BannerBriefDto }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
        Banner brief · {FRAME_TYPE_LABELS[brief.frameType]}
      </p>
      <div className="space-y-1 border border-black/8 bg-white/55 p-3">
        {brief.overlayText ? (
          <p className="text-[15px] font-semibold leading-6 text-slate-900">Overlay: {brief.overlayText}</p>
        ) : null}
        {brief.frameType === "OTHER" && brief.frameDescription ? (
          <p className="text-sm italic leading-6 text-slate-600">Frame: {brief.frameDescription}</p>
        ) : null}
        {brief.imagePrompt ? (
          <p className="font-mono text-xs leading-5 text-slate-500">{brief.imagePrompt}</p>
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  type = "button",
  tone = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        tone === "primary"
          ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
          : "border-[#d7c9b8] bg-[#fff7ee] text-slate-900 hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}

function labelPlatform(platform: ContentPostDto["platform"]) {
  return PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform;
}

function getPlanningPeriodSummary(profile: ProjectProfileDto) {
  const startDate = parseProfileDate(profile.monthlyStartDate) ?? new Date();
  const endDate = parseProfileDate(profile.monthlyEndDate);
  const postCount = clampUiPostCount(profile.monthlyPostCount);
  const resolvedEndDate = endDate && endDate >= startDate ? endDate : addDays(startDate, postCount - 1);
  const periodDays = Math.max(1, differenceInCalendarDays(resolvedEndDate, startDate) + 1);

  return {
    startDate,
    endDate: resolvedEndDate,
    postCount,
    periodDays,
    label: `${format(startDate, "MMM d, yyyy")} - ${format(resolvedEndDate, "MMM d, yyyy")} · ${postCount} posts across ${periodDays} days`,
  };
}

function groupPostsByDay(posts: ContentPostDto[], startDate: Date, endDate: Date, includeQuietDays: boolean) {
  const groups = new Map<string, { key: string; date: Date; posts: ContentPostDto[] }>();

  if (includeQuietDays) {
    const periodDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);

    for (let dayIndex = 0; dayIndex < periodDays; dayIndex += 1) {
      const date = addDays(startDate, dayIndex);
      const key = format(date, "yyyy-MM-dd");
      groups.set(key, { key, date, posts: [] });
    }
  }

  for (const post of posts) {
    const date = new Date(post.plannedDate);
    const key = format(date, "yyyy-MM-dd");
    const group = groups.get(key) ?? { key, date, posts: [] };
    group.posts.push(post);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) => left.date.getTime() - right.date.getTime());
}

function postAccentClass(post: ContentPostDto, index: number) {
  if (post.status === "DONE") {
    return "bg-[#87936d]";
  }

  if (post.status === "IN_PROGRESS") {
    return "bg-[#d9a441]";
  }

  if (post.packet) {
    return "bg-[#416d84]";
  }

  return index % 2 === 0 ? "bg-[#ff4c16]" : "bg-[#d9a441]";
}

function parseProfileDate(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function clampUiPostCount(value: number) {
  return Math.min(60, Math.max(1, Number.isFinite(value) ? value : 30));
}

function labelInspirationSource(sourceType: CompetitorPostDto["sourceType"]) {
  return INSPIRATION_SOURCE_TYPES.find((option) => option.value === sourceType)?.label ?? sourceType;
}

function labelPlanEventType(type: PlanEventDto["type"]) {
  return PLAN_EVENT_TYPES.find((option) => option.value === type)?.label ?? type;
}

function getImageTemplate(key: string) {
  return IMAGE_FORMAT_TEMPLATES.find((template) => template.key === key) ?? IMAGE_FORMAT_TEMPLATES[2];
}

function isVideoPost(post: ContentPostDto) {
  return post.postType === "VIDEO";
}

function buildProductionImagePrompt(post: ContentPostDto, imageAssets: ImageAssetDto[]) {
  const template = getImageTemplate(post.imageFormatKey);
  const selectedAssets = imageAssets.filter((asset) => post.imageReferenceIds.includes(asset.id));
  const productReferences = selectedAssets.filter((asset) => asset.type === "PRODUCT" || asset.type === "PRODUCT_ON_BODY");
  const styleReferences = selectedAssets.filter((asset) => asset.type === "STYLE_REFERENCE" || asset.type === "BACKGROUND");
  const layoutReferences = selectedAssets.filter((asset) => asset.type === "BANNER_REFERENCE");
  const otherReferences = selectedAssets.filter((asset) => asset.type === "OTHER");
  const style = cleanPromptLine(post.imageStyle || template.hint || "premium editorial, warm refined light");
  const objects = cleanPromptLine(
    enforceImageObjects(post, post.imageObjects || buildDefaultObjects(post, selectedAssets), selectedAssets),
  );
  const impression = cleanPromptLine(post.imageImpression || "tasteful, modern, sensual but not explicit, social-ready, clear first-frame impact");
  const productReferenceLine = formatReferenceGroup(productReferences);
  const styleReferenceLine = formatReferenceGroup(styleReferences);
  const layoutReferenceLine = formatReferenceGroup(layoutReferences);
  const otherReferenceLine = formatReferenceGroup(otherReferences);
  const referenceInstruction = buildReferenceInstruction(productReferences, styleReferences, layoutReferences);
  const doNot = buildImageDoNotLine(post.imageFormatKey);
  const mainPrompt = buildImageModelPromptSentence({
    post,
    template,
    objects,
    style,
    impression,
    productReferences,
    styleReferences,
    layoutReferences,
  });

  return [
    "IMAGE MODEL PROMPT",
    mainPrompt,
    "",
    "OUTPUT SETTINGS",
    `- Format: ${template.label}`,
    `- Resolution: ${cleanPromptLine(post.imageResolution || template.resolution)}`,
    `- Aspect ratio: ${template.aspect}`,
    `- Text in image: none. Leave clean empty space only if typography will be added later.`,
    "",
    "VISUAL SPEC",
    `- Subject: ${objects}`,
    `- Composition: ${template.compositionRule}`,
    `- Camera/framing: ${template.cameraRule}`,
    `- Scene/background: ${buildSceneLine(post, selectedAssets)}`,
    `- Lighting/color: warm refined light, realistic skin and fabric texture, premium editorial contrast, no harsh filters.`,
    `- Mood: ${impression}`,
    "",
    "REFERENCE USE",
    `- Product reference images: ${productReferenceLine}`,
    `- Style/background references: ${styleReferenceLine}`,
    `- Layout references: ${layoutReferenceLine}`,
    otherReferences.length ? `- Other references: ${otherReferenceLine}` : "",
    `- Rule: ${referenceInstruction}`,
    "",
    "NEGATIVE PROMPT",
    doNot,
  ].filter(Boolean).join("\n");
}

function buildImageModelPromptSentence({
  post,
  template,
  objects,
  style,
  impression,
  productReferences,
  styleReferences,
  layoutReferences,
}: {
  post: ContentPostDto;
  template: (typeof IMAGE_FORMAT_TEMPLATES)[number];
  objects: string;
  style: string;
  impression: string;
  productReferences: ImageAssetDto[];
  styleReferences: ImageAssetDto[];
  layoutReferences: ImageAssetDto[];
}) {
  const productTruth = productReferences.length
    ? `Use the selected product reference images as the exact garment/product source.`
    : "Do not invent brand-specific garment details.";
  const styleCue = styleReferences.length
    ? "Use selected style references only for mood, light, color, and texture."
    : "Use a clean premium editorial visual language.";
  const layoutCue = layoutReferences.length
    ? "Use selected layout references only for spacing and hierarchy."
    : template.compositionRule;

  return [
    `${template.label} image for a social media post.`,
    `Single finished image, not a collage of options.`,
    `Main subject: ${objects}.`,
    `Visual idea: ${cleanPromptLine(post.visualConcept || post.angle)}.`,
    `Style: ${style}.`,
    `Composition: ${layoutCue}`,
    `Camera: ${template.cameraRule}.`,
    `Lighting: warm refined editorial light, realistic fabric and skin texture, premium commercial finish.`,
    `Mood: ${impression}.`,
    productTruth,
    styleCue,
    "No readable text, no fake letters, no watermark.",
  ].join(" ");
}

function buildProductionVideoBrief(post: ContentPostDto, profile: ProjectProfileDto, imageAssets: ImageAssetDto[]) {
  const selectedAssets = imageAssets.filter((asset) => post.imageReferenceIds.includes(asset.id));
  const productReferences = selectedAssets.filter((asset) => asset.type === "PRODUCT" || asset.type === "PRODUCT_ON_BODY");
  const styleReferences = selectedAssets.filter((asset) => asset.type === "STYLE_REFERENCE" || asset.type === "BACKGROUND" || asset.type === "BANNER_REFERENCE");
  const platformUse = post.platform === "BOTH" ? "TikTok and Instagram Reels" : labelPlatform(post.platform);
  const hooks = post.packet?.hookVariants?.length ? post.packet.hookVariants : [post.angle];
  const ctas = post.packet?.ctaVariants?.length ? post.packet.ctaVariants : ["Save this before choosing the product.", "Comment with your fit question."];
  const captions = post.packet?.captionVariants?.length ? post.packet.captionVariants : [];
  const visualBrief = post.packet?.visualBrief || post.visualConcept;

  return [
    "TASK: Produce one finished short-form video from this brief. This is a production task for a creator, editor, or video specialist, not an image-generation prompt.",
    `BRAND/AUDIENCE: ${cleanPromptLine(profile.brandName || "ILARIA")} for ${cleanPromptLine(profile.audience || "adult women 38-55")}. Tasteful, modern, premium, warm, useful.`,
    `PLATFORM USE: ${platformUse}.`,
    `FORMAT: ${cleanPromptLine(post.format || "Reel")}.`,
    "RECOMMENDED LENGTH: 8-18 seconds unless the hook needs a slower demonstration.",
    "OUTPUT: vertical 9:16 video, social-ready, with clean first frame and room for platform captions.",
    "",
    `OBJECTIVE: ${cleanPromptLine(post.packet?.objective || post.goal)}`,
    `CORE ANGLE: ${cleanPromptLine(post.packet?.coreAngle || post.angle)}`,
    `TOPIC: ${cleanPromptLine(post.theme)}`,
    "",
    "HOOK OPTIONS:",
    formatBriefList(hooks),
    "",
    "VIDEO STRUCTURE:",
    `1. First 1-2 seconds: open with the strongest hook and a visually specific situation: ${cleanPromptLine(post.angle)}.`,
    `2. Middle: show the proof or action clearly: ${cleanPromptLine(post.tiktokExecution || visualBrief || "demonstrate the problem, then the product-supported resolution")}.`,
    `3. Final beat: resolve into a tasteful product/fit/comfort proof and use one CTA: ${cleanPromptLine(ctas[0] || "Save this before choosing the product.")}.`,
    "",
    "SHOT LIST / VISUAL DIRECTION:",
    `- Main scene: ${cleanPromptLine(visualBrief || "premium, warm, adult-life fashion moment with clear product relevance")}.`,
    `- Product/detail shot: ${productReferences.length ? `use selected product references: ${formatReferenceGroup(productReferences)}` : "include product detail only if it is truthful and available."}`,
    `- Style reference: ${styleReferences.length ? formatReferenceGroup(styleReferences) : cleanPromptLine(post.imageStyle || "premium editorial, warm refined light")}.`,
    `- Cover/first frame: ${cleanPromptLine(post.imageObjects || post.visualConcept || post.angle)}. Leave negative space for title text added later.`,
    "",
    "EDITING NOTES:",
    "- Keep pacing clean and readable, not chaotic.",
    "- Use natural movement: mirror adjustment, hands showing detail, outfit transition, sitting/walking/long-day proof when relevant.",
    "- Avoid before/after body transformation language. Show same-body, better support/comfort/product logic.",
    "- Text overlays should be short, high-contrast, and readable on mobile.",
    "- Do not oversexualize, distort body proportions, or invent product details.",
    "",
    "INSTAGRAM VERSION:",
    cleanPromptLine(post.instagramExecution || "Use polished cover, concise caption, and saveable framing."),
    "",
    "TIKTOK VERSION:",
    cleanPromptLine(post.tiktokExecution || "Use faster hook delivery, more direct demonstration, and natural spoken/text-led pacing."),
    captions.length ? ["", "CAPTION DIRECTIONS:", formatBriefList(captions)].join("\n") : "",
    "",
    "CTA OPTIONS:",
    formatBriefList(ctas),
    post.assetLinks ? ["", `PREPARED ASSETS / LINKS: ${cleanPromptLine(post.assetLinks)}`].join("\n") : "",
  ].filter(Boolean).join("\n");
}

function formatBriefList(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${cleanPromptLine(item)}`).join("\n");
}

function formatReferenceGroup(assets: ImageAssetDto[]) {
  return assets.length
    ? assets.map((asset) => `${asset.name}${asset.sourcePath ? ` (${asset.sourcePath})` : ""}${asset.description ? ` - ${asset.description}` : ""}`).join(" | ")
    : "none selected";
}

function buildDefaultObjects(post: ContentPostDto, selectedAssets: ImageAssetDto[]) {
  const selectedProducts = selectedAssets
    .filter((asset) => asset.type === "PRODUCT" || asset.type === "PRODUCT_ON_BODY")
    .map((asset) => asset.name);

  if (post.imageFormatKey === "product_on_body") {
    return `adult woman wearing ${selectedProducts.join(", ") || "the selected product"}, product detail visible, clean negative space`;
  }

  if (post.imageFormatKey === "product_still") {
    return `${selectedProducts.join(", ") || "selected product"}, product-only composition, fabric and construction detail, no person unless explicitly requested`;
  }

  if (post.imageFormatKey === "reels_tiktok_cover") {
    return `${post.visualConcept || post.angle}, clear first-frame focal point, negative space for cover typography`;
  }

  return post.visualConcept || post.angle;
}

function buildSceneLine(post: ContentPostDto, selectedAssets: ImageAssetDto[]) {
  const backgroundAssets = selectedAssets
    .filter((asset) => asset.type === "BACKGROUND")
    .map((asset) => asset.name)
    .join(", ");

  if (backgroundAssets) {
    return `use ${backgroundAssets} as background mood only; keep it simple and secondary to the subject`;
  }

  if (post.imageFormatKey === "product_still") {
    return "minimal premium studio surface or soft fabric background, clean shadows, no decorative clutter";
  }

  if (post.imageFormatKey === "offer_banner") {
    return "clean commercial background with enough open space for offer typography added later";
  }

  if (post.imageFormatKey === "graphic_collage") {
    return "editorial paper-and-photo collage environment, restrained layers, premium tactile materials";
  }

  return "premium indoor editorial setting or clean studio background that supports the subject without stealing attention";
}

function enforceImageObjects(post: ContentPostDto, value: string, selectedAssets: ImageAssetDto[]) {
  const normalizedValue = normalizeObjectsForFormat(post.imageFormatKey, value);
  const selectedProducts = selectedAssets
    .filter((asset) => asset.type === "PRODUCT" || asset.type === "PRODUCT_ON_BODY")
    .map((asset) => asset.name)
    .join(", ");

  if (post.imageFormatKey === "product_on_body") {
    return `adult woman wearing ${selectedProducts || "the selected product"}, product detail visible, ${normalizedValue}`;
  }

  if (post.imageFormatKey === "product_still") {
    return `product-only image, no person unless explicitly requested, ${normalizedValue}`;
  }

  if (post.imageFormatKey === "reels_tiktok_cover") {
    return `9:16 Reels/TikTok cover composition, strong first-frame focal point, clean negative space, ${normalizedValue}`;
  }

  return normalizedValue;
}

function normalizeObjectsForFormat(formatKey: string, value: string) {
  let normalized = value.replace(/\s+/g, " ").trim();

  if (formatKey !== "carousel") {
    normalized = normalized
      .replace(/\bmagazine carousel:\s*/gi, "")
      .replace(/\bcarousel cover:\s*/gi, "")
      .replace(/\bcarousel:\s*/gi, "")
      .replace(/\bmulti-slide\b/gi, "single-frame")
      .replace(/\bone rule per slide[.,;]?\s*/gi, "")
      .replace(/\bper slide\b/gi, "for the single frame")
      .replace(/\bslides?\b/gi, "frame");
  }

  if (formatKey === "product_still") {
    normalized = normalized
      .replace(/\badult woman wearing\b/gi, "")
      .replace(/\bperson wearing\b/gi, "")
      .replace(/\bmodel wearing\b/gi, "")
      .replace(/\bon body\b/gi, "product detail");
  }

  return normalized.replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();
}

function buildReferenceInstruction(
  productReferences: ImageAssetDto[],
  styleReferences: ImageAssetDto[],
  layoutReferences: ImageAssetDto[],
) {
  const rules = [
    productReferences.length
      ? "product references define the real garment/product; preserve color, silhouette, straps, fabric, construction, and logo truth"
      : "no product reference was selected, so avoid inventing brand-specific garment details",
    styleReferences.length
      ? "style references are mood boards only; do not copy people, products, logos, or layouts from them"
      : "",
    layoutReferences.length
      ? "layout references control spacing and hierarchy only; do not copy their text, products, or exact design"
      : "",
    "do not average all references into a messy hybrid; choose one main subject and keep every reference in its assigned role",
  ];

  return rules.filter(Boolean).join("; ");
}

function buildImageDoNotLine(formatKey: string) {
  const shared =
    "change garment shape/color, invent straps/lace/logos, add fake text, render unreadable words, oversexualize, make the model look underage, plastic skin, extra fingers, distorted body, messy background, watermark, logo hallucination";

  if (formatKey === "product_still") {
    return `${shared}, add a person unless explicitly requested`;
  }

  if (formatKey === "product_on_body") {
    return `${shared}, hide the product, crop out key garment details, turn the reference product into a different item`;
  }

  if (formatKey === "reels_tiktok_cover") {
    return `${shared}, crop the focal object awkwardly, fill all negative space`;
  }

  return shared;
}

function cleanPromptLine(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim() || "not specified";
}

function splitAssetLines(value?: string) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
