// Small formatting helpers shared across pages.

export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < day) return 'today';
  const days = Math.floor(diff / day);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// "1 competitor", "2 competitors". Pass the singular word; add a plural form for irregular words.
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// "1 view", "12.3K views". Uses the compact number, but still says "view" for exactly one.
export function countLabel(count: number, singular: string): string {
  return `${compactNumber(count)} ${count === 1 ? singular : `${singular}s`}`;
}

// "710.7K views · 61K likes · 1 comment"
export function reelStats(reel: { viewCount: number; likeCount: number; commentCount: number }): string {
  return [
    countLabel(reel.viewCount, 'view'),
    countLabel(reel.likeCount, 'like'),
    countLabel(reel.commentCount, 'comment'),
  ].join(' · ');
}
