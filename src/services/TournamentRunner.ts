// Plays one tournament game by alternating move providers until termination.
import { Chess } from "chess.js";
import type { MoveRecord, TournamentGame } from "../domain/types.js";
import type { GameListener, IMoveProvider, UsageListener } from "./interfaces.js";

interface RunnerDeps {
  apiKey: string;
  providers: Map<string, IMoveProvider>;
  maxPly: number;
  reportGame: (game: TournamentGame) => void;
  reportUsage: (request: { modelId: string; promptTokens: number; completionTokens: number; costUsd: number; ok: boolean }) => void;
  reportError: (message: string) => void;
}

// chess.js history() and pgn() rewind and replay every prior move, so keeping
// SAN and PGN incrementally avoids per-move cost that grows with game length.
/** Appends one SAN move to PGN movetext without replaying the whole game. */
function appendPgnMove(pgn: string, san: string, ply: number): string {
  if (ply % 2 === 1) return `${pgn}${Math.ceil(ply / 2)}. ${san} `;
  return `${pgn}${san} `;
}

/** Executes a single game with chess.js as the authoritative rules engine. */
export class GameRunner {
  /** Creates a runner bound to shared providers and reporting callbacks. */
  constructor(private readonly deps: RunnerDeps) {}

  /** Plays the game to checkmate, stalemate, draw rules, or the ply limit. */
  async play(game: TournamentGame, signal: AbortSignal): Promise<TournamentGame> {
    const chess = new Chess();
    const moves: MoveRecord[] = [];
    const sans: string[] = [];
    let pgn = "";
    let current: TournamentGame = { ...game, status: "playing", moves: [], sans: [], fen: chess.fen(), pgn: "" };
    this.deps.reportGame(current);

    while (!chess.isGameOver() && moves.length < this.deps.maxPly) {
      signal.throwIfAborted();
      const turn = chess.turn() === "w" ? "white" : "black";
      const modelId = turn === "white" ? game.whiteId : game.blackId;
      const provider = this.deps.providers.get(modelId);
      if (!provider) throw new Error(`No move provider for ${modelId}.`);
      const legalMoves = chess.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
      const fenBefore = chess.fen();
      const result = await provider.requestMove(
        {
          modelId,
          apiKey: this.deps.apiKey,
          fen: fenBefore,
          pgn,
          legalMoves,
          color: turn,
          moveNumber: Math.floor(moves.length / 2) + 1,
        },
        signal,
      );
      this.deps.reportUsage({ modelId, ...result.usage });
      if (result.error) this.deps.reportError(`${modelId}: ${result.error}`);
      const applied = chess.move({
        from: result.record.uci.slice(0, 2),
        to: result.record.uci.slice(2, 4),
        promotion: result.record.uci.slice(4) || undefined,
      });
      const record: MoveRecord = {
        ...result.record,
        ply: moves.length + 1,
        san: applied.san,
        fenBefore,
        fenAfter: chess.fen(),
      };
      moves.push(record);
      sans.push(applied.san);
      pgn = appendPgnMove(pgn, applied.san, record.ply);
      current = { ...current, moves: [...moves], sans: [...sans], fen: chess.fen(), pgn };
      this.deps.reportGame(current);
    }

    // Build the full PGN only once, for completed games and any later export.
    return { ...current, status: "finished", pgn: chess.pgn(), ...this.describeResult(chess) };
  }

  /** Maps the terminal chess.js position to a tournament outcome and reason. */
  private describeResult(chess: Chess): { outcome: TournamentGame["outcome"]; reason: string } {
    if (chess.isCheckmate()) return { outcome: chess.turn() === "w" ? "black" : "white", reason: "checkmate" };
    if (chess.isStalemate()) return { outcome: "draw", reason: "stalemate" };
    if (chess.isThreefoldRepetition()) return { outcome: "draw", reason: "threefold repetition" };
    if (chess.isInsufficientMaterial()) return { outcome: "draw", reason: "insufficient material" };
    if (chess.isDraw()) return { outcome: "draw", reason: "fifty-move rule" };
    return { outcome: "draw", reason: "ply limit reached" };
  }
}

/** Runs many games with bounded concurrency while streaming live updates. */
export class TournamentRunner {
  private gameListeners = new Set<GameListener>();
  private usageListeners = new Set<UsageListener>();
  private aborted = false;
  private activeControllers = new Set<AbortController>();

  /** Creates a bounded runner over shared providers and tournament settings. */
  constructor(
    private readonly deps: Omit<RunnerDeps, "reportGame" | "reportUsage" | "reportError"> & {
      concurrency: number;
      emitGame: (game: TournamentGame) => void;
      emitUsage: (usage: { modelId: string; promptTokens: number; completionTokens: number; costUsd: number; ok: boolean }) => void;
      emitError: (message: string) => void;
    },
  ) {}

  /** Subscribes to per-move game snapshots; returns an unsubscribe function. */
  onGame(listener: GameListener): () => void {
    this.gameListeners.add(listener);
    return () => {
      this.gameListeners.delete(listener);
    };
  }

  /** Subscribes to aggregated usage snapshots; returns an unsubscribe function. */
  onUsage(listener: UsageListener): () => void {
    this.usageListeners.add(listener);
    return () => {
      this.usageListeners.delete(listener);
    };
  }

  /** Cancels in-flight games; queued games keep their last published state. */
  cancel(): void {
    this.aborted = true;
    for (const controller of this.activeControllers) controller.abort();
  }

  /** Runs every game with at most N simultaneous boards. */
  async run(games: TournamentGame[]): Promise<TournamentGame[]> {
    this.aborted = false;
    const queue = [...games];
    const results: TournamentGame[] = [];
    const workers = Array.from({ length: Math.min(this.deps.concurrency, queue.length) }, () => this.drain(queue, results));
    await Promise.all(workers);
    return results;
  }

  /** Pulls games from the shared queue until cancellation or exhaustion. */
  private async drain(queue: TournamentGame[], results: TournamentGame[]): Promise<void> {
    const runner = new GameRunner({
      apiKey: this.deps.apiKey,
      providers: this.deps.providers,
      maxPly: this.deps.maxPly,
      reportGame: (game) => this.publishGame(game),
      reportUsage: (usage) => this.deps.emitUsage(usage),
      reportError: (message) => this.deps.emitError(message),
    });
    while (queue.length && !this.aborted) {
      const next = queue.shift()!;
      const controller = new AbortController();
      this.activeControllers.add(controller);
      try {
        const finished = await runner.play(next, controller.signal);
        this.publishGame(finished);
        results.push(finished);
      } catch (error) {
        if (this.aborted) {
          this.publishGame({ ...next, status: "queued", error: "Cancelled." });
        } else {
          this.publishGame({ ...next, status: "finished", outcome: "aborted", reason: "error", error: error instanceof Error ? error.message : "Game failed." });
          results.push({ ...next, status: "finished", outcome: "aborted", reason: "error" });
        }
      } finally {
        this.activeControllers.delete(controller);
      }
    }
  }

  /** Broadcasts one game snapshot to every live arena subscriber. */
  private publishGame(game: TournamentGame): void {
    this.deps.emitGame(game);
    for (const listener of this.gameListeners) listener(game);
  }
}
