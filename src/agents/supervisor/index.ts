/** Диспетчер. Єдиний агент, у списку прав якого стоять інші агенти —
 *  саме це робить топологію супервізорною, а не мережевою. */
import type { AgentSpec } from "../types.js";
import { SUPERVISOR_PROMPT } from "./prompt.js";

export const supervisorAgent: AgentSpec = {
  name: "supervisor",
  prompt: SUPERVISOR_PROMPT,
  canCall: ["retriever_agent", "calc_agent", "api_agent"],
  description: "Диспетчер служби підтримки.",
  arg: "question",
};
