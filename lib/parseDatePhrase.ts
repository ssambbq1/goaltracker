export type ParsedDatePhrase = {
  iso: string;
  phrase: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeParsedDatePhrase(text: string, parsed: ParsedDatePhrase | null) {
  if (!parsed?.phrase) return text;
  return text
    .replace(new RegExp(`(^|\\s)${escapeRegExp(parsed.phrase)}(?=\\s|$)`), " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function parseKoreanDatePhrase(text: string): ParsedDatePhrase | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  function isoForDaysFromNow(days: number) {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return toIso(d);
  }

  function toIso(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function endOfCurrentWeekIso() {
    const d = new Date(now);
    const daysToSunday = 7 - d.getDay();
    d.setDate(d.getDate() + daysToSunday);
    return toIso(d);
  }

  function endOfCurrentMonthIso() {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1, 0); // last day of month
    return toIso(d);
  }

  function dateForMonthDay(month: number, day: number) {
    const safeMonth = Math.min(12, Math.max(1, month));
    const firstOfMonth = new Date(now.getFullYear(), safeMonth - 1, 1);
    const lastDay = new Date(now.getFullYear(), safeMonth, 0).getDate();
    const d = new Date(now.getFullYear(), safeMonth - 1, Math.min(lastDay, Math.max(1, day)));
    if (d.getTime() < now.getTime()) {
      d.setFullYear(d.getFullYear() + 1);
      const nextYearLastDay = new Date(d.getFullYear(), safeMonth, 0).getDate();
      d.setMonth(firstOfMonth.getMonth(), Math.min(nextYearLastDay, Math.max(1, day)));
    }
    return toIso(d);
  }

  function dateForCurrentMonthDay(day: number) {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return toIso(new Date(now.getFullYear(), now.getMonth(), Math.min(lastDay, Math.max(1, day))));
  }

  // weekday mapping: 일:0, 월:1, 화:2, 수:3, 목:4, 금:5, 토:6
  const weekdayMap: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

  function nextWeekdayIso(targetWeekday: number, weeksOffset = 0) {
    const d = new Date(now);
    const today = d.getDay();
    let delta = targetWeekday - today + weeksOffset * 7;
    if (delta < 0) delta += 7;
    d.setDate(d.getDate() + delta);
    return toIso(d);
  }

  // Numeric offsets: '3일 후', '2주 후', '5일 전'
  const offDayMatch = lower.match(/(\d+)\s*일\s*(?:뒤|후)\s*(?:까지)?/);
  if (offDayMatch) return { iso: isoForDaysFromNow(Number(offDayMatch[1])), phrase: offDayMatch[0].trim() };
  const offDayBefore = lower.match(/(\d+)\s*일\s*전/);
  if (offDayBefore) return { iso: isoForDaysFromNow(-Number(offDayBefore[1])), phrase: `${offDayBefore[1]}일 전` };
  const offWeekMatch = lower.match(/(\d+)\s*주\s*(?:뒤|후)\s*(?:까지)?/);
  if (offWeekMatch) return { iso: isoForDaysFromNow(Number(offWeekMatch[1]) * 7), phrase: offWeekMatch[0].trim() };

  // direct words
  const tomorrow = lower.match(/내일(?:까지)?/);
  if (tomorrow) return { iso: isoForDaysFromNow(1), phrase: tomorrow[0] };
  const dayAfterTomorrow = lower.match(/모레(?:까지)?/);
  if (dayAfterTomorrow) return { iso: isoForDaysFromNow(2), phrase: dayAfterTomorrow[0] };
  const today = lower.match(/오늘(?:까지)?/);
  if (today) return { iso: isoForDaysFromNow(0), phrase: today[0] };
  const yesterday = lower.match(/어제(?:까지)?/);
  if (yesterday) return { iso: isoForDaysFromNow(-1), phrase: yesterday[0] };

  if (/(\b|^)다음주(\b|$)|\b내주\b/.test(lower)) return { iso: isoForDaysFromNow(7), phrase: "다음주" };
  if (/이번주(까지)?/.test(lower)) return { iso: endOfCurrentWeekIso(), phrase: "이번주" };
  if (/이번달(까지)?|이번\s*월(까지)?/.test(lower)) return { iso: endOfCurrentMonthIso(), phrase: "이번달" };

  const monthDayUntil = lower.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:까지)?/);
  if (monthDayUntil) {
    return {
      iso: dateForMonthDay(Number(monthDayUntil[1]), Number(monthDayUntil[2])),
      phrase: monthDayUntil[0].trim(),
    };
  }

  const currentMonthDayUntil = lower.match(/(\d{1,2})\s*일\s*까지/);
  if (currentMonthDayUntil) {
    return {
      iso: dateForCurrentMonthDay(Number(currentMonthDayUntil[1])),
      phrase: currentMonthDayUntil[0].trim(),
    };
  }

  // patterns like '이번주 금요일', '다음 화요일', '금요일'
  const weekdayRegex = new RegExp(`(이번주|다음주|다음|이번)?\s*([일월화수목금토])요일`);
  const weekdayMatch = lower.match(weekdayRegex);
  if (weekdayMatch) {
    const prefix = weekdayMatch[1] || "";
    const w = weekdayMatch[2];
    const target = weekdayMap[w];
    if (prefix.includes("다음") || prefix === "다음주") return { iso: nextWeekdayIso(target, 1), phrase: `${prefix}${w}요일` };
    // default: this/next upcoming
    return { iso: nextWeekdayIso(target, 0), phrase: `${prefix}${w}요일` };
  }

  // bare weekday like '금요일'
  const bareWeekday = lower.match(/\b([일월화수목금토])요일\b/);
  if (bareWeekday) {
    const w = bareWeekday[1];
    const target = weekdayMap[w];
    return { iso: nextWeekdayIso(target, 0), phrase: `${w}요일` };
  }

  // '다음달 3일', '이번달 15일'
  const nextMonthDay = lower.match(/다음달\s*(\d{1,2})\s*일/);
  if (nextMonthDay) {
    const day = Math.min(31, Number(nextMonthDay[1]));
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1, day);
    // if day overflowed to next month JS handles it, clamp to last day
    if (d.getMonth() !== (new Date(now).getMonth() + 1) % 12) d.setMonth(d.getMonth() + 1, 0);
    return { iso: toIso(d), phrase: `다음달 ${day}일` };
  }
  const thisMonthDay = lower.match(/이번달\s*(\d{1,2})\s*일|이번\s*달\s*(\d{1,2})\s*일/);
  if (thisMonthDay) {
    const num = thisMonthDay[1] ?? thisMonthDay[2];
    const day = Math.min(31, Number(num));
    const d = new Date(now);
    d.setDate(day);
    // if requested day already passed, choose next month's day
    if (d.getTime() < now.getTime()) {
      d.setMonth(d.getMonth() + 1, day);
    }
    return { iso: toIso(d), phrase: `이번달 ${day}일` };
  }

  // simple numeric day-of-month like '15일' -> this month or next if passed
  const plainDay = lower.match(/\b(\d{1,2})\s*일\b/);
  if (plainDay) {
    const day = Math.min(31, Number(plainDay[1]));
    const d = new Date(now);
    d.setDate(day);
    if (d.getTime() < now.getTime()) d.setMonth(d.getMonth() + 1, day);
    return { iso: toIso(d), phrase: `${day}일` };
  }

  // '언제까지' style queries -> no date
  if (/언제까지|언제\s*까지/.test(lower)) return null;

  return null;
}
