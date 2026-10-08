// Centralizes tunable benchmark constants so behavior changes in one place.
export const OPENROUTER_CATALOG_URL = "https://openrouter.ai/api/frontend/v1/catalog/models";
export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const CATALOG_CACHE_KEY = "decision-chess:catalog-v1";
export const SELECTION_CACHE_KEY = "decisions-chess:selection-v1";
export const AVAILABILITY_CACHE_KEY = "decisions-chess:availability-v1";
export const CHOICE_LIMITS_CACHE_KEY = "decisions-chess:choice-limits-v3";
/** Excluded from tournaments: Respan accepts only noul questions, *-latest aliases duplicate versioned models. */
export const EXCLUDED_MODELS: readonly string[] = ["respan/span-01", "respan/span-01-lite", "~typesafe/jev-latest"];
export const OPENROUTER_KEY_STORAGE_KEY = "decisions-chess:openrouter-key";
export const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
export const ANALYSIS_DEPTH = 15;
export const STOCKFISH_LABEL = "Stockfish 19 Lite";
export const STOCKFISH_PARTICIPANT_ID = "stockfish-19-lite";
export const STOCKFISH_REFERENCE_ELO = 3792;
export const ELO_START = 1500;
export const ELO_K = 32;
export const MAX_PLY = 200;
export const MAX_MOVE_RETRIES = 2;
export const MOVE_TIMEOUT_MS = 60_000;
export const DEFAULT_CONCURRENCY = 20;
export const CONCURRENCY_OPTIONS = [5, 10, 15, 20, 25, 50, 100, 250];
