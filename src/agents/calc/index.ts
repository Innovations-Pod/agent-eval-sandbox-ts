/** Обчислювальний агент. Межа проведена свідомо: модель складає вираз, рахує код. */
import type { AgentSpec, LeafTool } from "../types.js";
import { CALC_PROMPT } from "./prompt.js";
import { calcTool } from "./tools/calc.js";

export const calcAgent: AgentSpec = {
  name: "calc_agent",
  prompt: CALC_PROMPT,
  canCall: [calcTool.name],
  description: "Суб-агент обчислень. Передавай задачу з уже відомими ставками.",
  arg: "task",
};

export const calcTools: LeafTool[] = [calcTool];
export { calc } from "./tools/calc.js";
