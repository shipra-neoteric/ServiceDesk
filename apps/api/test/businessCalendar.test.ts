import { describe, expect, it } from 'vitest';
import { addBusinessHours, businessHoursBetween } from '../src/lib/businessCalendar.js';

describe('businessCalendar', () => {
  it('adds business hours within the same working day', () => {
    const start = new Date('2026-09-15T10:00:00Z'); // Tuesday
    const due = addBusinessHours(start, 4);
    expect(due.toISOString()).toBe('2026-09-15T14:00:00.000Z');
  });

  it('rolls over to the next working day when hours exceed the business window', () => {
    const start = new Date('2026-09-15T17:00:00Z'); // Tuesday, 2h left in the day (ends 19:00)
    const due = addBusinessHours(start, 6);
    // 2h today + 4h tomorrow starting 09:00 -> 13:00 next day
    expect(due.toISOString()).toBe('2026-09-16T13:00:00.000Z');
  });

  it('skips Sunday (non-working day)', () => {
    const start = new Date('2026-09-19T18:00:00Z'); // Saturday, 1h left before 19:00
    const due = addBusinessHours(start, 2);
    // 1h Saturday + 1h Monday from 09:00 (Sunday skipped) -> 10:00 Monday
    expect(due.toISOString()).toBe('2026-09-21T10:00:00.000Z');
  });

  it('computes zero delay when end is before start', () => {
    expect(businessHoursBetween(new Date('2026-09-15T12:00:00Z'), new Date('2026-09-15T10:00:00Z'))).toBe(0);
  });

  it('excludes a holiday from the elapsed count', () => {
    const start = new Date('2026-10-01T09:00:00Z'); // Thursday
    const end = new Date('2026-10-03T09:00:00Z'); // Saturday, Oct 2 is a holiday
    const hours = businessHoursBetween(start, end, ['2026-10-02']);
    // Oct 1: 09:00-19:00 = 10h, Oct 2 excluded, Oct 3: 0h (ends exactly at 09:00)
    expect(hours).toBe(10);
  });
});
