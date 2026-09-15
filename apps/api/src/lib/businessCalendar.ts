// Business-hours calendar used by the SLA engine. See SLA_RULES.md "Calendar".
// Seed defaults: Mon-Sat working days, 09:00-19:00 business hours, Asia/Kolkata.
// Holidays are loaded by callers (from the Holiday table) and passed in as ISO date strings.

const WORKING_DAYS = new Set([1, 2, 3, 4, 5, 6]); // 0=Sun
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 19;
const HOURS_PER_DAY = BUSINESS_END_HOUR - BUSINESS_START_HOUR;

function isHoliday(date: Date, holidays: Set<string>) {
  return holidays.has(date.toISOString().slice(0, 10));
}

function isWorkingDay(date: Date, holidays: Set<string>) {
  return WORKING_DAYS.has(date.getUTCDay()) && !isHoliday(date, holidays);
}

/** Business hours elapsed between two instants, excluding weekends/holidays and non-business hours. */
export function businessHoursBetween(start: Date, end: Date, holidayDates: string[] = []): number {
  if (end <= start) return 0;
  const holidays = new Set(holidayDates);
  let cursor = new Date(start);
  let hours = 0;
  // Cap iteration for safety on pathological ranges.
  let guard = 0;
  while (cursor < end && guard < 3650) {
    guard += 1;
    if (!isWorkingDay(cursor, holidays)) {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, BUSINESS_START_HOUR, 0, 0));
      continue;
    }
    const dayStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), BUSINESS_START_HOUR, 0, 0));
    const dayEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), BUSINESS_END_HOUR, 0, 0));
    const windowStart = cursor > dayStart ? cursor : dayStart;
    const windowEnd = end < dayEnd ? end : dayEnd;
    if (windowEnd > windowStart) {
      hours += (windowEnd.getTime() - windowStart.getTime()) / 3_600_000;
    }
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, BUSINESS_START_HOUR, 0, 0));
  }
  return Math.round(hours * 100) / 100;
}

/** Add N business hours to a start instant, returning the resulting due instant. */
export function addBusinessHours(start: Date, hoursToAdd: number, holidayDates: string[] = []): Date {
  const holidays = new Set(holidayDates);
  let cursor = new Date(start);
  let remaining = hoursToAdd;
  let guard = 0;
  while (remaining > 0 && guard < 3650) {
    guard += 1;
    if (!isWorkingDay(cursor, holidays)) {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, BUSINESS_START_HOUR, 0, 0));
      continue;
    }
    const dayEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), BUSINESS_END_HOUR, 0, 0));
    const dayStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), BUSINESS_START_HOUR, 0, 0));
    const windowStart = cursor > dayStart ? cursor : dayStart;
    const availableHoursToday = (dayEnd.getTime() - windowStart.getTime()) / 3_600_000;
    if (availableHoursToday <= 0) {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, BUSINESS_START_HOUR, 0, 0));
      continue;
    }
    if (remaining <= availableHoursToday) {
      return new Date(windowStart.getTime() + remaining * 3_600_000);
    }
    remaining -= availableHoursToday;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, BUSINESS_START_HOUR, 0, 0));
  }
  return cursor;
}

export const HOURS_PER_BUSINESS_DAY = HOURS_PER_DAY;
