import type { ChecklistKey, ContentPlanItem, PlanStatus } from '@/types';

// Filming status for a plan item. The emoji is the at-a-glance signal; the
// label is what screen readers and the status control show.
export const PLAN_STATUSES: { value: PlanStatus; emoji: string; label: string }[] = [
  { value: 'not_started', emoji: '❌', label: 'Not started' }, // taste-skill-ignore: status emoji requested by the user
  { value: 'ready', emoji: '⏳', label: 'Ready to film' }, // taste-skill-ignore: status emoji requested by the user
  { value: 'filmed', emoji: '✅', label: 'Filmed' }, // taste-skill-ignore: status emoji requested by the user
];

export function planStatusMeta(status: PlanStatus) {
  return PLAN_STATUSES.find((s) => s.value === status) ?? PLAN_STATUSES[0];
}

// The production checklist every planned video gets, in the order the work happens.
export const CHECKLIST: { key: ChecklistKey; label: string }[] = [
  { key: 'scriptDone', label: 'Script completed' },
  { key: 'recordingDone', label: 'Recording completed' },
  { key: 'captionDone', label: 'Caption prepared' },
  { key: 'publishedDone', label: 'Published' },
];

export function checklistDone(item: ContentPlanItem): number {
  return CHECKLIST.filter((step) => item[step.key]).length;
}

// Local calendar dates as YYYY-MM-DD (what <input type="date"> uses), not UTC.
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Tue 10 Nov"
export function shortDay(day: string): string {
  return parseIsoDay(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
