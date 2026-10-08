// Shows live request and dollar counters for the tournament.
import type { UsageStats } from "../domain/types.js";

/** Formats dollars with enough decimals that tiny model costs stay visible. */
function formatCost(costUsd: number): string {
  if (costUsd === 0) return "$0";
  if (costUsd < 0.01) return `$${costUsd.toFixed(6)}`;
  return `$${costUsd.toFixed(4)}`;
}

/** Renders aggregated usage with tabular numbers and SCSS-only styling. */
export function StatsBar({ usage }: { usage: UsageStats }): React.JSX.Element {
  return (
    <dl className="stats-bar" aria-label="Live usage">
      <div className="stat">
        <dt>Requests</dt>
        <dd>
          {usage.requests}
          {usage.failedRequests > 0 && <span className="stat-failed"> ({usage.failedRequests} failed)</span>}
        </dd>
      </div>
      <div className="stat" title={`Exact cost: $${usage.costUsd}`}>
        <dt>Cost</dt>
        <dd>{formatCost(usage.costUsd)}</dd>
      </div>
    </dl>
  );
}
