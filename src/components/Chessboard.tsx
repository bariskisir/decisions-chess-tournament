// Renders sixty-four squares from FEN with orientation and last-move highlights.
import { memo } from "react";
import { Piece } from "./Piece.js";

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** Expands a FEN placement field into a square-to-piece map. */
function positionSquares(fen: string | null): Map<string, string> {
  const pieces = new Map<string, string>();
  if (!fen) return pieces;
  const ranks = fen.split(" ")[0]!.split("/");
  for (let row = 0; row < 8; row++) {
    let file = 0;
    for (const value of ranks[row] ?? "") {
      if (/\d/.test(value)) file += Number(value);
      else {
        pieces.set(`${String.fromCharCode(97 + file)}${8 - row}`, value);
        file++;
      }
    }
  }
  return pieces;
}

/** Memoizes each board so unrelated arena updates do not redraw pieces. */
export const Chessboard = memo(function Chessboard({
  fen,
  lastMove,
  orientation,
}: {
  fen: string | null;
  lastMove: string | null;
  orientation: "white" | "black";
}): React.JSX.Element {
  const pieces = positionSquares(fen);
  const squares: React.JSX.Element[] = [];
  for (let index = 0; index < 64; index++) {
    const row = Math.floor(index / 8);
    const column = index % 8;
    const file = orientation === "white" ? column : 7 - column;
    const rank = orientation === "white" ? 8 - row : row + 1;
    const square = `${String.fromCharCode(97 + file)}${rank}`;
    const piece = pieces.get(square);
    const highlighted = lastMove?.slice(0, 2) === square || lastMove?.slice(2, 4) === square;
    const description = piece
      ? `${piece === piece.toUpperCase() ? "White" : "Black"} ${PIECE_NAMES[piece.toLowerCase()] ?? "piece"} on ${square}`
      : `Empty ${square}`;
    squares.push(
      <div
        key={square}
        className={`board-square ${(file + rank) % 2 ? "board-square--light" : "board-square--dark"}${highlighted ? " board-square--last" : ""}`}
        aria-label={description}
      >
        {column === 0 && <span className="board-coordinate board-coordinate--rank">{rank}</span>}
        {row === 7 && <span className="board-coordinate board-coordinate--file">{square[0]}</span>}
        {piece && <Piece piece={piece} />}
      </div>,
    );
  }
  return (
    <div className="chessboard" role="img" aria-label={`Chess position viewed from ${orientation}'s side`}>
      {squares}
    </div>
  );
});
