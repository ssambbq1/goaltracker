export function getTaskOverdueDays(targetDate: string | undefined, today: string) {
  if (!targetDate || targetDate >= today) return 0;

  const targetTime = Date.parse(`${targetDate}T00:00:00Z`);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(targetTime) || !Number.isFinite(todayTime)) return 0;
  return Math.max(0, Math.round((todayTime - targetTime) / 86_400_000));
}
