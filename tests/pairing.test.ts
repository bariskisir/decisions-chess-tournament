// Covers double round-robin pairing with ordered White and Black games.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDoubleRoundRobin, expectedGameCount } from "../src/services/PairingService.js";

/** Verifies that every ordered model pair appears exactly once. */
describe("pairings", () => {
  it("builds white and black games for every pair", () => {
    const pairings = buildDoubleRoundRobin(["a", "b", "c"]);
    assert.equal(pairings.length, 6);
    assert.equal(expectedGameCount(3), 6);
    for (const white of ["a", "b", "c"]) {
      for (const black of ["a", "b", "c"]) {
        if (white === black) continue;
        assert.ok(pairings.some((pairing) => pairing.whiteId === white && pairing.blackId === black));
      }
    }
  });
});
