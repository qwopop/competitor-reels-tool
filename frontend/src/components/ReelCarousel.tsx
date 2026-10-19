import type { Reel } from '@/types';
import { countLabel } from '@/utils/format';

// A fan of Reel cards in 3D, tilted away from the centre, with a soft reflection.
export function ReelCarousel({ reels }: { reels: Reel[] }) {
  const center = (reels.length - 1) / 2;
  return (
    <div className="relative mx-auto mt-16 h-[26rem] overflow-hidden [perspective:1400px]" aria-label="Top Reels">
      <ul className="relative h-full">
        {reels.map((reel, i) => {
          const offset = i - center;
          const distance = Math.abs(offset);
          return (
            <li
              key={reel.id}
              className="absolute left-1/2 top-4 w-44 sm:w-52"
              style={{
                transform: `translateX(calc(-50% + ${offset * 11}rem)) translateZ(${-distance * 70}px) rotateY(${-offset * 14}deg) scale(${1 - distance * 0.05})`,
                zIndex: 10 - Math.round(distance),
                opacity: 1 - distance * 0.1,
              }}
            >
              <figure
                className="overflow-hidden rounded-3xl bg-surface-2"
                style={{ WebkitBoxReflect: 'below 8px linear-gradient(transparent 62%, rgba(0,0,0,0.35))' }}
              >
                <img src={reel.thumbnailUrl} alt={reel.caption} className="aspect-[3/4] w-full object-cover" />
                <figcaption className="px-4 py-3 text-xs text-ink/70">
                  @{reel.competitorUsername} · {countLabel(reel.viewCount, 'view')}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
