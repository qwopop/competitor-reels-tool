import type { RemixTemplate } from '@/types';

export const REMIX_TEMPLATES: { value: RemixTemplate; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Why the video worked, then your own angle on it.' },
  { value: 'educational', label: 'Educational', description: 'A lesson in steps, using the video’s chapters when it has them.' },
  { value: 'storytelling', label: 'Storytelling', description: 'Your own try at it: where it starts, the stakes, the result.' },
  { value: 'promotional', label: 'Promotional', description: 'Pain, fix and proof from the video’s numbers, then your offer.' },
];
