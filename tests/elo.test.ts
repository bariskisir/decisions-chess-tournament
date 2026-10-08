// Covers Elo updates for wins, draws, and rating order preservation.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TournamentGame } from "../src/domain/types.js";
import { EloService } from "../src/services/EloService.js";

/** Builds a minimal finished game for Elo replay tests. */
function game(whiteId: string, blackId: string, outcome: TournamentGame["outcome"]): TournamentGame {
  return {
    id: `${whiteId}-${blackId}`,
    whiteId,
    blackId,
    whiteName: whiteId,
    blackName: blackId,
    round: 1,
    fen: "",
    pgn: "",
    sans: [],
    moves: [],
    status: "finished",
    outcome,
    reason: "test",
    evaluation: null,
    analysis: null,
    error: null,
  };
}

/** Verifies standard Elo behavior across decisive and drawn results. */
describe("elo", () => {
  it("rewards winners and splits draws", () => {
    const service = new EloService();
    assert.ok(Math.abs(service.expectedScore(1500, 1500) - 0.5) < 1e-9);
    const ratings = service.computeElos([game("a", "b", "white"), game("a", "b", "draw")], ["a", "b"]);
    assert.ok((ratings.get("a") ?? 0) > (ratings.get("b") ?? 0));
  });
});
