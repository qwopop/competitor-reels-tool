import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clapperboard, Send, X } from 'lucide-react';
import type { ContentPlanItem, PlanItemChanges } from '@/types';
import { checklistDone, CHECKLIST, isoDay, planStatusMeta, shortDay } from '@/utils/plan';
import { channelLabel } from '@/utils/youtube';
import { ChecklistBar, PlanDates, ProductionChecklist } from '@/components/PlanSchedule';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Kind = 'film' | 'publish';
interface Entry {
  item: ContentPlanItem;
  kind: Kind;
}

// The days of the weeks that cover `month`, Monday first.
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Date[] = [];
  for (const d = new Date(start); d <= last || days.length % 7 !== 0; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

// A month calendar of when each planned video is filmed and published.
// Click an entry to change its dates and checklist; unscheduled videos are listed below.
export function PlanCalendar({
  items,
  onChange,
}: {
  items: ContentPlanItem[];
  onChange: (item: ContentPlanItem, changes: PlanItemChanges) => void;
}) {
  const today = isoDay(new Date());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const item of items) {
      if (item.filmDate) (map[item.filmDate] ??= []).push({ item, kind: 'film' });
      if (item.publishDate) (map[item.publishDate] ??= []).push({ item, kind: 'publish' });
    }
    return map;
  }, [items]);

  const days = monthGrid(month);
  const unscheduled = items.filter((item) => !item.filmDate && !item.publishDate);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const shift = (by: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{monthLabel}</h2>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-accent/70 bg-surface-3" /> Film
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Publish
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} className="btn-outline px-3 py-2" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            className="btn-outline px-4 py-2"
          >
            <CalendarDays size={15} /> Today
          </button>
          <button type="button" onClick={() => shift(1)} className="btn-outline px-3 py-2" aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/5 bg-surface">
        <div role="grid" aria-label={`Content calendar, ${monthLabel}`} className="min-w-[52rem]">
          <div role="row" className="grid grid-cols-7 border-b border-white/5">
            {WEEKDAYS.map((d) => (
              <div key={d} role="columnheader" className="px-3 py-3 text-center text-xs font-medium text-ink/60">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((date) => {
              const day = isoDay(date);
              const inMonth = date.getMonth() === month.getMonth();
              const entries = byDay[day] ?? [];
              return (
                <div
                  key={day}
                  role="gridcell"
                  aria-label={shortDay(day)}
                  className={[
                    'min-h-[8.5rem] border-b border-r border-white/5 p-2 [&:nth-child(7n)]:border-r-0',
                    inMonth ? '' : 'bg-ground/40',
                    day === today ? 'bg-accent/[0.06]' : '',
                  ].join(' ')}
                >
                  <p
                    className={[
                      'mb-1.5 text-sm tabular-nums',
                      day === today ? 'font-semibold text-accent' : inMonth ? 'text-ink/80' : 'text-ink/30',
                    ].join(' ')}
                  >
                    {date.getDate()}
                  </p>
                  <ul className="space-y-1.5">
                    {entries.map(({ item, kind }) => (
                      <li key={`${item.id}-${kind}`}>
                        <CalendarEntry
                          item={item}
                          kind={kind}
                          selected={item.id === selectedId}
                          onSelect={() => setSelectedId(item.id === selectedId ? null : item.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <section aria-label="Selected video" className="mt-6 rounded-3xl bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-ink/60">
                {channelLabel(selected.competitorUsername)} · <span aria-hidden="true">{planStatusMeta(selected.status).emoji}</span>{' '}
                {planStatusMeta(selected.status).label}
              </p>
              <h3 className="mt-1 text-lg font-medium leading-snug text-ink">{selected.caption}</h3>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} className="btn-ghost px-2.5 py-2" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <PlanDates item={selected} onChange={(c) => onChange(selected, c)} />
            <ProductionChecklist item={selected} onChange={(c) => onChange(selected, c)} />
          </div>
        </section>
      )}

      <section aria-labelledby="unscheduled" className="mt-8">
        <h3 id="unscheduled" className="text-base font-medium text-ink">
          Not scheduled yet <span className="tabular-nums text-ink/60">{unscheduled.length}</span>
        </h3>
        {unscheduled.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">Every planned video has a date.</p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {unscheduled.map((item) => (
              <li key={item.id} className="rounded-2xl bg-surface p-4">
                <p className="text-xs text-ink/60">{channelLabel(item.competitorUsername)}</p>
                <p className="mb-3 mt-1 line-clamp-2 text-sm font-medium text-ink">{item.caption}</p>
                <PlanDates item={item} onChange={(c) => onChange(item, c)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CalendarEntry({
  item,
  kind,
  selected,
  onSelect,
}: {
  item: ContentPlanItem;
  kind: Kind;
  selected: boolean;
  onSelect: () => void;
}) {
  const film = kind === 'film';
  const done = checklistDone(item);
  const Icon = film ? Clapperboard : Send;
  const label = film ? 'Film' : 'Publish';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${label}: ${item.caption}. Checklist ${done} of ${CHECKLIST.length}.`}
      title={item.caption}
      className={[
        'w-full rounded-xl px-2 py-1.5 text-left text-xs transition-[filter,box-shadow] duration-200 hover:brightness-110',
        film ? 'border border-accent/40 bg-surface-3 text-ink' : 'bg-brand text-ground',
        selected ? 'ring-2 ring-ink/80' : '',
      ].join(' ')}
    >
      <span className={`flex items-center gap-1 font-semibold ${film ? 'text-accent' : ''}`}>
        <Icon size={11} aria-hidden="true" /> {label}
        <span className="ml-auto tabular-nums font-normal opacity-70">
          {done}/{CHECKLIST.length}
        </span>
      </span>
      <span className="mt-0.5 line-clamp-2 leading-snug">{item.caption}</span>
      <ChecklistBar done={done} className={`mt-1.5 ${film ? '' : '!bg-ground/20 [&>div]:!bg-ground/70'}`} />
    </button>
  );
}
