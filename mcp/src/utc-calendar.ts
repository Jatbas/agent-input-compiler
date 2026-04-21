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

export function incrementUtcCalendarDay(day: string): string {
  const segs = day.split("-");
  const y = Number(segs[0]);
  const mo = Number(segs[1]);
  const d = Number(segs[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return day;
  }
  const dim = daysInMonthUtc(y, mo);
  if (d < dim) {
    return `${String(y)}-${pad2Utc(mo)}-${pad2Utc(d + 1)}`;
  }
  if (mo < 12) {
    return `${String(y)}-${pad2Utc(mo + 1)}-01`;
  }
  return `${String(y + 1)}-01-01`;
}

export function decrementUtcCalendarDay(day: string): string {
  const segs = day.split("-");
  const y = Number(segs[0]);
  const mo = Number(segs[1]);
  const d = Number(segs[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return day;
  }
  if (d > 1) {
    return `${String(y)}-${pad2Utc(mo)}-${pad2Utc(d - 1)}`;
  }
  if (mo > 1) {
    const prevMo = mo - 1;
    return `${String(y)}-${pad2Utc(prevMo)}-${pad2Utc(daysInMonthUtc(y, prevMo))}`;
  }
  return `${String(y - 1)}-12-31`;
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
