// Requests single chess moves from OpenRouter decision models via the alpha API.
import { Chess } from "chess.js";
import { MOVE_TIMEOUT_MS, OPENROUTER_DECISIONS_URL } from "../config/constants.js";
import { applyUci } from "../chess/prompt.js";
import type { IMoveProvider, MoveRequest, MoveResult } from "./interfaces.js";

interface DecisionsAnswer {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

interface DecisionsResponse {
  answers?: Record<string, DecisionsAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
}

/** Reads the route's choice limit from a candidate-count validation error. */
function parseRouteLimit(message: string): number | null {
  const singleToken = /(\d+)\s+candidates\s+exceed[^\d]*(\d+)\s+single-token\s+labels/.exec(message);
  const ranged = /needs\s+between\s+2\s+and\s+(\d+)\s+options\s+per\s+question/.exec(message);
  const raw = singleToken?.[2] ?? ranged?.[1];
  if (!raw) return null;
  const limit = Number(raw);
  return Number.isFinite(limit) && limit > 1 ? limit : null;
}

/** Provides tournament moves through the OpenRouter decisions endpoint. */
export class DecisionsMoveProvider implements IMoveProvider {
  readonly id = "decisions";
  private readonly choiceLimits = new Map<string, number>([["upstage/solar-decide-flash", 26]]);

  /** Creates a move provider that retries unknown slugs with their catalog fallback ids. */
  constructor(
    private readonly fallbackIds: Map<string, string> = new Map(),
    limits: Map<string, number> = new Map(),
  ) {
    for (const [modelId, limit] of limits) this.choiceLimits.set(modelId, limit);
  }

