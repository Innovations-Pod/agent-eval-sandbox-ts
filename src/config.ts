/** Sandbox config: models, prices, Phoenix endpoint. */
import "dotenv/config";

export const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5";
export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-opus-5";
export const PHOENIX_ENDPOINT =
  process.env.PHOENIX_COLLECTOR_ENDPOINT ?? "http://localhost:6006";
export const PROJECT_NAME = process.env.PHOENIX_PROJECT_NAME ?? "mas-sandbox-ts";

/** Claude API prices, USD per 1M tokens [input, output] — as of 2026-06. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5": [5.0, 25.0],
  "claude-sonnet-5": [2.0, 10.0],
  "claude-haiku-4-5": [1.0, 5.0],
  fake: [0, 0],
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [inp, out] = PRICES[model] ?? [0, 0];
  return (inputTokens / 1_000_000) * inp + (outputTokens / 1_000_000) * out;
}

export const hasApiKey = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);
