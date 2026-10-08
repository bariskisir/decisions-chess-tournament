// Shows pairwise results so viewers can see who beat whom.
import type { TournamentGame } from "../domain/types.js";

/** Builds a row-major win matrix from finished games. */
function buildMatrix(games: TournamentGame[], ids: string[]): Map<string, Map<string, string>> {
  const matrix = new Map<string, Map<string, string>>();
  for (const row of ids) {
    const cells = new Map<string, string>();
    for (const column of ids) cells.set(column, row === column ? "·" : "");
    matrix.set(row, cells);
  }
  for (const game of games) {
    if (game.status !== "finished" || !game.outcome || game.outcome === "aborted") continue;
    const score = game.outcome === "draw" ? "½" : game.outcome === "white" ? "1" : "0";
    const cell = matrix.get(game.whiteId)?.get(game.blackId) ?? "";
    matrix.get(game.whiteId)?.set(game.blackId, cell ? `${cell} ${score}` : score);
  }
  return matrix;
}

/** Renders the head-to-head matrix with White-perspective scores. */
export function HeadToHead({
  games,
  ids,
  names,
}: {
  games: TournamentGame[];
  ids: string[];
  names: Map<string, string>;
}): React.JSX.Element {
  if (!ids.length) return <p className="empty-state">Select models to preview the matrix.</p>;
  const matrix = buildMatrix(games, ids);
  const short = (id: string): string => names.get(id) ?? id;
  return (
    <div className="table-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th>White ↓ / Black →</th>
            {ids.map((id) => (
              <th key={id} title={id}>
                {short(id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((row) => (
            <tr key={row}>
              <th title={row}>{short(row)}</th>
              {ids.map((column) => (
                <td key={column} className={row === column ? "matrix-self" : undefined}>
                  {matrix.get(row)?.get(column) ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
