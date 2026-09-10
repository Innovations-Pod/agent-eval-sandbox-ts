/** Точка складання системи (composition root).
 *
 * Реалізація циклу — LangGraph (`src/runtime/`). Реєстр агентів, промпти та
 * інструменти живуть окремо в `src/agents/` і про фреймворк не знають:
 * саме тому заміна рантайму не зачепила жодного оголошення агента.
 */
export { AGENTS, ENTRY_POINT, LEAF_TOOLS, topology } from "./agents/index.js";
export { RunResult, type RunOutput, type Step } from "./agents/result.js";
export type {
  AgentSpec, LeafKind, LeafTool, PlainTool, RetrievedDoc, RetrieverTool,
} from "./agents/types.js";
export { buildAgentTree } from "./runtime/index.js";
export { MultiAgentSystem } from "./runtime/run.js";
