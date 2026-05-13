import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import { distributePostDates } from "@/lib/marketing";

function keys(dates: Date[]) {
  return dates.map((date) => format(date, "yyyy-MM-dd"));
}

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
