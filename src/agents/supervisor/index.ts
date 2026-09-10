/** The dispatcher. The only agent whose permission list holds other agents —
 *  that is exactly what makes the topology a supervisor rather than a mesh. */
import type { AgentSpec } from "../types.js";
import { SUPERVISOR_PROMPT } from "./prompt.js";

export const supervisorAgent: AgentSpec = {
  name: "supervisor",
  prompt: SUPERVISOR_PROMPT,
  canCall: ["retriever_agent", "calc_agent", "api_agent"],
  description: "Support desk dispatcher.",
  arg: "question",
};
