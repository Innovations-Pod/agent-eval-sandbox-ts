/** The agent registry — and the only place the TOPOLOGY is written down.
 *
 * To add an agent: create a folder modelled on its neighbours and add two lines here.
 * Nothing in `src/runtime/` changes.
 */
import type { AgentSpec, LeafTool } from "./types.js";
import { byName, validateRegistry } from "./registry.js";
import { apiAgent, apiTools } from "./api/index.js";
import { calcAgent, calcTools } from "./calc/index.js";
import { retrieverAgent, retrieverTools } from "./retriever/index.js";
import { supervisorAgent } from "./supervisor/index.js";

export const AGENTS: Record<string, AgentSpec> = byName("agent", [
  supervisorAgent,
  retrieverAgent,
  calcAgent,
  apiAgent,
]);

export const LEAF_TOOLS: Record<string, LeafTool> = byName("tool", [
  ...retrieverTools,
  ...calcTools,
  ...apiTools,
]);

export const ENTRY_POINT = "supervisor";

// Runs on module import — that is, before the first request to the model.
validateRegistry(AGENTS, LEAF_TOOLS);

export * from "./types.js";
export { RunResult, type RunOutput, type Step } from "./result.js";

/** The graph of links between agents only — with no tool leaves. */
export function topology(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(AGENTS).map(([name, spec]) => [name, spec.canCall.filter((t) => t in AGENTS)]),
  );
}
