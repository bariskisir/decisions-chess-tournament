// Shows tournament standings ordered by points and Elo without inline styles.
import type { LeaderboardEntry } from "../domain/types.js";

/** Renders the ranked leaderboard table for the completed games. */
export function Leaderboard({ rows }: { rows: LeaderboardEntry[] }): React.JSX.Element {
  if (!rows.length) return <p className="empty-state">No games yet. Start the tournament to build standings.</p>;
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th>Elo</th>
            <th>Pts</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>Games</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.modelId}>
              <td>{index + 1}</td>
              <td className="standings-model" title={row.modelId}>
                {row.name}
              </td>
              <td>{row.elo}</td>
              <td>{row.points.toFixed(1)}</td>
              <td>{row.wins}</td>
              <td>{row.draws}</td>
              <td>{row.losses}</td>
              <td>{row.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
