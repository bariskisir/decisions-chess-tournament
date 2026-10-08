// Declares service contracts so implementations stay replaceable and testable.
import type {
  GameAnalysis,
  GameOutcome,
  ModelInfo,
  MoveRecord,
  PositionEvaluation,
  TournamentGame,
  UsageStats,
} from "../domain/types.js";

export interface CatalogResult {
  models: ModelInfo[];
  fromCache: boolean;
  fetchedAt: number;
}

export interface ICatalogService {
  load(forceRefresh?: boolean): Promise<CatalogResult>;
  clearCache(): void;
}

export interface MoveRequest {
  modelId: string;
  apiKey: string;
  fen: string;
  pgn: string;
  legalMoves: string[];
  color: "white" | "black";
  moveNumber: number;
}

export interface MoveResult {
  record: Omit<MoveRecord, "ply">;
  usage: { promptTokens: number; completionTokens: number; costUsd: number; ok: boolean };
  error: string | null;
}

export interface IMoveProvider {
  readonly id: string;
  requestMove(request: MoveRequest, signal: AbortSignal): Promise<MoveResult>;
}

export interface IAnalysisService {
  analyzeGame(moves: MoveRecord[], onProgress?: (done: number, total: number) => void): Promise<GameAnalysis>;
  evaluate(fen: string): Promise<PositionEvaluation>;
  close(): Promise<void>;
}

export interface IEloService {
  computeElos(games: TournamentGame[], modelIds: string[]): Map<string, number>;
  expectedScore(ratingA: number, ratingB: number): number;
}

export interface UsageListener {
  (stats: UsageStats): void;
}

export interface GameListener {
  (game: TournamentGame): void;
}

export interface ITournamentRunner {
  onGame(listener: GameListener): () => void;
  onUsage(listener: UsageListener): () => void;
  run(games: TournamentGame[]): Promise<TournamentGame[]>;
  cancel(): void;
}

export interface Pairing {
  whiteId: string;
  blackId: string;
}

export type { GameOutcome };
