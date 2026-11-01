import { ArrowUpRight } from 'lucide-react';
import { channelLabel, channelVideosUrl, isVideoLink, refLabel, refOpenUrl, type ChannelRef } from '@/utils/youtube';

const LINK_CLASS = 'text-sm text-ink/60 underline-offset-4 transition-colors hover:text-ink hover:underline';

function External({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

// Opens a channel's Videos tab on YouTube in a new tab.
export function ChannelVideosLink({
  username,
  className = LINK_CLASS,
  children,
}: {
  username: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <External href={channelVideosUrl(username)} className={className}>
      {children ?? <>Open {channelLabel(username)} on YouTube</>}
    </External>
  );
}

// Opens the video itself on YouTube. Sample videos have no real page, so they
// fall back to the channel's Videos tab.
export function WatchOnYouTubeLink({
  permalink,
  username,
  className = LINK_CLASS,
}: {
  permalink: string;
  username: string;
  className?: string;
}) {
  if (!isVideoLink(permalink)) return <ChannelVideosLink username={username} className={className} />;
  return (
    <External href={permalink} className={className}>
      Watch on YouTube
    </External>
  );
}

// For what the user is typing: the channel's Videos tab, or the video for a video link.
export function ChannelRefLink({
  channelRef,
  className = LINK_CLASS,
  children,
}: {
  channelRef: ChannelRef;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <External href={refOpenUrl(channelRef)} className={className}>
      {children ??
        (channelRef.kind === 'video' ? <>Open this video on YouTube</> : <>Open {refLabel(channelRef)} on YouTube</>)}
    </External>
  );
}
