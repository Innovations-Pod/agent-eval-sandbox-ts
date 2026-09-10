/** Реєстр агентів — і єдине місце, де записана ТОПОЛОГІЯ.
 *
 * Додати агента: створити теку за зразком сусідніх і дописати сюди два рядки.
 * Нічого в `src/runtime/` при цьому не змінюється.
 */
import type { AgentSpec, LeafTool } from "./types.js";
import { byName, validateRegistry } from "./registry.js";
import { apiAgent, apiTools } from "./api/index.js";
import { calcAgent, calcTools } from "./calc/index.js";
import { retrieverAgent, retrieverTools } from "./retriever/index.js";
import { supervisorAgent } from "./supervisor/index.js";

export const AGENTS: Record<string, AgentSpec> = byName("агента", [
  supervisorAgent,
  retrieverAgent,
  calcAgent,
  apiAgent,
]);

export const LEAF_TOOLS: Record<string, LeafTool> = byName("інструмент", [
  ...retrieverTools,
  ...calcTools,
  ...apiTools,
]);

export const ENTRY_POINT = "supervisor";

// Виконується на імпорті модуля — тобто до першого запиту до моделі.
validateRegistry(AGENTS, LEAF_TOOLS);

export * from "./types.js";
export { RunResult, type RunOutput, type Step } from "./result.js";

/** Граф зв'язків лише між агентами — без листків-інструментів. */
export function topology(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(AGENTS).map(([name, spec]) => [name, spec.canCall.filter((t) => t in AGENTS)]),
  );
}
