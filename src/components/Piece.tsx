// Selects the local piece bitmap matching a FEN symbol without inline styling.
export function Piece({ piece }: { piece: string }): React.JSX.Element {
  const color = piece === piece.toUpperCase() ? "w" : "b";
  return (
    <img
      className="chess-piece"
      src={`${import.meta.env.BASE_URL}pieces/${color}${piece.toLowerCase()}.png`}
      alt=""
      draggable={false}
    />
  );
}
