/** Arithmetic agent. The boundary is deliberate: the model writes the expression, the code evaluates it. */
import type { AgentSpec, LeafTool } from "../types.js";
import { CALC_PROMPT } from "./prompt.js";
import { calcTool } from "./tools/calc.js";

export const calcAgent: AgentSpec = {
  name: "calc_agent",
  prompt: CALC_PROMPT,
  canCall: [calcTool.name],
  description: "Arithmetic sub-agent. Pass a task whose rates are already known.",
  arg: "task",
};

export const calcTools: LeafTool[] = [calcTool];
export { calc } from "./tools/calc.js";
