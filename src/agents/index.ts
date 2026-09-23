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
import { soloAgent } from "./solo/index.js";
import { supervisorAgent } from "./supervisor/index.js";

/**
 * Which wiring to assemble: the same agents, different permission lists — nothing else
 * changes, the runtime included. `supervisor` is the system itself; the other two exist
 * to measure what a topology costs, and are chosen with TOPOLOGY=...
 *   solo  — one agent holding every tool: the baseline a multi-agent system must beat;
 *   cycle — the workers may also call each other, which makes the graph cyclic.
 */
const TOPOLOGIES: Record<string, AgentSpec[]> = {
  supervisor: [supervisorAgent, retrieverAgent, calcAgent, apiAgent],
  solo: [soloAgent],
  cycle: [
    supervisorAgent,
    { ...retrieverAgent, canCall: [...retrieverAgent.canCall, "calc_agent"] },
    { ...calcAgent, canCall: [...calcAgent.canCall, "retriever_agent"] },
    apiAgent,
  ],
};

export const TOPOLOGY = process.env.TOPOLOGY ?? "supervisor";
const chosen = TOPOLOGIES[TOPOLOGY];
if (!chosen) {
  throw new Error(`unknown TOPOLOGY "${TOPOLOGY}": expected ${Object.keys(TOPOLOGIES).join(", ")}`);
}

export const AGENTS: Record<string, AgentSpec> = byName("agent", chosen);
export const LEAF_TOOLS: Record<string, LeafTool> = byName("tool", [
  ...retrieverTools,
  ...calcTools,
  ...apiTools,
]);

/** The first agent of the chosen topology receives the question. */
export const ENTRY_POINT = chosen[0]!.name;

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
