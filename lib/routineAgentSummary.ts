import type { Routine, RoutineMark } from "@/lib/routineStore";

export type RoutineTodayStatus = RoutineMark["status"] | "unmarked" | "not_scheduled";

function addOneDay(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function getScheduledDatesThroughToday(startDate: string, endDate: string, today: string) {
  if (!startDate || !endDate || startDate > endDate || startDate > today) return [];

  const lastDate = endDate < today ? endDate : today;
  const dates: string[] = [];
  for (let date = startDate; date <= lastDate; date = addOneDay(date)) dates.push(date);
  return dates;
}

export function summarizeRoutineForAgent(routine: Routine, today: string) {
  const scheduledDates = getScheduledDatesThroughToday(routine.startDate, routine.endDate, today);
  const statusByDate = new Map(routine.marks.map((mark) => [mark.date, mark.status]));
  const successCount = scheduledDates.filter((date) => statusByDate.get(date) === "success").length;
  const failureCount = scheduledDates.filter((date) => statusByDate.get(date) === "failure").length;
  const markedCount = successCount + failureCount;
  const isScheduledToday = routine.startDate <= today && today <= routine.endDate;
  const todayStatus: RoutineTodayStatus = isScheduledToday ? (statusByDate.get(today) ?? "unmarked") : "not_scheduled";

  return {
    id: routine.id,
    title: routine.title,
    memo: routine.memo,
    startDate: routine.startDate,
    endDate: routine.endDate,
    createdAt: routine.createdAt,
    focused: routine.focused,
    marks: routine.marks.map(({ date, status }) => ({ date, status })),
    progress: {
      todayStatus,
      successCount,
      failureCount,
      markedCount,
      unmarkedCount: scheduledDates.length - markedCount,
      scheduledDaysThroughToday: scheduledDates.length,
      successRateAmongMarked: markedCount ? Math.round((successCount / markedCount) * 100) : 0,
    },
  };
}
