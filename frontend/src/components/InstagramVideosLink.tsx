import { ArrowUpRight } from 'lucide-react';
import { instagramVideosUrl, isPostLink } from '@/utils/instagram';

const LINK_CLASS = 'text-sm text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline';

// Opens a profile's Videos tab on Instagram in a new tab.
export function InstagramVideosLink({
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
      href={instagramVideosUrl(username)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {children ?? <>View @{username}&rsquo;s Videos on Instagram</>}
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}


// Opens the Video itself on Instagram. Sample Videos have no real post, so they
// fall back to the profile's Videos tab.
export function VideoOnInstagramLink({
  permalink,
  username,
  className = LINK_CLASS,
}: {
  permalink: string;
  username: string;
  className?: string;
}) {
  if (!isPostLink(permalink)) return <InstagramVideosLink username={username} className={className} />;
  return (
    <a
      href={permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 ${className}`}
    >
      Watch this Video on Instagram
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
