import { Clapperboard, Send } from 'lucide-react';
import type { ContentPlanItem, PlanItemChanges } from '@/types';
import { CHECKLIST, checklistDone } from '@/utils/plan';

// Film and publish dates for one plan item. Clearing a field unschedules it.
export function PlanDates({
  item,
  onChange,
  compact = false,
}: {
  item: ContentPlanItem;
  onChange: (changes: PlanItemChanges) => void;
  compact?: boolean;
}) {
  const fields = [
    { key: 'filmDate' as const, label: 'Film', Icon: Clapperboard, value: item.filmDate },
    { key: 'publishDate' as const, label: 'Publish', Icon: Send, value: item.publishDate },
  ];
  const backwards = item.filmDate && item.publishDate && item.publishDate < item.filmDate;
  return (
    <div>
      <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
        {fields.map(({ key, label, Icon, value }) => (
          <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-ink/60">
            <span className="inline-flex items-center gap-1.5">
              <Icon size={12} aria-hidden="true" /> {label}
            </span>
            <input
              type="date"
              value={value ?? ''}
              aria-label={`${label} date for ${item.caption}`}
              onChange={(e) => onChange({ [key]: e.target.value || null })}
              className="w-full min-w-0 rounded-xl border border-white/10 bg-surface-3 px-2.5 py-1.5 text-xs text-ink outline-none transition-colors focus:border-accent/60"
            />
          </label>
        ))}
      </div>
      {backwards && <p className="mt-1.5 text-xs text-danger">Publishing is set before filming.</p>}
    </div>
  );
}

// The four production steps, with a progress bar.
export function ProductionChecklist({
  item,
  onChange,
}: {
  item: ContentPlanItem;
  onChange: (changes: PlanItemChanges) => void;
}) {
  const done = checklistDone(item);
  return (
    <fieldset>
      <legend className="flex w-full items-center justify-between text-xs text-ink/60">
        <span>Production checklist</span>
        <span className="tabular-nums">
          {done}/{CHECKLIST.length}
        </span>
      </legend>
      <ChecklistBar done={done} className="mt-2" />
      <ul className="mt-2.5 space-y-1.5">
        {CHECKLIST.map((step) => (
          <li key={step.key}>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
              <input
                type="checkbox"
                checked={item[step.key]}
                onChange={(e) => onChange({ [step.key]: e.target.checked })}
                className="h-4 w-4 cursor-pointer rounded accent-[#ff7f7f]"
              />
              <span className={item[step.key] ? 'text-ink/50 line-through decoration-ink/30' : ''}>{step.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function ChecklistBar({ done, className = '' }: { done: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`h-1.5 overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${(done / CHECKLIST.length) * 100}%` }}
      />
    </div>
  );
}
