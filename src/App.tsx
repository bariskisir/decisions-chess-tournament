// Orchestrates catalog loading, tournament execution, and depth-15 Stockfish analysis.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONCURRENCY, MAX_PLY, OPENROUTER_KEY_STORAGE_KEY, STOCKFISH_LABEL, STOCKFISH_PARTICIPANT_ID } from "./config/constants.js";
import type { ModelInfo, TournamentGame } from "./domain/types.js";
import { GameCard } from "./components/GameCard.js";
import { HeadToHead } from "./components/HeadToHead.js";
import { Leaderboard } from "./components/Leaderboard.js";
import { SetupPanel } from "./components/SetupPanel.js";
import { StatsBar } from "./components/StatsBar.js";
import { OpenRouterCatalogService } from "./services/OpenRouterCatalogService.js";
import { DecisionsMoveProvider } from "./services/DecisionsMoveProvider.js";
import { RandomMoveProvider } from "./services/RandomMoveProvider.js";
import { StockfishMoveProvider } from "./services/StockfishMoveProvider.js";
import { buildDoubleRoundRobin } from "./services/PairingService.js";
import { TournamentRunner } from "./services/TournamentRunner.js";
import type { IMoveProvider } from "./services/interfaces.js";
import { useTournamentStore } from "./state/useTournamentStore.js";
import { defaultSelection, loadAvailability, loadChoiceLimits, loadSavedSelection, saveAvailability, saveSelection } from "./state/selection.js";
import { probeModels } from "./services/ModelProbe.js";
import "./styles/main.scss";

const catalogService = new OpenRouterCatalogService();

/** Builds tournament game shells from ordered White/Black pairings. */
function toGames(whiteId: string, blackId: string, index: number, names: Map<string, string>): TournamentGame {
  return {
    id: `G${index + 1}`,
    whiteId,
    blackId,
    whiteName: names.get(whiteId) ?? whiteId,
    blackName: names.get(blackId) ?? blackId,
    round: index + 1,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: "",
    sans: [],
    moves: [],
    status: "queued",
    outcome: null,
    reason: "",
    evaluation: null,
    analysis: null,
    error: null,
  };
}

