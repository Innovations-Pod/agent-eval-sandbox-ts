/** The composition root of the system.
 *
 * The loop is implemented by LangGraph (`src/runtime/`). The agent registry, the prompts
 * and the tools live separately in `src/agents/` and know nothing of the framework:
 * that is precisely why replacing the runtime touched not one agent declaration.
 */
export { AGENTS, ENTRY_POINT, LEAF_TOOLS, topology } from "./agents/index.js";
export { RunResult, type RunOutput, type Step } from "./agents/result.js";
export type {
  AgentSpec, LeafKind, LeafTool, PlainTool, RetrievedDoc, RetrieverTool,
} from "./agents/types.js";
export { buildAgentTree } from "./runtime/index.js";
export { MultiAgentSystem } from "./runtime/run.js";
