import type { ContentPost } from "@prisma/client";
import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  buildCompetitorMechanicsGuide,
  buildCtaFallbacks,
  buildHookFallbacks,
  detectPostIntent,
  distributePostDates,
} from "@/lib/marketing";

function keys(dates: Date[]) {
  return dates.map((date) => format(date, "yyyy-MM-dd"));
}

function makePost(overrides: Partial<ContentPost>): ContentPost {
  return {
    theme: "",
    angle: "",
    goal: "",
    format: "",
    visualConcept: "",
    tiktokExecution: "",
    instagramExecution: "",
    postType: "VIDEO",
    productId: "",
    defaultFrameType: "WITH_PERSON",
    frameDescription: "",
    ...overrides,
  } as unknown as ContentPost;
}

const COMPETITOR_NAMES = /\b(honeylove|leonisa|shapermint|yummie|shapellx|underoutfit|skims)\b/i;

describe("content period distribution", () => {
  it("leaves quiet days when fewer posts are planned than period days", () => {
    const dates = distributePostDates(new Date("2026-05-01"), new Date("2026-05-10"), 5);

    expect(keys(dates)).toEqual([
      "2026-05-01",
      "2026-05-03",
      "2026-05-05",
      "2026-05-07",
      "2026-05-09",
    ]);
  });

  it("creates multi-post days when more posts are planned than period days", () => {
    const dates = distributePostDates(new Date("2026-05-01"), new Date("2026-05-03"), 5);

    expect(keys(dates)).toEqual([
      "2026-05-01",
      "2026-05-01",
      "2026-05-02",
      "2026-05-02",
      "2026-05-03",
    ]);
  });
});

describe("post intent detection", () => {
  it("detects sizing posts", () => {
    expect(detectPostIntent(makePost({ theme: "How to choose your true bra size" }))).toBe("sizing");
  });

  it("detects offer posts", () => {
    expect(detectPostIntent(makePost({ theme: "Spring sale with free exchange" }))).toBe("offer");
  });

  it("detects support explainer posts", () => {
    expect(detectPostIntent(makePost({ theme: "How the wireless support is built" }))).toBe("support-explainer");
  });

  it("falls back to general when nothing matches", () => {
    expect(detectPostIntent(makePost({ theme: "Spring mood board" }))).toBe("general");
  });
});

describe("intent-aware caption-packet fallbacks", () => {
  it("returns intent-specific CTAs that differ from the general default", () => {
    const sizing = buildCtaFallbacks(makePost({ theme: "size guide for between sizes" }));
    const general = buildCtaFallbacks(makePost({ theme: "spring mood board" }));

    expect(sizing).toHaveLength(2);
    expect(general).toHaveLength(2);
    expect(sizing).not.toEqual(general);
  });

  it("always leads hooks with the planner's own angle", () => {
    const hooks = buildHookFallbacks(makePost({ angle: "A very specific planned angle", theme: "support" }));

    expect(hooks).toHaveLength(3);
    expect(hooks[0]).toBe("A very specific planned angle");
  });
});

describe("competitor mechanics guide", () => {
  it("never names a competitor brand", () => {
    const text = buildCompetitorMechanicsGuide().join("\n");

    expect(COMPETITOR_NAMES.test(text)).toBe(false);
  });

  it("frames banned phrases inside an explicit avoid list", () => {
    const text = buildCompetitorMechanicsGuide().join("\n").toLowerCase();

    expect(text).toContain("hard avoids");
  });
});
