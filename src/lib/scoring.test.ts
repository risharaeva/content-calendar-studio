import { describe, expect, it } from "vitest";
import { AutoClass } from "@prisma/client";
import { buildBaseline, classifyScore, computeAutoScore } from "@/lib/scoring";

describe("scoring", () => {
  it("builds a median baseline from history", () => {
    const baseline = buildBaseline([
      { reach: 100, views: 200, likes: 50, leads: 4, followerGain: 8 },
      { reach: 200, views: 300, likes: 70, leads: 7, followerGain: 10 },
      { reach: 160, views: 250, likes: 65, leads: 6, followerGain: 9 },
    ]);

    expect(baseline).toEqual({
      reach: 160,
      views: 250,
      likes: 65,
      leads: 6,
      followerGain: 9,
    });
  });

  it("scores against the weighted median and caps ratios", () => {
    const result = computeAutoScore(
      { reach: 400, views: 800, likes: 120, leads: 12, followerGain: 18 },
      [{ reach: 200, views: 400, likes: 60, leads: 6, followerGain: 9 }],
    );

    expect(result.score).toBe(2);
    expect(result.autoClass).toBe(AutoClass.STRONG);
  });

  it("returns normal when there is no usable baseline", () => {
    const result = computeAutoScore(
      { reach: 0, views: 0, likes: 0, leads: 0, followerGain: 0 },
      [],
    );

    expect(result.score).toBe(1);
    expect(result.autoClass).toBe(AutoClass.NORMAL);
  });

  it("classifies weak, normal, and strong ranges correctly", () => {
    expect(classifyScore(0.84)).toBe(AutoClass.WEAK);
    expect(classifyScore(1)).toBe(AutoClass.NORMAL);
    expect(classifyScore(1.16)).toBe(AutoClass.STRONG);
  });
});
