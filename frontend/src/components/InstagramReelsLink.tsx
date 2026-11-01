import { ArrowUpRight } from 'lucide-react';
import { instagramReelsUrl } from '@/utils/instagram';

// Opens a profile's Reels tab on Instagram in a new tab.
export function InstagramReelsLink({
  username,
  className = 'text-sm text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline',
  children,
}: {
  username: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={instagramReelsUrl(username)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {children ?? <>View @{username}&rsquo;s Reels on Instagram</>}
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
