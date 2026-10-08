// Covers UCI extraction and legal-move resolution for model output.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractUci, resolveLegalMove } from "../src/chess/prompt.js";

/** Verifies that free-form text resolves to legal tournament moves. */
describe("prompt parsing", () => {
  it("extracts UCI tokens from noisy text", () => {
    assert.equal(extractUci("I play e2e4!"), "e2e4");
    const resolved = resolveLegalMove("e2e4", ["e2e4", "d2d4"], "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    assert.equal(resolved.uci, "e2e4");
    assert.equal(resolved.fallback, false);
  });
});
