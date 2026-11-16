import type { CreatorVoice } from '@/types';
import { CREATOR_VOICES, CUSTOM_VOICE_LIMIT } from '@/utils/voices';

// Creator voices kept in this browser (issue #98): the voice of the last successful AI write and
// the owner's saved custom voices. Nothing goes to the server. Every localStorage access is in
// try/catch: storage can be missing, blocked or full, and the page must work without it.

export const LAST_VOICE_KEY = 'clipremix.ai.lastVoice.v1';
export const SAVED_VOICES_KEY = 'clipremix.ai.savedVoices.v1';
export const VOICE_NAME_LIMIT = 40;
export const SAVED_VOICES_MAX = 20;

export interface SavedVoice {
  id: string;
  name: string;
  text: string;
  savedAt: string;
}

// What the Creator voice select holds: a preset, "custom", or a saved voice as "saved:<id>".
export type VoiceSelection = CreatorVoice | `saved:${string}`;

export interface LastVoice {
  selection: VoiceSelection;
  // The text of the Describe-the-voice box at the time of the write.
  customText: string;
}

const SAVED_PREFIX = 'saved:';

export function savedSelection(id: string): VoiceSelection {
  return `saved:${id}`;
}

// The saved voice's id when the selection is a saved voice, otherwise null.
export function savedIdOf(selection: VoiceSelection): string | null {
  return selection.startsWith(SAVED_PREFIX) ? selection.slice(SAVED_PREFIX.length) : null;
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The saved voices, oldest first. Bad entries are dropped; long names and texts are cut.
export function readSavedVoices(): SavedVoice[] {
  const data = readJson(SAVED_VOICES_KEY);
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const voices: SavedVoice[] = [];
  for (const entry of data) {
    if (!isRecord(entry)) continue;
    const { id, name, text, savedAt } = entry;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || typeof text !== 'string') continue;
    if (seen.has(id)) continue;
    const cleanName = name.trim().slice(0, VOICE_NAME_LIMIT).trim();
    const cleanText = text.trim().slice(0, CUSTOM_VOICE_LIMIT).trim();
    if (!cleanName || !cleanText) continue;
    seen.add(id);
    voices.push({ id, name: cleanName, text: cleanText, savedAt: typeof savedAt === 'string' ? savedAt : '' });
  }
  return voices;
}

export function writeSavedVoices(voices: SavedVoice[]): boolean {
  return writeJson(SAVED_VOICES_KEY, voices);
}

const PRESETS = new Set<string>(CREATOR_VOICES.map((v) => v.value));

// The voice of the last successful AI write, or null when nothing (valid) is stored.
export function readLastVoice(): LastVoice | null {
  const data = readJson(LAST_VOICE_KEY);
  if (!isRecord(data)) return null;
  const { selection, customText } = data;
  if (typeof selection !== 'string') return null;
  const valid = PRESETS.has(selection) || (selection.startsWith(SAVED_PREFIX) && selection.length > SAVED_PREFIX.length);
  if (!valid) return null;
  return {
    selection: selection as VoiceSelection,
    customText: typeof customText === 'string' ? customText.slice(0, CUSTOM_VOICE_LIMIT) : '',
  };
}

export function writeLastVoice(last: LastVoice): boolean {
  return writeJson(LAST_VOICE_KEY, last);
}

export function newVoiceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // fall through to the simple id
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SaveVoiceResult =
  | { ok: true; voice: SavedVoice; voices: SavedVoice[] }
  | { ok: false; error: string };

export const VOICE_MESSAGES = {
  nameMissing: 'Give the voice a name.',
  storageFailed: "This browser can't save voices right now.",
  limit: `You can keep up to ${SAVED_VOICES_MAX} voices. Delete one to save another.`,
  duplicate: (name: string) => `You already have a voice called “${name}”.`,
};

// Checks and saves a new voice after the ones in `current`. Nothing is overwritten.
export function saveVoice(current: SavedVoice[], name: string, text: string): SaveVoiceResult {
  const cleanName = name.trim();
  const cleanText = text.trim();
  if (!cleanName) return { ok: false, error: VOICE_MESSAGES.nameMissing };
  if (cleanName.length > VOICE_NAME_LIMIT) return { ok: false, error: `Use at most ${VOICE_NAME_LIMIT} characters.` };
  if (!cleanText || cleanText.length > CUSTOM_VOICE_LIMIT) return { ok: false, error: 'Describe the voice, or pick a preset.' };
  const existing = current.find((v) => v.name.trim().toLowerCase() === cleanName.toLowerCase());
  if (existing) return { ok: false, error: VOICE_MESSAGES.duplicate(existing.name) };
  if (current.length >= SAVED_VOICES_MAX) return { ok: false, error: VOICE_MESSAGES.limit };
  const voice: SavedVoice = { id: newVoiceId(), name: cleanName, text: cleanText, savedAt: new Date().toISOString() };
  const voices = [...current, voice];
  if (!writeSavedVoices(voices)) return { ok: false, error: VOICE_MESSAGES.storageFailed };
  return { ok: true, voice, voices };
}

// Removes a saved voice. Returns the remaining list (also when storage could not be written).
export function deleteSavedVoice(current: SavedVoice[], id: string): SavedVoice[] {
  const voices = current.filter((v) => v.id !== id);
  writeSavedVoices(voices);
  return voices;
}
