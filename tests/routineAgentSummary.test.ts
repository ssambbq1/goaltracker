import { describe, expect, it } from "vitest";
import { summarizeRoutineForAgent } from "../lib/routineAgentSummary";
import type { Routine } from "../lib/routineStore";

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "routine-1",
    title: "Read",
    memo: "Read every day",
    startDate: "2026-09-20",
    endDate: "2026-09-30",
    createdAt: 1,
    focused: false,
    marks: [],
    ...overrides,
  };
}

describe("summarizeRoutineForAgent", () => {
  it("exposes marks and completion statistics through today", () => {
    const summary = summarizeRoutineForAgent(
      makeRoutine({
        marks: [
          { id: "mark-1", routineId: "routine-1", date: "2026-09-20", status: "success", createdAt: 1 },
          { id: "mark-2", routineId: "routine-1", date: "2026-09-21", status: "failure", createdAt: 2 },
          { id: "mark-3", routineId: "routine-1", date: "2026-09-24", status: "success", createdAt: 3 },
        ],
      }),
      "2026-09-24",
    );

    expect(summary.marks).toEqual([
      { date: "2026-09-20", status: "success" },
      { date: "2026-09-21", status: "failure" },
      { date: "2026-09-24", status: "success" },
    ]);
    expect(summary.progress).toEqual({
      todayStatus: "success",
      successCount: 2,
      failureCount: 1,
      markedCount: 3,
      unmarkedCount: 2,
      scheduledDaysThroughToday: 5,
      successRateAmongMarked: 67,
    });
  });

  it("distinguishes an unrecorded day from failure", () => {
    const summary = summarizeRoutineForAgent(makeRoutine(), "2026-09-24");

    expect(summary.progress.todayStatus).toBe("unmarked");
    expect(summary.progress.failureCount).toBe(0);
    expect(summary.progress.unmarkedCount).toBe(5);
  });

  it("reports not_scheduled outside the routine date range", () => {
    const summary = summarizeRoutineForAgent(makeRoutine(), "2026-10-01");

    expect(summary.progress.todayStatus).toBe("not_scheduled");
    expect(summary.progress.scheduledDaysThroughToday).toBe(11);
  });
});
