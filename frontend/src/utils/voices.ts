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
  turnedOff: 'AI writing is turned off on this server for now. Templates still work.',
};

// The server's daily-limit 429 (backend/app/ai_writer.py, DAILY_LIMIT): `timeLeft` like "3 h 20 min".
export function aiDailyLimitMessage(limit: number, timeLeft: string): string {
  return `Today's limit of ${limit} AI writes is used up. It resets at midnight UTC, in ${timeLeft}. Templates still work.`;
}

// True for the two daily-limit answers (limit used up, or AI_WRITES_PER_DAY=0), told apart from
// Gemini's own quota message by their text.
export function isAiDailyLimitMessage(message: string | null | undefined): boolean {
  return !!message && (message.startsWith("Today's limit of ") || message === AI_MESSAGES.turnedOff);
}

// The line under the Write with AI helper text after a successful write.
export function aiWritesLeftText(left: number, limit: number): string {
  if (left <= 0) return 'No AI writes left today. They reset at midnight UTC. Templates still work.';
  if (left === 1) return `1 AI write left today (of ${limit}). Resets at midnight UTC.`;
  return `${left} of ${limit} AI writes left today. Resets at midnight UTC.`;
}
