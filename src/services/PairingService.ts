// Builds double round-robin pairings so every model plays White and Black once.
import type { Pairing } from "./interfaces.js";

/** Expands model ids into White/Black pairs covering every ordered combination. */
export function buildDoubleRoundRobin(modelIds: string[]): Pairing[] {
  const pairings: Pairing[] = [];
  for (const whiteId of modelIds) {
    for (const blackId of modelIds) {
      if (whiteId !== blackId) pairings.push({ whiteId, blackId });
    }
  }
  return pairings;
}

/** Counts expected games for a participant list without materializing pairs. */
export function expectedGameCount(modelCount: number): number {
  return modelCount * (modelCount - 1);
}
