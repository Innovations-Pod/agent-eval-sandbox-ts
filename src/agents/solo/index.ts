/** One agent with every tool — the baseline a multi-agent system has to beat.
 *  The same policy as the dispatcher's, only the routes lead straight to tools. */
import type { AgentSpec } from "../types.js";
import { SOLO_PROMPT } from "./prompt.js";

export const soloAgent: AgentSpec = {
  name: "solo_agent",
  prompt: SOLO_PROMPT,
  // Names, not imports: the tools belong to other folders. validateRegistry checks them.
  canCall: ["search_docs", "calc", "get_shipment", "get_customer"],
  description: "Single support agent with every tool.",
  arg: "question",
};
