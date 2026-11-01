import { useState } from 'react';
import { ArrowUpRight, Check, Copy, Play } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { instagramReelsUrl, parseUsername } from '@/utils/instagram';

// Turns a username or profile link into a link to that account's Reels tab.
// Works on its own: nothing is saved and the backend is not called.
export function ReelsLinkPage() {
  const [input, setInput] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = username ? instagramReelsUrl(username) : null;

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setCopied(false);
    const name = parseUsername(input);
    if (!name) {
      setUsername(null);
      setError(
        input.trim()
          ? 'That is not a valid Instagram username. Use 1–30 letters, numbers, periods or underscores.'
          : 'Please enter a username.'
      );
      return;
    }
    setError(null);
    setUsername(name.toLowerCase());
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Go to"
        accent="Reels"
        description="Enter an Instagram username or paste a profile link to get a direct link to that account's Reels."
      />

      <section className="max-w-xl rounded-3xl bg-surface p-6 sm:p-8">
        <form onSubmit={handleGenerate} noValidate>
          <label htmlFor="reels-username" className="label">Instagram username</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="reels-username"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="nick_saraev, @nick_saraev or a profile link"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="input flex-1"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'reels-username-error' : undefined}
            />
            <button type="submit" className="btn-primary whitespace-nowrap">
              Generate link
            </button>
          </div>
          {error && (
            <p id="reels-username-error" role="alert" className="mt-3 text-sm text-danger">{error}</p>
          )}
        </form>

        {link && username && (
          <div className="mt-8 border-t border-white/10 pt-6" aria-live="polite">
            <p className="text-sm text-ink/60">Click to go:</p>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-3 w-full justify-center sm:w-auto"
            >
              <Play size={15} aria-hidden="true" /> Watch Reels @{username}
              <ArrowUpRight size={15} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink/80">{link}</code>
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
