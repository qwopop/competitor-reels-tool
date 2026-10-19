// Two or more mutually exclusive views, shown as a segmented control.
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
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-surface-2 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              'rounded-full px-4 py-1.5 text-sm transition-colors duration-200',
              active ? 'bg-white/10 text-ink' : 'text-ink/60 hover:text-ink',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
