import { useState } from 'react';
import { ArrowUpRight, Check, Copy, Play } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { channelUrlForRef, parseChannelInput, refLabel, type ChannelRef } from '@/utils/youtube';

// Turns a channel link, @handle or channel ID into direct links to that channel's
// Videos and Shorts. Works on its own: nothing is saved and the backend is not called.
export function VideosLinkPage() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ ref: ChannelRef; channel: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const videosLink = result ? `${result.channel}/videos` : null;

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setCopied(false);
    const ref = parseChannelInput(input);
    const channel = ref ? channelUrlForRef(ref) : null;
    if (!ref || !channel) {
      setResult(null);
      setError(
        !input.trim()
          ? 'Please enter a channel.'
          : ref?.kind === 'video'
            ? 'That is a video link. Paste the channel link or @handle instead.'
            : 'That is not a YouTube channel. Try @mkbhd or https://www.youtube.com/@mkbhd.'
      );
      return;
    }
    setError(null);
    setResult({ ref, channel });
  }

  async function handleCopy() {
    if (!videosLink) return;
    try {
      await navigator.clipboard.writeText(videosLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Go to"
        accent="videos"
        description="Enter a YouTube @handle or paste a channel link to get a direct link to that channel's videos."
      />

      <section className="max-w-xl rounded-3xl bg-surface p-6 sm:p-8">
        <form onSubmit={handleGenerate} noValidate>
          <label htmlFor="channel-input" className="label">YouTube channel</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="channel-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="mkbhd, @mkbhd or a channel link"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="input flex-1"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'channel-input-error' : undefined}
            />
            <button type="submit" className="btn-primary whitespace-nowrap">
              Generate link
            </button>
          </div>
          {error && (
            <p id="channel-input-error" role="alert" className="mt-3 text-sm text-danger">{error}</p>
          )}
        </form>

        {result && videosLink && (
          <div className="mt-8 border-t border-white/10 pt-6" aria-live="polite">
            <p className="text-sm text-ink/60">Click to go:</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                href={videosLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full justify-center sm:w-auto"
              >
                <Play size={15} aria-hidden="true" /> Watch videos {refLabel(result.ref)}
                <ArrowUpRight size={15} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <a
                href={`${result.channel}/shorts`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline w-full justify-center sm:w-auto"
              >
                Shorts
                <ArrowUpRight size={15} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink/80">{videosLink}</code>
              <button type="button" onClick={handleCopy} className="btn-outline px-3.5 py-2 text-sm">
                {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
