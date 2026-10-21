// Covers game-runner move bookkeeping for SAN, FEN, and incremental PGN updates.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TournamentGame } from "../src/domain/types.js";
import type { IMoveProvider, MoveRequest, MoveResult } from "../src/services/interfaces.js";
import { GameRunner } from "../src/services/TournamentRunner.js";

/** Plays a fixed list of UCI moves in order so the runner stays deterministic. */
class SequenceProvider implements IMoveProvider {
  readonly id = "sequence";
  private index = 0;

  /** Returns the next scripted move while filling the required record fields. */
  async requestMove(request: MoveRequest): Promise<MoveResult> {
    const uci = this.script[this.index++]!;
    return {
      record: {
        color: request.color,
        modelId: request.modelId,
        uci,
        san: "",
        fenBefore: request.fen,
        fenAfter: request.fen,
        latencyMs: 0,
        fallback: false,
        rawText: uci,
      },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0, ok: true },
      error: null,
    };
  }

  /** Stores the scripted UCI moves for later calls. */
  constructor(private readonly script: string[]) {}
}

/** Builds a minimal queued game shell for a runner test. */
function game(): TournamentGame {
  return {
    id: "G1",
    whiteId: "white",
    blackId: "black",
    whiteName: "White",
    blackName: "Black",
    round: 1,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: "",
    sans: [],
    moves: [],
    status: "queued",
    outcome: null,
    reason: "",
    evaluation: null,
    analysis: null,
    error: null,
  };
}

/** Verifies that every published snapshot grows without losing prior moves. */
describe("game runner", () => {
  it("keeps SAN and PGN in sync with the authoritative board", async () => {
    const provider = new SequenceProvider(["e2e4", "e7e5", "g1f3", "b8c6"]);
    const snapshots: TournamentGame[] = [];
    const runner = new GameRunner({
      apiKey: "",
      providers: new Map([
        ["white", provider],
        ["black", provider],
      ]),
      maxPly: 4,
      reportGame: (snapshot) => snapshots.push(snapshot),
      reportUsage: () => {},
      reportError: () => {},
    });

    const finished = await runner.play(game(), new AbortController().signal);

    assert.deepEqual(finished.sans, ["e4", "e5", "Nf3", "Nc6"]);
    assert.match(finished.pgn, /1\. e4 e5 2\. Nf3 Nc6/);
    assert.equal(finished.moves.length, 4);
    assert.deepEqual(finished.moves.map((move) => move.ply), [1, 2, 3, 4]);
    assert.equal(snapshots[3]?.pgn, "1. e4 e5 2. Nf3 ");
    assert.equal(snapshots[3]?.moves.length, 3);
    assert.equal(finished.status, "finished");
    assert.equal(finished.reason, "ply limit reached");
  });
});
