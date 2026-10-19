import type { ReactNode } from 'react';

// One italic serif phrase inside a bold sans headline.
export function Accent({ children }: { children: ReactNode }) {
  return <em className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em]">{children}</em>;
}

export function PageHeader({
  title,
  accent,
  description,
  actions,
}: {
  title: string;
  accent: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-12 flex flex-wrap items-end justify-between gap-8">
      <div>
        <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-ink sm:text-6xl">
          {title} <Accent>{accent}</Accent>
        </h1>
        {description && <p className="mt-5 max-w-lg text-base text-ink/70">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
