import type { Video } from '@/types';
import { countLabel } from '@/utils/format';
import { channelLabel } from '@/utils/youtube';

// A fan of video cards in 3D, tilted away from the centre, with a soft reflection.
export function VideoCarousel({ videos }: { videos: Video[] }) {
  const center = (videos.length - 1) / 2;
  return (
    <div className="relative mx-auto mt-16 h-[19rem] overflow-hidden [perspective:1400px]" aria-label="Top videos">
      <ul className="relative h-full">
        {videos.map((video, i) => {
          const offset = i - center;
          const distance = Math.abs(offset);
          return (
            <li
              key={video.id}
              className="absolute left-1/2 top-10 w-60 sm:w-72"
              style={{
                transform: `translateX(calc(-50% + ${offset * 14}rem)) translateZ(${-distance * 70}px) rotateY(${-offset * 14}deg) scale(${1 - distance * 0.05})`,
                zIndex: 10 - Math.round(distance),
                opacity: 1 - distance * 0.1,
              }}
            >
              <figure
                className="overflow-hidden rounded-3xl bg-surface-2"
                style={{ WebkitBoxReflect: 'below 8px linear-gradient(transparent 62%, rgba(0,0,0,0.35))' }}
              >
                <img src={video.thumbnailUrl} alt={video.caption} className="aspect-video w-full object-cover" />
                <figcaption className="px-4 py-3 text-xs text-ink/70">
                  {channelLabel(video.competitorUsername)}
                  {video.viewCount > 0 ? ` · ${countLabel(video.viewCount, 'view')}` : ''}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
