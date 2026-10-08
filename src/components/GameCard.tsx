// Displays one live tournament board with players, moves, and Stockfish state.
import { memo } from "react";
import type { TournamentGame } from "../domain/types.js";
import { Chessboard } from "./Chessboard.js";

/** Formats the game result badge from the terminal outcome. */
function resultBadge(game: TournamentGame): string {
  if (game.status !== "finished" || !game.outcome) return game.status === "playing" ? "playing" : game.status;
  if (game.outcome === "white") return "1–0";
  if (game.outcome === "black") return "0–1";
  if (game.outcome === "draw") return "½–½";
  return "aborted";
}

/** Shows a single arena card without any inline styles. */
export const GameCard = memo(function GameCard({ game }: { game: TournamentGame }): React.JSX.Element {
  const lastMove = game.moves.length ? game.moves[game.moves.length - 1]!.uci : null;
  const lastSans = game.sans.slice(-4).join(" ");
  const fallbackMoves = game.moves.filter((move) => move.fallback).length;
  return (
    <article className={`game-card${game.status === "finished" ? " game-card--finished" : ""}`}>
      <header className="game-card-heading">
        <span className="game-number">{game.id}</span>
        <span className={`game-status game-status--${game.status}`}>{resultBadge(game)}</span>
      </header>
      <div className="player-row">
        <span className="player-color player-color--black" />
        <span className="player-identity">
          <span className="player-name">{game.blackName}</span>
        </span>
      </div>
      <div className="board-area">
        <div className="board-wrap">
          <Chessboard fen={game.fen} lastMove={lastMove} orientation="white" />
          {game.status === "finished" && (
            <div className="result-overlay">
              <div className="result-panel">
                <span className="result-kicker">{game.reason}</span>
                <strong>{resultBadge(game)}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="player-row">
        <span className="player-color player-color--white" />
        <span className="player-identity">
          <span className="player-name">{game.whiteName}</span>
        </span>
      </div>
      <footer className="game-footer">
        <span className="game-status">
          {game.moves.length} moves{lastSans ? ` · ${lastSans}` : ""}
        </span>
        <span className="move-count">
          {game.error ?? ""}
          {fallbackMoves > 0 && <span className="fallback-badge"> {fallbackMoves} fallback</span>}
        </span>
      </footer>
    </article>
  );
});
