import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, milestonesFor, nextOccurrence } from '../src/utils/dates';

describe('date helpers', () => {
  it('counts days without timezone drift', () => {
    expect(daysBetween('2023-05-12', '2026-10-10')).toBe(1247);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // leap year
  });

  it('clamps month arithmetic to the end of the month', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('finds the next occurrence of recurring dates', () => {
    expect(nextOccurrence('2023-05-12', 'yearly', '2026-10-07')).toBe('2027-05-12');
    expect(nextOccurrence('2023-05-12', 'yearly', '2026-05-12')).toBe('2026-05-12');
    expect(nextOccurrence('2026-10-01', 'weekly', '2026-10-07')).toBe('2026-10-08');
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-02-10')).toBe('2026-02-28');
    expect(nextOccurrence('2020-01-01', 'none', '2026-01-01')).toBeNull();
    expect(nextOccurrence('2030-01-01', 'none', '2026-01-01')).toBe('2030-01-01');
  });

  it('builds day-count and yearly milestones', () => {
    const list = milestonesFor('2023-05-12');
    expect(list.find((m) => m.key === 'd100')!.date).toBe('2023-08-20');
    expect(list.find((m) => m.key === 'd1000')!.date).toBe('2026-02-05');
    expect(list.find((m) => m.key === 'y3')!.date).toBe('2026-05-12');
  });
});
