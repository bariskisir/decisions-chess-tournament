// Plays instant random legal moves for offline UI testing without OpenRouter.
import { Chess } from "chess.js";
import type { IMoveProvider, MoveRequest, MoveResult } from "./interfaces.js";

/** Provides random legal moves with no network access for dry runs. */
export class RandomMoveProvider implements IMoveProvider {
  readonly id = "random-test";

  /** Picks a random legal move and reports zero usage without any API call. */
  async requestMove(request: MoveRequest, signal: AbortSignal): Promise<MoveResult> {
    signal.throwIfAborted();
    const started = performance.now();
    await this.pause(signal);
    const uci = request.legalMoves[Math.floor(Math.random() * request.legalMoves.length)]!;
    const chess = new Chess(request.fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
    return {
      record: {
        color: request.color,
        modelId: request.modelId,
        uci,
        san: move.san,
        fenBefore: request.fen,
        fenAfter: chess.fen(),
        latencyMs: performance.now() - started,
        fallback: false,
        rawText: `test mode random move: ${uci}`,
      },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0, ok: true },
      error: null,
    };
  }

  /** Waits 5ms between test moves so the arena stays responsive and watchable. */
  private pause(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waitMs = 5;
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, waitMs);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new DOMException("Test move canceled.", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
