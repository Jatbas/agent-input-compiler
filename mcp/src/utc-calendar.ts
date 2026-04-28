// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export function pad2Utc(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

export function daysInMonthUtc(year: number, month1to12: number): number {
  if (month1to12 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if (month1to12 === 4 || month1to12 === 6 || month1to12 === 9 || month1to12 === 11) {
    return 30;
  }
  return 31;
}

type UtcCalendarDayParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

function parseUtcCalendarDay(day: string): UtcCalendarDayParts | null {
  const segs = day.split("-");
  const year = Number(segs[0]);
  const month = Number(segs[1]);
  const parsedDay = Number(segs[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(parsedDay)) {
    return null;
  }
  return { year, month, day: parsedDay };
}

export function incrementUtcCalendarDay(day: string): string {
  const parsed = parseUtcCalendarDay(day);
  if (parsed === null) {
    return day;
  }
  const dim = daysInMonthUtc(parsed.year, parsed.month);
  if (parsed.day < dim) {
    return `${String(parsed.year)}-${pad2Utc(parsed.month)}-${pad2Utc(parsed.day + 1)}`;
  }
  if (parsed.month < 12) {
    return `${String(parsed.year)}-${pad2Utc(parsed.month + 1)}-01`;
  }
  return `${String(parsed.year + 1)}-01-01`;
}

export function decrementUtcCalendarDay(day: string): string {
  const parsed = parseUtcCalendarDay(day);
  if (parsed === null) {
    return day;
  }
  if (parsed.day > 1) {
    return `${String(parsed.year)}-${pad2Utc(parsed.month)}-${pad2Utc(parsed.day - 1)}`;
  }
  if (parsed.month > 1) {
    const prevMo = parsed.month - 1;
    return `${String(parsed.year)}-${pad2Utc(prevMo)}-${pad2Utc(daysInMonthUtc(parsed.year, prevMo))}`;
  }
  return `${String(parsed.year - 1)}-12-31`;
}

export function enumerateUtcDaysInclusive(
  startDay: string,
  endDay: string,
): readonly string[] {
  if (startDay > endDay) return [];
  const step = (current: string): readonly string[] =>
    current === endDay ? [current] : [current, ...step(incrementUtcCalendarDay(current))];
  return step(startDay);
}
