import type { RemixTemplate } from '@/types';

export const REMIX_TEMPLATES: { value: RemixTemplate; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'A balanced breakdown you can edit.' },
  { value: 'educational', label: 'Educational', description: 'Teaches one idea step by step.' },
  { value: 'storytelling', label: 'Storytelling', description: 'Problem, turning point, outcome.' },
  { value: 'promotional', label: 'Promotional', description: 'Shows a result and a clear next step.' },
];
