import { useId } from 'react';

// The ClipRemix mark: a film strip with a remix arrow on the brand gradient.
// Same drawing as public/favicon.svg. Gradient ids are made unique per use.
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const bg = `logo-bg-${id}`;
  const arrow = `logo-arrow-${id}`;
  const holes = [18.5, 25.5, 32.5, 39.5];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb428" />
          <stop offset="0.5" stopColor="#ff5f6a" />
          <stop offset="1" stopColor="#ea1a82" />
        </linearGradient>
        <linearGradient id={arrow} x1="22" y1="22" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff8f4a" />
          <stop offset="1" stopColor="#ff4d83" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${bg})`} />
      <rect x="10" y="15" width="44" height="34" rx="5.5" fill="#0b0b10" />
      <g fill={`url(#${bg})`}>
        {holes.map((y) => (
          <rect key={`l${y}`} x="13" y={y} width="4.5" height="4" rx="1" />
        ))}
        {holes.map((y) => (
          <rect key={`r${y}`} x="46.5" y={y} width="4.5" height="4" rx="1" />
        ))}
      </g>
      <g
        transform="translate(19 19) scale(1.083)"
        fill="none"
        stroke={`url(#${arrow})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </g>
    </svg>
  );
}
