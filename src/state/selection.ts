// Persists the user's model selection so startup defaults never overwrite it.
import { AVAILABILITY_CACHE_KEY, CHOICE_LIMITS_CACHE_KEY, SELECTION_CACHE_KEY } from "../config/constants.js";
import type { ModelInfo } from "../domain/types.js";

/** Measured per-model choice limits, used until live probes report newer values. */
const DEFAULT_CHOICE_LIMITS: Record<string, number> = {
  "togethercomputer/tev1-4b-experimental": 20,
  "upstage/solar-decide": 26,
  "upstage/solar-decide-flash": 26,
};

/** Picks the latest jev model, latest luna model, and latest model overall. */
export function defaultSelection(models: ModelInfo[]): Set<string> {
  const byDate = [...models].sort((left, right) => right.publishedAt - left.publishedAt);
  const latest = (fragment: string): string | undefined =>
    byDate.find((model) => model.id.toLowerCase().includes(fragment))?.id;
  const ids = [latest("jev"), latest("luna"), byDate[0]?.id].filter((id): id is string => Boolean(id));
  return new Set(ids);
}

/** Reads the saved selection without throwing when storage is unavailable. */
export function loadSavedSelection(): { selected: string[] | null } {
  try {
    const raw = localStorage.getItem(SELECTION_CACHE_KEY);
    return { selected: raw ? (JSON.parse(raw) as string[]) : null };
  } catch {
    return { selected: null };
  }
}

/** Stores the selection so reloads keep the user's choices. */
export function saveSelection(selected: Set<string>): void {
  try {
    localStorage.setItem(SELECTION_CACHE_KEY, JSON.stringify([...selected]));
  } catch {
    // Storage quota failures must not break the tournament setup.
  }
}

/** Reads the last-known availability without throwing when storage is unavailable. */
export function loadAvailability(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(AVAILABILITY_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Stores availability so erroring models stay marked across reloads. */
export function saveAvailability(availability: Record<string, boolean>): void {
  try {
    localStorage.setItem(AVAILABILITY_CACHE_KEY, JSON.stringify(availability));
  } catch {
    // Storage quota failures must not break the tournament setup.
  }
}

/** Reads the discovered choice limits without throwing when storage is unavailable. */
export function loadChoiceLimits(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CHOICE_LIMITS_CACHE_KEY);
    const saved = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return { ...DEFAULT_CHOICE_LIMITS, ...saved };
  } catch {
    return { ...DEFAULT_CHOICE_LIMITS };
  }
}

/** Stores choice limits so tournaments chunk questions correctly from the start. */
export function saveChoiceLimits(limits: Record<string, number>): void {
  try {
    localStorage.setItem(CHOICE_LIMITS_CACHE_KEY, JSON.stringify(limits));
  } catch {
    // Storage quota failures must not break the tournament setup.
  }
}
