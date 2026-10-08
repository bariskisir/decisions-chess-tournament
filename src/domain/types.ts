// Defines shared benchmark entities exchanged between services and React state.
export type GameOutcome = "white" | "black" | "draw" | "aborted";
export type GameStatus = "queued" | "playing" | "analyzing" | "finished";

export interface ModelPricing {
  prompt: number;
  completion: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextLength: number;
  pricing: ModelPricing;
  isFree: boolean;
  publishedAt: number;
  fallbackId: string | null;
}

export interface MoveRecord {
  ply: number;
  color: "white" | "black";
  modelId: string;
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  latencyMs: number;
  fallback: boolean;
  rawText: string;
}

export interface PositionEvaluation {
  fen: string;
  scoreCp: number | null;
  mate: number | null;
  depth: number;
  bestMove: string | null;
}

export interface GameAnalysis {
  evaluations: PositionEvaluation[];
  blunders: { ply: number; lossCp: number }[];
  accuracyWhite: number | null;
  accuracyBlack: number | null;
}

export interface TournamentGame {
  id: string;
  whiteId: string;
  blackId: string;
  whiteName: string;
  blackName: string;
  round: number;
  fen: string;
  pgn: string;
  sans: string[];
  moves: MoveRecord[];
  status: GameStatus;
  outcome: GameOutcome | null;
  reason: string;
  evaluation: PositionEvaluation | null;
  analysis: GameAnalysis | null;
  error: string | null;
}

export interface LeaderboardEntry {
  modelId: string;
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  elo: number;
  accuracy: number | null;
  avgLossCp: number | null;
}

export interface UsageStats {
  requests: number;
  failedRequests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  perModel: Record<string, { requests: number; failed: number; costUsd: number }>;
}

export interface TournamentConfig {
  apiKey: string;
  modelIds: string[];
  includeStockfish: boolean;
  concurrency: number;
  maxPly: number;
}