  /** Requests one legal move, retrying once before falling back to a random move. */
  async requestMove(request: MoveRequest, signal: AbortSignal): Promise<MoveResult> {
    const started = performance.now();
    if (request.legalMoves.length === 1) {
      const forced = request.legalMoves[0]!;
      const { san, fenAfter } = applyUci(request.fen, forced);
      return {
        record: {
          color: request.color,
          modelId: request.modelId,
          uci: forced,
          san,
          fenBefore: request.fen,
          fenAfter,
          latencyMs: performance.now() - started,
          fallback: false,
          rawText: `forced move: ${forced} (only legal move, no API call)`,
        },
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0, ok: true },
        error: null,
      };
    }
    let rawText = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let fallback = false;
    let succeeded = false;
    let uci = request.legalMoves[0]!;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const decision = await this.decide(request, signal);
        rawText = decision.summary;
        promptTokens += decision.promptTokens;
        completionTokens += decision.completionTokens;
        costUsd += decision.costUsd;
        succeeded = true;
        if (request.legalMoves.includes(decision.choice)) {
          uci = decision.choice;
          fallback = false;
          lastError = null;
        } else {
          const resolved = request.legalMoves[Math.floor(Math.random() * request.legalMoves.length)]!;
          uci = resolved;
          fallback = true;
          lastError = `Model chose an illegal option (${decision.choice}); random legal move used.`;
        }
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Decisions request failed.";
        if (attempt === 1 || signal.aborted) {
          uci = request.legalMoves[Math.floor(Math.random() * request.legalMoves.length)]!;
          fallback = true;
        }
      }
    }

    const { san, fenAfter } = applyUci(request.fen, uci);
    return {
      record: {
        color: request.color,
        modelId: request.modelId,
        uci,
        san,
        fenBefore: request.fen,
        fenAfter,
        latencyMs: performance.now() - started,
        fallback,
        rawText: rawText || lastError || "",
      },
      usage: { promptTokens, completionTokens, costUsd, ok: succeeded },
      error: lastError,
    };
  }

  /** Asks the model to choose one legal UCI move from the current position. */
  private async decide(
    request: MoveRequest,
    signal: AbortSignal,
  ): Promise<{ choice: string; summary: string; promptTokens: number; completionTokens: number; costUsd: number }> {
    const fallback = this.fallbackIds.get(request.modelId);
    const candidates = fallback && fallback !== request.modelId ? [request.modelId, fallback] : [request.modelId];
    let lastError: Error | null = null;
    for (const modelId of candidates) {
      try {
        return await this.chooseMove(request, modelId, signal);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error("Decisions request failed.");
        if (!failure.message.startsWith("OpenRouter 404")) throw failure;
        lastError = failure;
      }
    }
    throw lastError ?? new Error("Decisions request failed.");
  }

  /** Selects a move directly or through group playoffs when options exceed the route limit. */
  private async chooseMove(
    request: MoveRequest,
    modelId: string,
    signal: AbortSignal,
  ): Promise<{ choice: string; summary: string; promptTokens: number; completionTokens: number; costUsd: number }> {
    return this.chooseWithLimit(request, modelId, signal, this.choiceLimits.get(request.modelId) ?? Number.POSITIVE_INFINITY);
  }

  /** Asks one question per group, learning the route limit from validation errors. */
  private async chooseWithLimit(
    request: MoveRequest,
    modelId: string,
    signal: AbortSignal,
    limit: number,
  ): Promise<{ choice: string; summary: string; promptTokens: number; completionTokens: number; costUsd: number }> {
    try {
      if (request.legalMoves.length <= limit) {
        const result = await this.post(request, modelId, [{ key: "move", options: request.legalMoves }], signal);
        const choice = result.choices["move"] ?? "";
        if (!choice) throw new Error("Decisions response contained no choice.");
        return { ...result.total, choice, summary: `decisions choice: ${choice}` };
      }
      return await this.playoff(request, modelId, signal, limit);
    } catch (error) {
      const routeLimit = error instanceof Error ? parseRouteLimit(error.message) : null;
      if (routeLimit === null || routeLimit >= limit) throw error;
      this.choiceLimits.set(request.modelId, routeLimit);
      return this.chooseWithLimit(request, modelId, signal, routeLimit);
    }
  }

  /** Runs group playoffs when a single question cannot hold every legal move. */
  private async playoff(
    request: MoveRequest,
    modelId: string,
    signal: AbortSignal,
    limit: number,
  ): Promise<{ choice: string; summary: string; promptTokens: number; completionTokens: number; costUsd: number }> {
    let contenders = [...request.legalMoves];
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let round = 0;
    while (contenders.length > limit) {
      const groups: string[][] = [];
      const fullGroups = Math.floor(contenders.length / limit);
      for (let index = 0; index < fullGroups; index++) groups.push(contenders.slice(index * limit, (index + 1) * limit));
      const remainder = contenders.slice(fullGroups * limit);
      const bye = remainder.length === 1 ? remainder[0]! : null;
      if (remainder.length > 1) groups.push(remainder);
      const stage = await this.post(
        request,
        modelId,
        groups.map((options, index) => ({ key: `round${round}_group${index}`, options })),
        signal,
      );
      promptTokens += stage.total.promptTokens;
      completionTokens += stage.total.completionTokens;
      costUsd += stage.total.costUsd;
      const winners = groups.map((options, index) => {
        const pick = stage.choices[`round${round}_group${index}`];
        if (pick && options.includes(pick)) return pick;
        return options[Math.floor(Math.random() * options.length)]!;
      });
      contenders = bye ? [...winners, bye] : winners;
      round++;
    }
    const final = await this.post(request, modelId, [{ key: "move", options: contenders }], signal);
    const choice = final.choices["move"] ?? "";
    if (!choice) throw new Error("Decisions response contained no choice.");
    return {
      choice,
      summary: `decisions playoff choice: ${choice}`,
      promptTokens: promptTokens + final.total.promptTokens,
      completionTokens: completionTokens + final.total.completionTokens,
      costUsd: costUsd + final.total.costUsd,
    };
  }

  /** Posts choice questions to the decisions endpoint and parses every answer. */
  private async post(
    request: MoveRequest,
    modelId: string,
    groups: { key: string; options: string[] }[],
    signal: AbortSignal,
  ): Promise<{
    choices: Record<string, string | undefined>;
    total: { promptTokens: number; completionTokens: number; costUsd: number };
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MOVE_TIMEOUT_MS);
    const onAbort = (): void => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const chess = new Chess(request.fen);
      const sanByUci = new Map(
        chess.moves({ verbose: true }).map((move) => [`${move.from}${move.to}${move.promotion ?? ""}`, move.san]),
      );
      const side = chess.turn() === "w" ? "White" : "Black";
      const questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, string> }> = {};
      const fullCriteria: Record<string, string> = {};
      for (const { key, options } of groups) {
        const criteria: Record<string, string> = {};
        for (const option of options) {
          const label = `${option}${sanByUci.get(option) ? ` (${sanByUci.get(option)})` : ""}`;
          criteria[option] = label;
          fullCriteria[option] = label;
        }
        questions[key] = {
          type: "choice",
          instructions:
            "Select exactly one legal move that gives the side to move the best winning chances. Consider checks, captures, threats, king safety and material.",
          criteria,
        };
      }
      const response = await fetch(OPENROUTER_DECISIONS_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${request.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: modelId,
          state: `Choose the strongest chess move for ${side} to play.\nFEN: ${request.fen}\nLegal moves (UCI: SAN): ${JSON.stringify(fullCriteria)}`,
          questions,
        }),
      });
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`.slice(0, 300));
      const payload = (await response.json()) as DecisionsResponse;
      const choices: Record<string, string | undefined> = {};
      for (const { key } of groups) {
        const answer = payload.answers?.[key];
        choices[key] = answer?.type === "choice" ? answer.choice : undefined;
      }
      return {
        choices,
        total: {
          promptTokens: payload.usage?.input_tokens ?? 0,
          completionTokens: payload.usage?.output_tokens ?? 0,
          costUsd: payload.usage?.cost ?? 0,
        },
      };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    }
  }
}
