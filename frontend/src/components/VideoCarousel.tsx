import { useEffect, useRef } from 'react';
import type { Video } from '@/types';
import { countLabel } from '@/utils/format';
import { channelLabel } from '@/utils/youtube';

const SECONDS_PER_CARD = 3.5; // how long the fan takes to move one card along
const SPACING_REM = 14;

// Where a card sits in the fan for a given offset from the centre (0 = middle,
// negative = left). The fan look is unchanged; offsets just aren't whole numbers
// any more, so cards glide between the positions.
function cardStyle(offset: number, half: number) {
  const distance = Math.abs(offset);
  // Fade out over the last stretch before the edge, where a card loops round to the
  // other side, so the jump is never visible.
  const edge = half + 0.5;
  const fade = Math.min(1, Math.max(0, (edge - distance) / 0.5));
  return {
    transform: `translateX(calc(-50% + ${offset * SPACING_REM}rem)) translateZ(${-distance * 70}px) rotateY(${-offset * 14}deg) scale(${1 - distance * 0.05})`,
    zIndex: String(10 - Math.round(distance)),
    opacity: String(Math.max(0, 1 - distance * 0.1) * fade),
  };
}

// Offset of card i after the fan has moved t cards to the left, wrapped into
// [-n/2, n/2). At t = 0 the cards sit at -half … +half, the original fan.
function offsetAt(i: number, t: number, n: number) {
  const shifted = i - (n - 1) / 2 - t + n / 2;
  return (((shifted % n) + n) % n) - n / 2;
}

// A fan of video cards in 3D that slowly drifts sideways in a loop, with a soft
// reflection. Pauses on hover; stays still when the viewer prefers reduced motion.
export function VideoCarousel({ videos }: { videos: Video[] }) {
  const n = videos.length;
  const half = (n - 1) / 2;
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const paused = useRef(false);

  useEffect(() => {
    if (n < 2) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let t = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000); // cap the step after a background tab
      last = now;
      if (!paused.current) t += dt / SECONDS_PER_CARD;
      itemRefs.current.forEach((el, i) => {
        if (!el) return;
        Object.assign(el.style, cardStyle(offsetAt(i, t, n), half));
      });
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [n, half]);

  return (
    <div
      className="relative mx-auto mt-16 h-[19rem] overflow-hidden [perspective:1400px]"
      aria-label="Top videos"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <ul className="relative h-full">
        {videos.map((video, i) => (
          <li
            key={video.id}
            ref={(el) => (itemRefs.current[i] = el)}
            className="absolute left-1/2 top-10 w-60 will-change-transform sm:w-72"
            style={cardStyle(i - half, half)}
          >
            <figure
              className="overflow-hidden rounded-3xl bg-surface-2"
              style={{ WebkitBoxReflect: 'below 8px linear-gradient(transparent 62%, rgba(0,0,0,0.35))' }}
            >
              <img
                src={video.thumbnailUrl}
                referrerPolicy="no-referrer"
                decoding="async"
                alt={video.caption}
                className="aspect-video w-full object-cover"
              />
              <figcaption className="px-4 py-3 text-xs text-ink/70">
                {channelLabel(video.competitorUsername)}
                {video.viewCount > 0 ? ` · ${countLabel(video.viewCount, 'view')}` : ''}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { offsetAt };
