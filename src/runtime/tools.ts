/** Міст між нашими інструментами й LangChain.
 *
 * Zod-схеми переїжджають без змін — саме тому union `LeafTool` і тримає схему
 * як `z.ZodObject`, а не як готовий JSON. Один опис, два споживачі.
 */
import { tool } from "@langchain/core/tools";

import { LEAF_TOOLS } from "../agents/index.js";
import type { LeafTool } from "../agents/index.js";

const asLangChainTool = (leaf: LeafTool) =>
  tool(async (args: Record<string, unknown>) => await leaf.run(args), {
    name: leaf.name,
    description: leaf.description,
    schema: leaf.input,
  });

export type GraphTool = ReturnType<typeof asLangChainTool>;

export const langchainTools = (names: readonly string[]): GraphTool[] =>
  names.map((n) => LEAF_TOOLS[n]).filter((t): t is LeafTool => Boolean(t)).map(asLangChainTool);
