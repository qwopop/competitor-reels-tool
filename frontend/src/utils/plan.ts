import type { PlanStatus } from '@/types';

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
