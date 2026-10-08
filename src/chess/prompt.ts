// Builds deterministic chess prompts and parses model output into legal UCI moves.
import { Chess } from "chess.js";

/** Creates the system instruction that forces single-UCI-move output. */
export function buildSystemPrompt(): string {
  return [
    "You are a chess engine playing a tournament game.",
    "Reply with exactly one legal move in UCI format (e.g. e2e4, g1f3, e7e8q).",
    "No explanation, no punctuation, no extra text.",
  ].join(" ");
}

/** Creates the user message describing the current position and legal options. */
export function buildUserPrompt(fen: string, pgn: string, legalMoves: string[], color: string, moveNumber: number): string {
  const shortPgn = pgn.length > 2000 ? pgn.slice(-2000) : pgn;
  return [
    `You play ${color} on move ${moveNumber}.`,
    `FEN: ${fen}`,
    `PGN so far: ${shortPgn || "(empty board, White to move)"}`,
    `Legal UCI moves: ${legalMoves.join(", ")}`,
    "Your move:",
  ].join("\n");
}

/** Extracts the first UCI-like token from free-form model text. */
export function extractUci(text: string): string | null {
  const match = /([a-h][1-8][a-h][1-8][qrbn]?)/i.exec(text.replace(/\s+/g, ""));
  return match?.[1]?.toLowerCase() ?? null;
}

/** Resolves raw text to a legal UCI move, preferring exact matches. */
export function resolveLegalMove(rawText: string, legalMoves: string[], fen: string): { uci: string; fallback: boolean } {
  const direct = extractUci(rawText);
  if (direct && legalMoves.includes(direct)) return { uci: direct, fallback: false };
  const chess = new Chess(fen);
  for (const verbose of chess.moves({ verbose: true })) {
    if (rawText.toLowerCase().includes(verbose.san.toLowerCase().replace(/[+#]/g, ""))) {
      const uci = `${verbose.from}${verbose.to}${verbose.promotion ?? ""}`;
      if (legalMoves.includes(uci)) return { uci, fallback: false };
    }
  }
  const random = legalMoves[Math.floor(Math.random() * legalMoves.length)]!;
  return { uci: random, fallback: true };
}

/** Applies a UCI move to a FEN and returns SAN plus the resulting FEN. */
export function applyUci(fen: string, uci: string): { san: string; fenAfter: string } {
  const chess = new Chess(fen);
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
  return { san: move.san, fenAfter: chess.fen() };
}
