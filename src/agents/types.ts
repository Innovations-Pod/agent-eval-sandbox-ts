/** The types that describe agents and tools. Nothing concrete here. */
import type { z } from "zod";

/** One retrieved document, in OpenInference terms. */
export interface RetrievedDoc {
  id: string;
  content: string;
  score: number;
}

/** The part shared by every leaf of the execution tree. */
interface LeafToolBase {
  name: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  /** May be sync or async — vector search waits on a model, the calculator
   *  waits on nothing. The runtime awaits either way. */
  run: (args: Record<string, unknown>) => string | Promise<string>;
}

/** An ordinary deterministic function. */
export interface PlainTool extends LeafToolBase {
  kind: "tool";
}

/** Document search. A separate kind, because Phoenix annotates it differently
 *  and can compute retrieval metrics from it. */
export interface RetrieverTool extends LeafToolBase {
  kind: "retriever";
  /** What to show as the span input — the query itself, not the argument JSON. */
  query: (args: Record<string, unknown>) => string;
  /** How to parse the result into documents. */
  documents: (out: string) => RetrievedDoc[];
}

/**
 * A tagged union rather than a boolean with optional fields: `query` and `documents`
 * exist exactly when kind === "retriever", and the compiler knows it. That is why the
 * runtime carries neither flags nor `!`.
 */
export type LeafTool = PlainTool | RetrieverTool;

/** The same string as in Step.kind — they match on purpose. */
export type LeafKind = LeafTool["kind"];

/** A node of the execution tree: a prompt plus call permissions. */
export interface AgentSpec {
  readonly name: string;
  readonly prompt: string;
  /**
   * TOPOLOGY: who this agent is allowed to call. The list may hold both tools and
   * other agents — to the caller they are indistinguishable (the Composite pattern),
   * which is why there is one list and one shared namespace.
   */
  readonly canCall: readonly string[];
  /** How the agent looks to whoever calls it. */
  readonly description: string;
  /** The name of the single argument in its schema. */
  readonly arg: string;
}
