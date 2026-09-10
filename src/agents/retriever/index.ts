/** Агент пошуку по базі знань. */
import type { AgentSpec, LeafTool } from "../types.js";
import { RETRIEVER_PROMPT } from "./prompt.js";
import { searchDocsTool } from "./tools/search-docs.js";

export const retrieverAgent: AgentSpec = {
  name: "retriever_agent",
  prompt: RETRIEVER_PROMPT,
  canCall: [searchDocsTool.name],
  description: "Суб-агент пошуку по базі знань: тарифи, SLA, повернення, політики.",
  arg: "question",
};

export const retrieverTools: LeafTool[] = [searchDocsTool];
export { CHUNKS, RETRIEVERS, activeRetriever } from "./tools/search-docs.js";
export { fuse, type Fusion } from "./tools/hybrid.js";
