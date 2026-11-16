import type { CreatorVoice } from '@/types';

// The creator voices of the AI writer, in the order the Remix page lists them.
// The backend holds each preset's full persona (backend/app/ai_writer.py).
export const CREATOR_VOICES: { value: CreatorVoice; label: string; description: string }[] = [
  { value: 'educational_blogger', label: 'Educational blogger', description: 'Explains one idea step by step, in plain words.' },
  { value: 'storyteller', label: 'Storyteller', description: 'Tells it as a personal story with stakes and a turn.' },
  { value: 'entertainer', label: 'Entertainer', description: 'Fast, playful and punchy, with jokes that fit the topic.' },
  { value: 'expert_reviewer', label: 'Expert reviewer', description: 'Weighs pros and cons and gives a clear verdict.' },
  { value: 'motivational_coach', label: 'Motivational coach', description: 'Energetic and encouraging, pushes the viewer to act.' },
  { value: 'custom', label: 'Custom voice…', description: 'Write who is speaking, in your own words.' },
];

export const CUSTOM_VOICE_LIMIT = 300;
export const INSTRUCTIONS_LIMIT = 500;

// The words used in "Draft written in the … voice.": the preset's label, or "custom".
export function voiceName(voice: CreatorVoice): string {
  if (voice === 'custom') return 'custom';
  return CREATOR_VOICES.find((v) => v.value === voice)?.label ?? voice;
}

// The messages the backend sends for AI writing (openapi.yaml, writeRemixWithAi).
export const AI_MESSAGES = {
  notConfigured: 'AI writing is not set up on this server. Ask the owner to set GEMINI_API_KEY. Templates still work.',
  quota: "Gemini's free quota is used up for now. Try again later, or use a template.",
  failed: "Gemini couldn't write a draft this time. Your text hasn't changed. Try again.",
};
