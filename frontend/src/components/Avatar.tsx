import { useState } from 'react';
import { sizedAvatarUrl } from '@/utils/youtube';

// A channel's round avatar. Loads a small copy (Google serves 900px by default),
// sends no referrer (Google's image hosts can refuse requests that carry one),
// and falls back to the channel's initial if the image still fails.
export function Avatar({
  url,
  name,
  size,
  className = '',
}: {
  url: string;
  name: string;
  size: number; // shown size in CSS pixels
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = `shrink-0 rounded-full ${className}`;
  const style = { width: size, height: size };
  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ ...style, fontSize: size * 0.4 }}
        className={`${box} inline-flex items-center justify-center bg-brand font-semibold text-ground`}
      >
        {(name.replace(/^@/, '')[0] ?? '?').toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={sizedAvatarUrl(url, size * 2)}
      alt=""
      width={size}
      height={size}
      style={style}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${box} bg-surface-2 object-cover`}
    />
  );
}
