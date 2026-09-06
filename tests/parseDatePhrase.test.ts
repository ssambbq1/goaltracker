import parseKoreanDatePhrase, { removeParsedDatePhrase } from '../lib/parseDatePhrase';
import { describe, it, expect } from 'vitest';

function toIso(d: Date) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextWeekdayIsoFrom(now: Date, targetWeekday: number, weeksOffset = 0) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const today = d.getDay();
  let delta = targetWeekday - today + weeksOffset * 7;
  if (delta < 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return toIso(d);
}

describe('parseKoreanDatePhrase', () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  it('parses 내일', () => {
    const expected = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const res = parseKoreanDatePhrase('내일');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('parses 모레', () => {
    const expected = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
    const res = parseKoreanDatePhrase('모레');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('parses 3일 후', () => {
    const expected = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3));
    const res = parseKoreanDatePhrase('3일 후');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('parses 3일뒤까지', () => {
    const expected = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3));
    const res = parseKoreanDatePhrase('문서 정리 3일뒤까지');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
    expect(res!.phrase).toBe('3일뒤까지');
  });

  it('keeps until suffix in detected stickers', () => {
    const expected = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const res = parseKoreanDatePhrase('운동 내일까지');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
    expect(res!.phrase).toBe('내일까지');
  });

  it('parses month and day until phrases', () => {
    const target = new Date(now.getFullYear(), 10, 7);
    if (target.getTime() < now.getTime()) target.setFullYear(target.getFullYear() + 1);
    const res = parseKoreanDatePhrase('보고서 11월 7일까지');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(toIso(target));
    expect(res!.phrase).toBe('11월 7일까지');
  });

  it('parses day-only until phrases as current month', () => {
    const target = new Date(now.getFullYear(), now.getMonth(), 7);
    const res = parseKoreanDatePhrase('보고서 7일까지');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(toIso(target));
    expect(res!.phrase).toBe('7일까지');
  });

  it('removes detected date phrases from saved titles', () => {
    const parsed = parseKoreanDatePhrase('문서 정리 3일 뒤까지');
    expect(removeParsedDatePhrase('문서 정리 3일 뒤까지', parsed)).toBe('문서 정리');
  });

  it('parses 2주 후', () => {
    const expected = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
    const res = parseKoreanDatePhrase('2주 후');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('parses 금요일 as next occurrence', () => {
    // 금: 5 (Sun=0)
    const expected = nextWeekdayIsoFrom(now, 5);
    const res = parseKoreanDatePhrase('금요일');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('parses 이번주 화요일', () => {
    // 화:2
    const expected = nextWeekdayIsoFrom(now, 2);
    const res = parseKoreanDatePhrase('이번주 화요일');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('parses 다음달 3일', () => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1, 3);
    const expected = toIso(d);
    const res = parseKoreanDatePhrase('다음달 3일');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('parses plain day 15일', () => {
    const d = new Date(now);
    d.setDate(15);
    if (d.getTime() < now.getTime()) d.setMonth(d.getMonth() + 1, 15);
    const expected = toIso(d);
    const res = parseKoreanDatePhrase('15일');
    expect(res).not.toBeNull();
    expect(res!.iso).toBe(expected);
  });

  it('returns null for vague queries', () => {
    const res = parseKoreanDatePhrase('언제까지');
    expect(res).toBeNull();
  });
});
