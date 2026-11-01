import { ArrowUpRight } from 'lucide-react';
import { instagramReelsUrl, isPostLink } from '@/utils/instagram';

const LINK_CLASS = 'text-sm text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline';

// Opens a profile's Reels tab on Instagram in a new tab.
export function InstagramReelsLink({
  username,
  className = LINK_CLASS,
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


// Opens the Reel itself on Instagram. Sample Reels have no real post, so they
// fall back to the profile's Reels tab.
export function ReelOnInstagramLink({
  permalink,
  username,
  className = LINK_CLASS,
}: {
  permalink: string;
  username: string;
  className?: string;
}) {
  if (!isPostLink(permalink)) return <InstagramReelsLink username={username} className={className} />;
  return (
    <a
      href={permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 ${className}`}
    >
      Watch this Reel on Instagram
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