/** Runs the full decisions-chess benchmark arena in the browser. */
export function App(): React.JSX.Element {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem(OPENROUTER_KEY_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [includeStockfish, setIncludeStockfish] = useState(false);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [running, setRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, boolean>>(() => loadAvailability());
  const [choiceLimits, setChoiceLimits] = useState<Record<string, number>>(() => loadChoiceLimits());
  const [probeStatus, setProbeStatus] = useState<string | null>(null);
  const runnerRef = useRef<TournamentRunner | null>(null);
  const probeRef = useRef<AbortController | null>(null);
  const checkedRef = useRef<{ selected: string[]; includeStockfish: boolean } | null>(null);
  const selectedModels = useMemo(() => models.filter((model) => selected.has(model.id)), [models, selected]);
  const store = useTournamentStore(selectedModels);
  const names = useMemo(() => {
    const map = new Map(models.map((model) => [model.id, model.shortName || model.name] as const));
    if (includeStockfish) map.set(STOCKFISH_PARTICIPANT_ID, STOCKFISH_LABEL);
    return map;
  }, [models, includeStockfish]);

  /** Loads decision models once with a five-minute localStorage cache. */
  useEffect(() => {
    let cancelled = false;
    catalogService
      .load()
      .then((result) => {
        if (cancelled) return;
        setModels(result.models);
        const saved = loadSavedSelection();
        if (saved.selected) {
          const known = new Set(result.models.map((model) => model.id));
          const restored = saved.selected.filter((id) => known.has(id));
          setSelected(new Set(restored.length ? restored : [...defaultSelection(result.models)]));
        } else {
          setSelected(defaultSelection(result.models));
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Catalog load failed.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Persists the selection so reloads keep the user's choices. */
  useEffect(() => {
    if (loadingCatalog) return;
    saveSelection(selected);
  }, [selected, loadingCatalog]);

  /** Persists the API key so reloads keep it ready to use. */
  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem(OPENROUTER_KEY_STORAGE_KEY, apiKey);
      else localStorage.removeItem(OPENROUTER_KEY_STORAGE_KEY);
    } catch {
      // Storage quota failures must not break the tournament setup.
    }
  }, [apiKey]);

  /** Toggles one model in the tournament selection. */
  const toggleModel = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Starts the double round-robin tournament across every selected model. */
  const start = useCallback(async () => {
    await runTournament(false);
  }, [apiKey, selected, includeStockfish, models, concurrency, names, store]);

  /** Runs the same tournament with random moves and no OpenRouter calls. */
  const simulate = useCallback(async () => {
    await runTournament(true);
  }, [selected, includeStockfish, concurrency, names, store]);

  /** Probes the selected models on demand without starting a tournament. */
  const check = useCallback(async () => {
    setError(null);
    if (!apiKey.trim() && !includeStockfish) {
      setError("Enter an OpenRouter API key to check model availability.");
      return;
    }
    setRunning(true);
    try {
      await checkAvailability();
    } finally {
      setRunning(false);
    }
  }, [apiKey, selected, includeStockfish, availability]);

  /** Checks whether the current setup already passed availability probing. */
  function isChecked(participantIds: string[]): boolean {
    const snapshot = checkedRef.current;
    if (!snapshot || snapshot.includeStockfish !== includeStockfish) return false;
    if (snapshot.selected.length !== participantIds.filter((id) => id !== STOCKFISH_PARTICIPANT_ID).length) return false;
    return snapshot.selected.every((id) => participantIds.includes(id));
  }

  /** Probes selected models, prunes silent ones, and snapshots the checked setup. */
  async function checkAvailability(): Promise<string[] | null> {
    const candidates = [...selected];
    if (includeStockfish) candidates.push(STOCKFISH_PARTICIPANT_ID);
    if (candidates.length < 2) {
      setError("Select at least two participants to check.");
      return null;
    }
    const probe = new AbortController();
    probeRef.current = probe;
    try {
      setProbeStatus(`Probing ${candidates.length} models…`);
      const results = await probeModels(candidates.filter((id) => id !== STOCKFISH_PARTICIPANT_ID), apiKey.trim(), probe.signal);
      const next = { ...availability };
      for (const [id, ok] of results) next[id] = ok;
      setAvailability(next);
      saveAvailability(next);
      const answering = candidates.filter((id) => id === STOCKFISH_PARTICIPANT_ID || results.get(id));
      const dropped = candidates.filter((id) => id !== STOCKFISH_PARTICIPANT_ID && !results.get(id));
      if (dropped.length) {
        setSelected((previous) => {
          const nextSelected = new Set(previous);
          for (const id of dropped) nextSelected.delete(id);
          return nextSelected;
        });
      }
      if (answering.length < 2) {
        setError("No selected model responded to the probe. Check the API key and try again.");
        return null;
      }
      checkedRef.current = { selected: answering.filter((id) => id !== STOCKFISH_PARTICIPANT_ID), includeStockfish };
      return answering;
    } catch (probeError) {
      if (probeError instanceof DOMException && probeError.name === "AbortError") return null;
      setError(probeError instanceof Error ? probeError.message : "Model probe failed.");
      return null;
    } finally {
      probeRef.current = null;
      setProbeStatus(null);
    }
  }

  /** Executes the tournament; test mode replaces OpenRouter with random moves. */
  async function runTournament(testMode: boolean): Promise<void> {
    setError(null);
    setProbeStatus(null);
    if (!testMode && !apiKey.trim() && !includeStockfish) {
      setError("Enter an OpenRouter API key to play model games.");
      return;
    }
    let participantIds = [...selected];
    if (includeStockfish) participantIds.push(STOCKFISH_PARTICIPANT_ID);
    if (participantIds.length < 2) {
      setError("Select at least two participants for a tournament.");
      return;
    }
    setRunning(true);
    if (!testMode && !isChecked(participantIds)) {
      const checked = await checkAvailability();
      if (!checked) {
        setRunning(false);
        return;
      }
      participantIds = checked;
    }
    const fallbacks = new Map(
      models.flatMap((model) => (model.fallbackId ? [[model.id, model.fallbackId] as const] : [])),
    );
    const decisions = new DecisionsMoveProvider(fallbacks, new Map(Object.entries(choiceLimits)));
    const random = new RandomMoveProvider();
    const stockfishPlayer = includeStockfish ? new StockfishMoveProvider() : null;
    const providers = new Map<string, IMoveProvider>();
    for (const id of participantIds) {
      if (id === STOCKFISH_PARTICIPANT_ID && stockfishPlayer) providers.set(id, stockfishPlayer);
      else providers.set(id, testMode ? random : decisions);
    }
    const pairings = buildDoubleRoundRobin(participantIds);
    const games = pairings.map((pairing, index) => toGames(pairing.whiteId, pairing.blackId, index, names));
    store.reset(games);
    try {
      const runner = new TournamentRunner({
        apiKey: apiKey.trim(),
        providers,
        maxPly: MAX_PLY,
        concurrency,
        emitGame: store.applyGame,
        emitUsage: store.applyUsage,
        emitError: store.reportError,
      });
      runnerRef.current = runner;
      await runner.run(games);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Tournament failed.");
    } finally {
      runnerRef.current = null;
      setRunning(false);
    }
  }

  /** Stops scheduling new moves while preserving completed games. */
  const stop = useCallback(() => {
    probeRef.current?.abort();
    runnerRef.current?.cancel();
  }, []);

  const liveList = useMemo(() => [...store.liveGames.values()], [store.liveGames]);
  const playingList = useMemo(() => liveList.filter((game) => game.status !== "finished"), [liveList]);
  const completedList = useMemo(() => liveList.filter((game) => game.status === "finished"), [liveList]);
  const participantIds = useMemo(() => {
    const ids = models.filter((model) => selected.has(model.id)).map((model) => model.id);
    if (includeStockfish) ids.push(STOCKFISH_PARTICIPANT_ID);
    return ids;
  }, [models, selected, includeStockfish]);
  const unavailableIds = useMemo(
    () => new Set(Object.entries(availability).filter(([, ok]) => !ok).map(([id]) => id)),
    [availability],
  );

  return (
    <div className={`app-layout${sidebarOpen ? "" : " app-layout--collapsed"}`}>
      {!sidebarOpen && (
        <button type="button" className="expand-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
          »
        </button>
      )}
      <aside className="sidebar">
        <div className="brand-row">
          <h1 className="brand">Decisions Chess Tournament</h1>
          <button
            type="button"
            className="collapse-button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            «
          </button>
        </div>
        <p className="brand-sub">LLM benchmark arena. Every model plays every model as White and Black.</p>
        <section>
          <SetupPanel
            models={models}
            selected={selected}
            unavailableIds={unavailableIds}
            limits={choiceLimits}
            apiKey={apiKey}
            includeStockfish={includeStockfish}
            concurrency={concurrency}
            loadingCatalog={loadingCatalog}
            running={running}
            onApiKey={setApiKey}
            onToggleModel={toggleModel}
            onSelectAll={() => setSelected(new Set(models.map((model) => model.id)))}
            onSelectNone={() => setSelected(new Set())}
            onIncludeStockfish={setIncludeStockfish}
            onConcurrency={setConcurrency}
          />
        </section>
        <section className="tournament-section">
          <span className="section-kicker">Prepare</span>
          <div className="tournament-controls">
            <button type="button" className="secondary-button" onClick={() => void check()} disabled={running || loadingCatalog}>
              Check availability
            </button>
            <button type="button" className="secondary-button" onClick={simulate} disabled={running || loadingCatalog}>
              Simulate
            </button>
          </div>
        </section>
        <section className="tournament-section">
          <span className="section-kicker">Tournament</span>
          <div className="tournament-controls">
            <button type="button" className="primary-button" onClick={start} disabled={running || loadingCatalog}>
              {running ? "Running…" : "Start"}
            </button>
            <button type="button" className="danger-button" onClick={stop} disabled={!running}>
              Stop
            </button>
          </div>
          {error && <p className="sidebar-notice--error sidebar-notice">{error}</p>}
          {probeStatus && <p className="sidebar-notice">{probeStatus}</p>}
          {store.lastError && <p className="sidebar-notice--error sidebar-notice">Last move error: {store.lastError}</p>}
        </section>
      </aside>
      <main className="arena">
        <StatsBar usage={store.usage} />
        <section className="panel">
          <h2>Live boards</h2>
          <p className="panel-progress">
            {completedList.length}/{participantIds.length * (participantIds.length - 1)} games finished
          </p>
          {playingList.length ? (
            <div className="games-grid">
              {playingList.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {completedList.length ? "All games finished — results are below." : "Press Start to deal the tournament boards."}
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Completed games</h2>
          {completedList.length ? (
            <div className="history-strip">
              <div className="games-grid--history">
                {completedList.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            </div>
          ) : (
            <p className="empty-state">Finished games appear here as small cards.</p>
          )}
        </section>
        <section className="panel">
          <h2>Leaderboard</h2>
          <Leaderboard rows={store.leaderboard} />
        </section>
        <section className="panel">
          <h2>Head to head</h2>
          <HeadToHead games={store.finishedGames} ids={participantIds} names={names} />
        </section>
      </main>
    </div>
  );
}
