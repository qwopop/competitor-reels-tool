import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RemixedVideo, Video } from '@/types';
import { useApi } from '@/services';
import { relativeTime } from '@/utils/format';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorBanner, FullPageLoader } from '@/components/ui';

export function RemixesPage() {
  const api = useApi();
  const [remixes, setRemixes] = useState<RemixedVideo[] | null>(null);
  const [videoById, setVideoById] = useState<Record<string, Video>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.listRemixes(), api.listVideos()]).then(([remixRes, videoRes]) => {
      if (!active) return;
      if (remixRes.error) setError(remixRes.error);
      else setRemixes(remixRes.data ?? []);
      if (videoRes.data) setVideoById(Object.fromEntries(videoRes.data.map((r) => [r.id, r])));
    });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <div>
      <PageHeader
        title="Your"
        accent="remixes"
        description="Every breakdown you have generated. Open one to edit its hook, script and call to action."
      />

      {error && (
        <div className="mb-10 max-w-3xl">
          <ErrorBanner message={error} />
        </div>
      )}

      {remixes === null && !error ? (
        <FullPageLoader label="Loading remixes…" />
      ) : remixes && remixes.length === 0 ? (
        <EmptyState
          title="No remixes yet"
          description="Open a Video and click Remix to generate a breakdown from a template."
          action={<Link to="/videos" className="btn-primary">Browse videos</Link>}
        />
      ) : remixes ? (
        <ul className="max-w-4xl">
          {remixes.map((remix) => {
            const video = videoById[remix.videoId];
            return (
              <li key={remix.id} className="rise flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-surface px-6 py-5 [&+&]:mt-3">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="text-sm text-ink/60">
                    {video ? `@${video.competitorUsername} · ` : ''}updated {relativeTime(remix.updatedAt)}
                  </p>
                  <h2 className="mt-1 text-lg font-medium leading-snug text-ink">{remix.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm text-ink/70">Hook: {remix.hook}</p>
                </div>
                <Link to={`/remix/${remix.id}`} className="btn-outline px-4 py-2 text-sm">Open editor</Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
