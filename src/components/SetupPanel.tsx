// Collects the API key, model selection, and tournament options before a run.
import { useState } from "react";
import { CONCURRENCY_OPTIONS, STOCKFISH_LABEL } from "../config/constants.js";
import type { ModelInfo } from "../domain/types.js";

/** Renders setup controls with all styling delegated to SCSS classes. */
export function SetupPanel({
  models,
  selected,
  unavailableIds,
  limits,
  apiKey,
  includeStockfish,
  concurrency,
  loadingCatalog,
  running,
  onApiKey,
  onToggleModel,
  onSelectAll,
  onSelectNone,
  onIncludeStockfish,
  onConcurrency,
}: {
  models: ModelInfo[];
  selected: Set<string>;
  unavailableIds: Set<string>;
  limits: Record<string, number>;
  apiKey: string;
  includeStockfish: boolean;
  concurrency: number;
  loadingCatalog: boolean;
  running: boolean;
  onApiKey: (value: string) => void;
  onToggleModel: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onIncludeStockfish: (value: boolean) => void;
  onConcurrency: (value: number) => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState("");
  const visible = models.filter((model) =>
    `${model.name} ${model.id}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <section className="setup-panel" aria-label="Tournament setup">
      <div className="setup-field">
        <label className="setup-label" htmlFor="api-key">
          OpenRouter API key
        </label>
        <input
          id="api-key"
          className="setup-input"
          type="password"
          placeholder="sk-or-…"
          value={apiKey}
          onChange={(event) => onApiKey(event.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="setup-field">
        <div className="setup-row">
          <span className="setup-label">
            Models ({selected.size}/{models.length})
          </span>
          <span className="setup-actions">
            <button type="button" className="link-button" onClick={onSelectAll} disabled={running}>
              All
            </button>
            <button type="button" className="link-button" onClick={onSelectNone} disabled={running}>
              None
            </button>
          </span>
        </div>
        <input
          className="setup-input"
          type="search"
          placeholder="Filter models…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className="model-list" role="group" aria-label="Model selection">
          {loadingCatalog && <p className="sidebar-notice">Loading decision models…</p>}
          {!loadingCatalog && !visible.length && <p className="sidebar-notice">No models match this filter.</p>}
          {visible.map((model) => {
            const unavailable = unavailableIds.has(model.id);
            return (
              <label key={model.id} className={`model-option${unavailable ? " model-option--unavailable" : ""}`} title={model.description}>
                <input
                  type="checkbox"
                  checked={selected.has(model.id)}
                  onChange={() => onToggleModel(model.id)}
                  disabled={running || unavailable}
                />
                <span className="model-name">{model.shortName || model.name}</span>
                <span className="model-meta">
                  {model.id}
                  {limits[model.id] !== undefined ? ` · max ${limits[model.id]} choices` : ""}
                  {unavailable ? " — unavailable" : ""}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="setup-field">
        <label className="model-option">
          <input
            type="checkbox"
            checked={includeStockfish}
            onChange={(event) => onIncludeStockfish(event.target.checked)}
            disabled={running}
          />
          <span className="model-name">Include {STOCKFISH_LABEL} (local, free)</span>
        </label>
        <label className="setup-label" htmlFor="concurrency">
          Simultaneous games: {concurrency}
        </label>
        <input
          id="concurrency"
          className="setup-range"
          type="range"
          min={0}
          max={CONCURRENCY_OPTIONS.length - 1}
          step={1}
          value={Math.max(0, CONCURRENCY_OPTIONS.indexOf(concurrency))}
          onChange={(event) => onConcurrency(CONCURRENCY_OPTIONS[Number(event.target.value)] ?? concurrency)}
          disabled={running}
        />
      </div>
    </section>
  );
}
