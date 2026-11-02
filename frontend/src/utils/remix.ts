import type { RemixedVideo } from '@/types';

export type RemixFields = Pick<RemixedVideo, 'title' | 'hook' | 'script' | 'cta'>;

const FIELDS: (keyof RemixFields)[] = ['title', 'hook', 'script', 'cta'];

export function remixFields(r: RemixFields): RemixFields {
  return { title: r.title, hook: r.hook, script: r.script, cta: r.cta };
}

/**
 * The fields of `current` whose text is not exactly equal to `baseline`.
 * No trimming: whitespace and empty strings are real values.
 */
export function changedRemixFields(current: RemixFields, baseline: RemixFields): Partial<RemixFields> {
  const patch: Partial<RemixFields> = {};
  for (const key of FIELDS) {
    if (current[key] !== baseline[key]) patch[key] = current[key];
  }
  return patch;
}
