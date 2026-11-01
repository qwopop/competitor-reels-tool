// YouTube link parsing and building, shared by the pages and the mock API.
// Mirrors parse_channel_input in backend/app/youtube.py.

export type ChannelRefKind = 'id' | 'handle' | 'c' | 'user' | 'video';
export interface ChannelRef {
  kind: ChannelRefKind;
  value: string;
}

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
// Handles are 3-30 characters: letters, digits, underscores, hyphens and periods.
const HANDLE_RE = /^[A-Za-z0-9._-]{3,30}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOST_RE = /^(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be)$/i;
const LEGACY_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

function handleRef(name: string): ChannelRef | null {
  return HANDLE_RE.test(name) ? { kind: 'handle', value: name.toLowerCase() } : null;
}

// Recognises a channel link, @handle, channel ID or video link. Null if it is none of these.
export function parseChannelInput(input: string): ChannelRef | null {
  const text = input.trim();
  if (!text) return null;
  if (CHANNEL_ID_RE.test(text)) return { kind: 'id', value: text };
  if (text.startsWith('@')) return handleRef(text.slice(1));
  if (!text.includes('/') && !text.includes('.')) return handleRef(text);

  let url: URL;
  try {
    url = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !YOUTUBE_HOST_RE.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    return parts[0] && VIDEO_ID_RE.test(parts[0]) ? { kind: 'video', value: parts[0] } : null;
  }
  const [first, second] = parts;
  if (!first) return null;
  if (first.startsWith('@')) return handleRef(first.slice(1));
  if (first === 'channel' && second && CHANNEL_ID_RE.test(second)) return { kind: 'id', value: second };
  if ((first === 'c' || first === 'user') && second && LEGACY_NAME_RE.test(second)) {
    return { kind: first, value: second };
  }
  if (first === 'watch') {
    const v = url.searchParams.get('v') ?? '';
    return VIDEO_ID_RE.test(v) ? { kind: 'video', value: v } : null;
  }
  if (['shorts', 'live', 'embed'].includes(first) && second && VIDEO_ID_RE.test(second)) {
    return { kind: 'video', value: second };
  }
  return null;
}

// "@mkbhd", or the channel ID when there is no handle.
export function refLabel(ref: ChannelRef): string {
  return ref.kind === 'handle' ? `@${ref.value}` : ref.value;
}

// The channel's home page for a parsed reference. Video references have no channel link offline.
export function channelUrlForRef(ref: ChannelRef): string | null {
  switch (ref.kind) {
    case 'handle':
      return `https://www.youtube.com/@${ref.value}`;
    case 'id':
      return `https://www.youtube.com/channel/${ref.value}`;
    case 'c':
    case 'user':
      return `https://www.youtube.com/${ref.kind}/${ref.value}`;
    default:
      return null;
  }
}

// A competitor's username is its handle, or its channel ID when it has none.
export function channelUrlFor(username: string): string {
  return CHANNEL_ID_RE.test(username)
    ? `https://www.youtube.com/channel/${username}`
    : `https://www.youtube.com/@${encodeURIComponent(username.toLowerCase())}`;
}

export function channelVideosUrl(username: string): string {
  return `${channelUrlFor(username)}/videos`;
}

// "@mkbhd", or the channel ID (no @) when the channel has no handle.
export function channelLabel(username: string): string {
  return CHANNEL_ID_RE.test(username) ? username : `@${username}`;
}

// True when the link opens one specific video, not just a channel. Sample videos only have the channel link.
export function isVideoLink(permalink: string): boolean {
  return /^https?:\/\/(?:[a-z0-9-]+\.)*(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/i.test(
    permalink
  );
}

// Where a parsed input should open: the channel's Videos tab, or the video itself for a video link.
export function refOpenUrl(ref: ChannelRef): string {
  const channel = channelUrlForRef(ref);
  return channel ? `${channel}/videos` : `https://www.youtube.com/watch?v=${ref.value}`;
}

// YouTube avatars come from Google's image hosts at 900px (…=s900-c-k-…).
// Ask for the size actually shown instead; other URLs are returned unchanged.
export function sizedAvatarUrl(url: string, px: number): string {
  try {
    const host = new URL(url).hostname;
    if (!/(?:^|\.)(?:googleusercontent\.com|ggpht\.com)$/.test(host)) return url;
  } catch {
    return url;
  }
  return url.replace(/=s\d+(?=-|$)/, `=s${px}`).replace(/\/s\d+(-[a-z0-9-]*)?\//i, `/s${px}$1/`);
}
