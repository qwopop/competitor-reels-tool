import { compactNumber } from '@/utils/format';

export interface MarqueeItem {
  id: string;
  username: string;
  avatarUrl: string;
  views: number;
}

// A slow, endlessly scrolling row of tracked competitors. Pauses on hover.
export function CompetitorMarquee({ items }: { items: MarqueeItem[] }) {
  if (items.length === 0) return null;
  // Repeat short lists so the loop never shows a gap, then double it for the seamless wrap.
  const base = Array.from({ length: Math.ceil(8 / items.length) }).flatMap(() => items);
  const loop = [...base, ...base];
  return (
    <div className="mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
      <ul className="marquee flex w-max animate-marquee">
        {loop.map((item, i) => (
          <li
            key={`${item.id}-${i}`}
            aria-hidden={i >= base.length}
            className="flex w-40 shrink-0 flex-col items-center gap-2 text-center"
          >
            <img src={item.avatarUrl} alt="" className="h-16 w-16 rounded-full bg-surface-2 object-cover" />
            <span className="text-sm font-medium text-ink">{item.username}</span>
            <span className="text-xs tabular-nums text-ink/50">{compactNumber(item.views)} views</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
