import type { ContentPost } from "@prisma/client";
import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  buildContentTerritoryGuide,
  buildCopyMechanicsGuide,
  buildCtaFallbacks,
  buildHookFallbacks,
  buildIdeaPoolItems,
  buildStyleGuard,
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
  it("detects styling posts", () => {
    expect(detectPostIntent(makePost({ theme: "One piece, three outfits" }))).toBe("styling");
  });

  it("detects feature posts", () => {
    expect(detectPostIntent(makePost({ theme: "Straps that don't dig" }))).toBe("feature");
  });

  it("detects wearability posts", () => {
    expect(detectPostIntent(makePost({ theme: "Invisible under everything you wear" }))).toBe("wearability");
  });

  it("falls back to general when nothing matches", () => {
    expect(detectPostIntent(makePost({ theme: "A quiet little announcement" }))).toBe("general");
  });
});

describe("territory-aware caption-packet fallbacks", () => {
  it("returns territory-specific CTAs that differ from the general default", () => {
    const styling = buildCtaFallbacks(makePost({ theme: "One piece, three outfits" }));
    const general = buildCtaFallbacks(makePost({ theme: "A quiet little announcement" }));

    expect(styling).toHaveLength(2);
    expect(general).toHaveLength(2);
    expect(styling).not.toEqual(general);
  });

  it("always leads hooks with the planner's own angle", () => {
    const hooks = buildHookFallbacks(makePost({ angle: "A very specific planned angle", theme: "support" }));

    expect(hooks).toHaveLength(3);
    expect(hooks[0]).toBe("A very specific planned angle");
  });
});

describe("copy mechanics guide", () => {
  it("never names a competitor brand", () => {
    const text = buildCopyMechanicsGuide().join("\n");

    expect(COMPETITOR_NAMES.test(text)).toBe(false);
  });

  it("frames banned phrases inside an explicit avoid list", () => {
    const text = buildCopyMechanicsGuide().join("\n").toLowerCase();

    expect(text).toContain("hard avoids");
  });
});

describe("style guard", () => {
  it("bans common AI-cliche buzzwords", () => {
    const text = buildStyleGuard().join("\n").toLowerCase();

    expect(text).toContain("elevate");
    expect(text).toContain("game-changer");
    expect(text).toContain("banned");
  });

  it("never names a competitor brand", () => {
    expect(COMPETITOR_NAMES.test(buildStyleGuard().join("\n"))).toBe(false);
  });
});

describe("content territory guide", () => {
  it("never names a competitor brand and avoids age-targeting", () => {
    const text = buildContentTerritoryGuide().join("\n");

    expect(COMPETITOR_NAMES.test(text)).toBe(false);
    expect(/\b(38-55|over 40|midlife|perimenopause)\b/i.test(text)).toBe(false);
  });

  it("covers all four territories", () => {
    const text = buildContentTerritoryGuide().join("\n");

    for (const territory of ["T1", "T2", "T3", "T4"]) {
      expect(text).toContain(territory);
    }
  });
});

describe("idea pool plan rows", () => {
  const rows = buildIdeaPoolItems();
  const flat = rows.flat().join(" ");

  it("returns well-formed 6-column rows", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.length === 6)).toBe(true);
  });

  it("covers all four content territories", () => {
    for (const label of [
      "Styling & looks",
      "Staying chic & self-care",
      "Product features & craft",
      "Everyday wearability",
    ]) {
      expect(flat).toContain(label);
    }
  });

  it("drops the retired motifs", () => {
    expect(/nancy meyers|chair test|group chat|6 ?pm bra|low-rise jeans/i.test(flat)).toBe(false);
  });
});
