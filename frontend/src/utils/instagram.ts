// Instagram username parsing and link building, shared by the pages and the mock API.

// Same rules as backend/app/generator.py: 1-30 characters of letters, digits, . and _.
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_LINK_RE = /^(https?:\/\/)?([A-Za-z0-9-]+\.)*instagram\.com(\/|$|\?)/i;
// First path segments that are Instagram pages, not accounts.
const RESERVED_SEGMENTS = new Set([
  'p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct',
  'about', 'web', 'developer', 'legal', 'privacy', 'press', 'api', 'directory',
]);

// Returns the username from a profile link or a bare (optionally @-prefixed) name, or null.
export function parseUsername(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let name: string;
  if (INSTAGRAM_LINK_RE.test(text)) {
    let url: URL;
    try {
      url = new URL(text.includes('://') ? text : `https://${text}`);
    } catch {
      return null;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0 || RESERVED_SEGMENTS.has(parts[0].toLowerCase())) return null;
    name = parts[0];
  } else {
    name = text.startsWith('@') ? text.slice(1) : text;
  }
  return USERNAME_RE.test(name) ? name : null;
}

// The Reels tab of an Instagram profile, e.g. https://www.instagram.com/vibecoder/reels/
export function instagramReelsUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username.toLowerCase())}/reels/`;
}
