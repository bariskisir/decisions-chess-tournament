// Offers Stockfish 19 Lite as an optional local tournament participant.
import { Chess } from "chess.js";
import { ANALYSIS_DEPTH, STOCKFISH_PARTICIPANT_ID } from "../config/constants.js";
import type { IMoveProvider, MoveRequest, MoveResult } from "./interfaces.js";

/** Plays principled local moves through a dedicated Stockfish worker. */
export class StockfishMoveProvider implements IMoveProvider {
  readonly id = STOCKFISH_PARTICIPANT_ID;
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private started = false;
  private queue: Promise<void> = Promise.resolve();
  private pendingReject: ((reason: Error) => void) | null = null;

  /** Starts the engine lazily so tournaments without Stockfish cost nothing. */
  private ensureStarted(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Stockfish worker failed to start."));
        return;
      }
      const worker = this.worker;
      const timer = setTimeout(() => reject(new Error("Stockfish startup timed out.")), 15_000);
      worker.onmessage = (event: MessageEvent<unknown>): void => {
        if (String(event.data ?? "").trim() === "uciok") {
          worker.postMessage("setoption name Hash value 32");
          worker.postMessage("isready");
        } else if (String(event.data ?? "").trim() === "readyok") {
          clearTimeout(timer);
          this.started = true;
          resolve();
        }
      };
      worker.onerror = (): void => {
        clearTimeout(timer);
        if (!this.started) reject(new Error("Stockfish worker failed to load."));
        else this.fail(new Error("Stockfish worker crashed."));
      };
      worker.postMessage("uci");
    });
    return this.ready;
  }

  /** Rejects the pending search and recreates the worker on the next search. */
  private fail(error: Error): void {
    const reject = this.pendingReject;
    this.pendingReject = null;
    try {
      this.worker?.terminate();
    } catch {
      // Termination is best effort; the worker is discarded either way.
    }
    this.worker = null;
    this.ready = null;
    this.started = false;
    reject?.(error);
  }

  /** Searches the current position at depth 15 and returns the best move. */
  async requestMove(request: MoveRequest, signal: AbortSignal): Promise<MoveResult> {
    const started = performance.now();
    await this.ensureStarted();
    signal.throwIfAborted();
    const uci = await this.search(request.fen, signal);
    const legal = request.legalMoves.includes(uci) ? uci : request.legalMoves[0]!;
    const chess = new Chess(request.fen);
    const move = chess.move({ from: legal.slice(0, 2), to: legal.slice(2, 4), promotion: legal.slice(4) || undefined });
    return {
      record: {
        color: request.color,
        modelId: request.modelId,
        uci: legal,
        san: move.san,
        fenBefore: request.fen,
        fenAfter: chess.fen(),
        latencyMs: performance.now() - started,
        fallback: legal !== uci,
        rawText: `stockfish depth ${ANALYSIS_DEPTH}: ${uci}`,
      },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0, ok: true },
      error: null,
    };
  }

  /** Runs one blocking depth-15 search and resolves with the best move. */
  private search(fen: string, signal: AbortSignal): Promise<string> {
    const task = this.queue.then(() => this.runSearch(fen, signal));
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  /** Runs a single search; the queue guarantees no two searches overlap. */
  private async runSearch(fen: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    await this.ensureStarted();
    signal.throwIfAborted();
    return new Promise<string>((resolve, reject) => {
      signal.throwIfAborted();
      const worker = this.worker;
      if (!worker) {
        reject(new Error("Stockfish worker is unavailable."));
        return;
      }
      this.pendingReject = reject;
      const onAbort = (): void => {
        this.pendingReject = null;
        worker.onmessage = null;
        reject(new DOMException("Search canceled.", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      worker.onmessage = (event: MessageEvent<unknown>): void => {
        const text = String(event.data ?? "");
        for (const line of text.split(/\r?\n/)) {
          if (line.trim().startsWith("bestmove ")) {
            signal.removeEventListener("abort", onAbort);
            this.pendingReject = null;
            const best = line.trim().split(/\s+/)[1] ?? "";
            if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best)) resolve(best);
            else reject(new Error("Stockfish returned an illegal move."));
          }
        }
      };
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${ANALYSIS_DEPTH}`);
    });
  }
}
