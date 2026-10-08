// Probes decision models with a minimal choice request before tournaments start.
import { MOVE_TIMEOUT_MS, OPENROUTER_DECISIONS_URL } from "../config/constants.js";

const PROBE_STATE = "Choose the strongest chess move for White to play.\nFEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\nLegal moves (UCI: SAN): {\"e2e4\":\"e4\",\"d2d4\":\"d4\"}";
const PROBE_INSTRUCTIONS =
  "Select exactly one legal move that gives the side to move the best winning chances. Consider checks, captures, threats, king safety and material.";

/** Sends one minimal two-choice request to check whether a model answers. */
export async function probeModel(modelId: string, apiKey: string, signal: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MOVE_TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(OPENROUTER_DECISIONS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: modelId,
        state: PROBE_STATE,
        questions: { move: { type: "choice", instructions: PROBE_INSTRUCTIONS, criteria: { e2e4: "e4", d2d4: "d4" } } },
      }),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { answers?: { move?: { type?: string; choice?: unknown } } };
    return payload.answers?.move?.type === "choice" && typeof payload.answers.move.choice === "string";
  } catch {
    if (signal.aborted) throw new DOMException("Probe canceled.", "AbortError");
    return false;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
  }
}

/** Probes every candidate concurrently and returns per-model availability. */
export async function probeModels(modelIds: string[], apiKey: string, signal: AbortSignal): Promise<Map<string, boolean>> {
  const entries = await Promise.all(
    modelIds.map(async (id) => [id, await probeModel(id, apiKey, signal)] as const),
  );
  return new Map(entries);
}
