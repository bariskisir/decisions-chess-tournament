// Aggregates tournament games, leaderboard rows, and usage into one React store.
import { useCallback, useMemo, useRef, useState } from "react";
import { ELO_START } from "../config/constants.js";
import type {
  LeaderboardEntry,
  ModelInfo,
  TournamentGame,
  UsageStats,
} from "../domain/types.js";
import { EloService } from "../services/EloService.js";

const EMPTY_USAGE: UsageStats = { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, perModel: {} };
const eloService = new EloService();

/** Builds head-to-head aware leaderboard rows from finished games. */
export function buildLeaderboard(games: TournamentGame[], models: ModelInfo[]): LeaderboardEntry[] {
  const rows = new Map<string, LeaderboardEntry>(
    models.map((model) => [
      model.id,
      { modelId: model.id, name: model.shortName || model.name, games: 0, wins: 0, draws: 0, losses: 0, points: 0, elo: ELO_START, accuracy: null, avgLossCp: null },
    ]),
  );
  for (const game of games) {
    if (game.status !== "finished" || !game.outcome || game.outcome === "aborted") continue;
    for (const id of [game.whiteId, game.blackId]) {
      if (!rows.has(id)) {
        rows.set(id, { modelId: id, name: id, games: 0, wins: 0, draws: 0, losses: 0, points: 0, elo: ELO_START, accuracy: null, avgLossCp: null });
      }
    }
    const white = rows.get(game.whiteId)!;
    const black = rows.get(game.blackId)!;
    white.games++;
    black.games++;
    if (game.outcome === "white") {
      white.wins++;
      white.points++;
      black.losses++;
    } else if (game.outcome === "black") {
      black.wins++;
      black.points++;
      white.losses++;
    } else {
      white.draws++;
      black.draws++;
      white.points += 0.5;
      black.points += 0.5;
    }
    if (game.analysis) {
      if (game.analysis.accuracyWhite !== null) white.accuracy = game.analysis.accuracyWhite;
      if (game.analysis.accuracyBlack !== null) black.accuracy = game.analysis.accuracyBlack;
    }
  }
  const elos = eloService.computeElos(games, [...rows.keys()]);
  for (const [id, elo] of elos) {
    const row = rows.get(id);
    if (row) row.elo = Math.round(elo);
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.elo - a.elo);
}

/** Holds live games, finished games, usage, and analysis progress for the arena. */
export function useTournamentStore(models: ModelInfo[]) {
  const [liveGames, setLiveGames] = useState<Map<string, TournamentGame>>(new Map());
  const [finishedGames, setFinishedGames] = useState<TournamentGame[]>([]);
  const [usage, setUsage] = useState<UsageStats>(EMPTY_USAGE);
  const [analysisProgress, setAnalysisProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const usageRef = useRef(EMPTY_USAGE);
  const names = useMemo(() => new Map(models.map((model) => [model.id, model.shortName || model.name])), [models]);

  /** Applies one game snapshot to the live grid and the finished list. */
  const applyGame = useCallback(
    (game: TournamentGame) => {
      setLiveGames((previous) => new Map(previous).set(game.id, game));
      setFinishedGames((previous) => {
        if (game.status !== "finished") return previous;
        if (previous.some((entry) => entry.id === game.id)) {
          return previous.map((entry) => (entry.id === game.id ? game : entry));
        }
        return [...previous, game];
      });
    },
    [],
  );

  /** Resets boards and accounting before a new tournament run. */
  const reset = useCallback((games: TournamentGame[]) => {
    usageRef.current = EMPTY_USAGE;
    setUsage(EMPTY_USAGE);
    setFinishedGames([]);
    setLiveGames(new Map(games.map((game) => [game.id, game])));
    setAnalysisProgress(null);
    setLastError(null);
  }, []);

  /** Accumulates token usage and dollar cost across every model request. */
  const applyUsage = useCallback((event: { modelId: string; promptTokens: number; completionTokens: number; costUsd: number; ok: boolean }) => {
    const previous = usageRef.current;
    const perModel = { ...previous.perModel };
    const entry = perModel[event.modelId] ?? { requests: 0, failed: 0, costUsd: 0 };
    perModel[event.modelId] = {
      requests: entry.requests + 1,
      failed: entry.failed + (event.ok ? 0 : 1),
      costUsd: entry.costUsd + event.costUsd,
    };
    const next: UsageStats = {
      requests: previous.requests + 1,
      failedRequests: previous.failedRequests + (event.ok ? 0 : 1),
      promptTokens: previous.promptTokens + event.promptTokens,
      completionTokens: previous.completionTokens + event.completionTokens,
      costUsd: previous.costUsd + event.costUsd,
      perModel,
    };
    usageRef.current = next;
    setUsage(next);
  }, []);

  /** Keeps the latest provider error visible so failed requests stay diagnosable. */
  const reportError = useCallback((message: string) => {
    setLastError(message);
  }, []);

  const leaderboard = useMemo(() => buildLeaderboard(finishedGames, models), [finishedGames, models]);

  return { liveGames, finishedGames, usage, leaderboard, analysisProgress, setAnalysisProgress, lastError, reportError, applyGame, applyUsage, reset, names };
}

export type TournamentStore = ReturnType<typeof useTournamentStore>;
