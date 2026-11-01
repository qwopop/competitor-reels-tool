import { PILL_LABEL_TRANSITION, useSlidingPill } from '@/components/SlidingPill';

// Two or more mutually exclusive views, shown as a segmented control whose
// highlight slides to the chosen option.
export function ViewToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { containerRef, pill } = useSlidingPill<HTMLDivElement>('[aria-pressed="true"]', value);
  return (
    <div ref={containerRef} role="group" aria-label={label} className="relative inline-flex rounded-full bg-surface-2 p-1">
      {pill}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              'rounded-full px-4 py-1.5 text-sm',
              PILL_LABEL_TRANSITION,
              active ? 'text-ink' : 'text-ink/60 hover:text-ink',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
