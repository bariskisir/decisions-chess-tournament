// Calculates tournament Elo ratings from finished games in chronological order.
import { ELO_K, ELO_START } from "../config/constants.js";
import type { TournamentGame } from "../domain/types.js";
import type { IEloService } from "./interfaces.js";

/** Applies the standard Elo update after every decisive or drawn game. */
export class EloService implements IEloService {
  /** Returns the expected score of player A against player B. */
  expectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /** Replays finished games sequentially starting from a shared initial rating. */
  computeElos(games: TournamentGame[], modelIds: string[]): Map<string, number> {
    const ratings = new Map<string, number>(modelIds.map((id) => [id, ELO_START]));
    for (const game of games) {
      if (game.status !== "finished" || game.outcome === null || game.outcome === "aborted") continue;
      const white = ratings.get(game.whiteId) ?? ELO_START;
      const black = ratings.get(game.blackId) ?? ELO_START;
      const whiteScore = game.outcome === "white" ? 1 : game.outcome === "draw" ? 0.5 : 0;
      const blackScore = 1 - whiteScore;
      ratings.set(game.whiteId, white + ELO_K * (whiteScore - this.expectedScore(white, black)));
      ratings.set(game.blackId, black + ELO_K * (blackScore - this.expectedScore(black, white)));
    }
    return ratings;
  }
}
