import { describe, expect, it } from "vitest";
import { getTaskOverdueDays } from "../lib/taskQueryFilters";

describe("getTaskOverdueDays", () => {
  it("calculates calendar days before today", () => {
    expect(getTaskOverdueDays("2026-09-20", "2026-09-24")).toBe(4);
  });

  it.each([undefined, "2026-09-24", "2026-09-25"])("returns zero for a non-overdue target: %s", (targetDate) => {
    expect(getTaskOverdueDays(targetDate, "2026-09-24")).toBe(0);
  });
});
