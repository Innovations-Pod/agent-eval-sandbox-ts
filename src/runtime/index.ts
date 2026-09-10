/** Running agents. The implementation is `createAgent` from the `langchain` package.
 *
 * This used to be `createReactAgent` from `@langchain/langgraph/prebuilt` — it was
 * deprecated and moved into `langchain` under a new name; two parameters were renamed
 * along the way: `llm` → `model`, `prompt` → `systemPrompt`.
 *
 * The folder is named after the role rather than the framework: when the runtime changes
 * again one day, the name will still be true. It used to be called `graph/`, after the
 * internal LangGraph abstraction we do not even touch: we build no StateGraph of our own
 * and add neither nodes nor edges.
 *
 * The topology comes from the `src/agents/` registry — prompts, permissions and tools
 * are not duplicated.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { createAgent } from "langchain";
import { z } from "zod";

import { AGENTS, ENTRY_POINT } from "../agents/index.js";
import { contentText } from "./recorder.js";
import { AGENT_MODEL } from "../config.js";
import type { AgentSpec } from "../agents/index.js";
import { langchainTools } from "./tools.js";

const model = (): ChatAnthropic =>
  new ChatAnthropic({ model: AGENT_MODEL, maxTokens: 4096 });

type Agent = ReturnType<typeof createAgent>;

/** A sub-agent wrapped into a tool for its parent — the same Composite, except the
 *  loop inside is turned by LangGraph rather than by us.
 *
 *  The ready-made `createSupervisor` from `@langchain/langgraph-supervisor` does exactly
 *  this, but through handoff: control is HANDED OVER to the sub-agent and the tools are
 *  named `transfer_to_*`. We checked — the trajectory becomes
 *  `transfer_to_retriever_agent → …` instead of our agents' names, and the whole dataset
 *  with its `expectedTrajectory` has to be rewritten. Plus three crutches: a type cast,
 *  setting `name` by hand, and incompatibility with `createAgent` from langchain v1.
 *
 *  The built-in `Runnable.asTool({ name, description, schema })` does not fit either.
 *  The idea was good — a chain of `argument → messages` ▸ agent ▸ `last message → text`,
 *  and then the config is threaded through by itself. But `createAgent` from langchain v1
 *  returns a `ReactAgent`, which is not a Runnable, neither for the types nor at runtime:
 *  `.pipe()` fails with `Expected a Runnable, function or object`.
 *  So it cannot be embedded in a chain — calling `.invoke()` by hand is what is left.
 */
function asTool(get: () => Agent, spec: AgentSpec) {
  /** Calls the nested agent and returns its summary as text.
   *
   *  `config` must be passed through: without it, callbacks and tracing never reach the
   *  sub-agent and its steps vanish from the trajectory.
   *
   *  The agent is taken via `get()` rather than by value: the topology may contain a cycle
   *  (A calls B, B calls A), and then at the moment this tool is assembled the second agent
   *  does not exist yet. Lazy resolution removes the question of assembly order. */
  const run = async (args: Record<string, unknown>, config?: unknown) => {
    const task = String(args[spec.arg] ?? "");
    const { messages } = await get().invoke({ messages: [new HumanMessage(task)] }, config as never);
    return contentText(messages.at(-1)?.content);
  };

  // The type is deliberately wide: otherwise the schema narrows to Record<string, string>
  // and an array mixing agent tools with plain ones stops unifying.
  const schema: z.ZodObject<z.ZodRawShape> = z.object({
    [spec.arg]: z.string().describe("Task for the sub-agent"),
  });

  return tool(run, { name: spec.name, description: spec.description, schema });
}

/** Assembles the system from the registry.
 *
 * Each agent gets exactly what its `canCall` says — agents and tools, in any combination.
 * Two layers used to be hard-wired here: the entry point calls only agents, the workers
 * only tools. Anything that did not fit that shape disappeared silently — the registry
 * let the name through and the assembler threw it away.
 */
export function buildAgentTree(): Agent {
  const llm = model();
  const agents = new Map<string, Agent>();

  for (const spec of Object.values(AGENTS)) {
    const tools = spec.canCall.flatMap((name) =>
      name in AGENTS ? [asTool(() => agents.get(name)!, AGENTS[name]!)] : langchainTools([name]),
    );
    agents.set(spec.name, createAgent({
      model: llm,
      tools,
      systemPrompt: spec.prompt,
      name: spec.name,
    }));
  }

  return agents.get(ENTRY_POINT)!;
}
