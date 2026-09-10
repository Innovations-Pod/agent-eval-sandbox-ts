/** Collecting the events of a run. There is no OpenTelemetry here — only data.
 *
 * Spans are built afterwards, in one synchronous pass (`emitSpans`). Creating them
 * straight from the callbacks failed: LangChain callbacks arrive from different async
 * contexts and the parent context never reaches them — spans came out either orphaned
 * or pointing at a parent that does not exist.
 */
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { BaseMessage } from "@langchain/core/messages";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";

import { AGENTS, LEAF_TOOLS } from "../agents/index.js";
import { AGENT_MODEL } from "../config.js";
import type { RetrievedDoc, Step } from "../agents/index.js";

export interface ChatMessage {
  role: string;
  content: string;
  toolCalls?: { name: string; args: unknown }[];
}

export interface Event {
  id: string;
  parent?: string;
  name: string;
  kind: "agent" | "tool" | "retriever" | "llm";
  start: number;
  end: number;
  input: string;
  output: string;
  docs: RetrievedDoc[];
  inputTokens: number;
  outputTokens: number;
  /** Filled in only for model calls — without it Phoenix cannot compute cost. */
  model?: string;
  /** The conversation sent to the model, and what it answered. */
  inputMessages?: ChatMessage[];
  outputMessage?: ChatMessage;
}

/**
 * Message content is sometimes an array of blocks (text, tool_use, tool_result), and
 * `String(content)` on that gives “[object Object],[object Object]” — which is exactly
 * what Phoenix used to show. We unfold the blocks into readable text.
 */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);
  return content
    .map((block) => {
      const b = block as Record<string, unknown>;
      // The model's thinking is not part of the answer: noise in the trace, and in
      // `answer` simply untrue, because it crowds out the real text.
      if (b.type === "thinking" || b.type === "redacted_thinking") return "";
      if (typeof b.text === "string") return b.text;
      if (b.type === "tool_use") {
        return `→ call ${String(b.name)}(${JSON.stringify(b.input ?? {})})`;
      }
      if (b.type === "tool_result") return `← ${contentText(b.content)}`;
      return JSON.stringify(b);
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * The callbacks hand back a `ToolMessage`, not a string. `JSON.stringify` on it gives
 * LangChain's serialised envelope (`{"lc":1,"type":"constructor",...}`) rather than the
 * tool's result — and then document parsing quietly fails and the span gets internal
 * clutter instead of the answer.
 */
function textOf(output: unknown): string {
  if (typeof output === "string") return output;
  const content = (output as { content?: unknown } | null)?.content;
  if (content !== undefined) return contentText(content);
  const kwargs = (output as { kwargs?: { content?: unknown } } | null)?.kwargs?.content;
  if (typeof kwargs === "string") return kwargs;
  return JSON.stringify(output);
}

export class RunRecorder extends BaseCallbackHandler {
  name = "run-recorder";

  constructor(private readonly question: string) {
    super();
  }

  readonly events: Event[] = [];
  readonly retrieved: string[] = [];
  inputTokens = 0;
  outputTokens = 0;

  private byId = new Map<string, Event>();
  /** runId of a framework node → runId of the nearest meaningful ancestor. */
  private passthrough = new Map<string, string | undefined>();

  /** The nearest ancestor we keep in the tree. */
  private parentOf(runId?: string): string | undefined {
    let p = runId;
    while (p && !this.byId.has(p)) p = this.passthrough.get(p);
    return p;
  }

  private open(
    id: string, parentRunId: string | undefined, name: string, kind: Event["kind"], input: string,
  ): void {
    const ev: Event = {
      id, parent: this.parentOf(parentRunId), name, kind,
      start: Date.now(), end: Date.now(), input, output: "",
      docs: [], inputTokens: 0, outputTokens: 0,
    };
    this.events.push(ev);
    this.byId.set(id, ev);
  }

  /**
   * Chains. Sub-agents arrive here twice — as the parent's tool and as a chain of
   * their own, so we take them in `handleToolStart` to avoid duplicating them.
   * There is one exception: the ROOT agent (the supervisor). Nobody calls it as a
   * tool — it is the graph, so this is the only chance to create a span for it.
   */
  override async handleChainStart(
    _c: Serialized, _i: unknown, runId: string, parentRunId?: string,
    _t?: string[], _m?: Record<string, unknown>, _ty?: string, runName?: string,
  ): Promise<void> {
    const isRootAgent = parentRunId === undefined && runName !== undefined && runName in AGENTS;
    if (isRootAgent) {
      this.open(runId, undefined, runName, "agent", this.question);
      return;
    }
    this.passthrough.set(runId, parentRunId);
  }

  override async handleChainEnd(output: unknown, runId: string): Promise<void> {
    const ev = this.byId.get(runId);
    if (!ev) return;
    ev.end = Date.now();
    if (!ev.output) {
      const msgs = (output as { messages?: unknown[] })?.messages;
      ev.output = msgs?.length ? textOf(msgs.at(-1)) : textOf(output);
    }
  }

  // ---- tools and sub-agents
  override async handleToolStart(
    _t: Serialized, input: string, runId: string, parentRunId?: string,
    _tags?: string[], _meta?: Record<string, unknown>, runName?: string,
  ): Promise<void> {
    const name = runName ?? "unknown";
    const leaf = LEAF_TOOLS[name];
    const kind: Event["kind"] = name in AGENTS ? "agent" : (leaf?.kind ?? "tool");
    let shown = input;
    if (leaf?.kind === "retriever") {
      try { shown = leaf.query(JSON.parse(input) as Record<string, unknown>); } catch { /* leave as is */ }
    }
    this.open(runId, parentRunId, name, kind, shown);
  }

  override async handleToolEnd(output: unknown, runId: string): Promise<void> {
    const ev = this.byId.get(runId);
    if (!ev) return;
    ev.end = Date.now();
    ev.output = textOf(output);

    const leaf = LEAF_TOOLS[ev.name];
    if (leaf?.kind === "retriever" && !ev.output.startsWith("ERROR")) {
      try {
        ev.docs = leaf.documents(ev.output);
        this.retrieved.push(...ev.docs.map((d) => d.content));
      } catch { /* wrong format — telemetry must not bring the run down */ }
    }
  }

  override async handleToolError(err: unknown, runId: string): Promise<void> {
    const ev = this.byId.get(runId);
    if (ev) { ev.end = Date.now(); ev.output = `ERROR: ${String(err)}`; }
  }

  // ---- model calls
  override async handleChatModelStart(
    _llm: Serialized, messages: BaseMessage[][], runId: string, parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<void> {
    const chat: ChatMessage[] = messages.flat().map((m) => {
      const calls = (m as { tool_calls?: { name: string; args: unknown }[] }).tool_calls;
      return {
        role: m.getType(),
        content: contentText(m.content),
        ...(calls?.length ? { toolCalls: calls } : {}),
      };
    });
    const text = chat.map((m) => `${m.role}: ${m.content}`).join("\n---\n");
    this.open(runId, parentRunId, "llm.chat", "llm", text);
    // The model name comes from the call's own parameters rather than from the config:
    // one day different agents in the graph may run on different models.
    const params = extraParams?.invocation_params as { model?: string } | undefined;
    const ev = this.byId.get(runId);
    if (ev) { ev.model = params?.model ?? AGENT_MODEL; ev.inputMessages = chat; }
  }

  override async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    let input = 0, out = 0;
    for (const gen of output.generations.flat()) {
      const meta = (gen as { message?: { usage_metadata?: Record<string, number> } })
        .message?.usage_metadata;
      if (meta) { input += meta.input_tokens ?? 0; out += meta.output_tokens ?? 0; }
    }
    if (input === 0 && out === 0) {
      const u = output.llmOutput?.tokenUsage ?? output.llmOutput?.usage;
      input = Number(u?.promptTokens ?? u?.input_tokens ?? 0);
      out = Number(u?.completionTokens ?? u?.output_tokens ?? 0);
    }
    this.inputTokens += input;
    this.outputTokens += out;

    const ev = this.byId.get(runId);
    if (ev) {
      ev.end = Date.now();
      ev.inputTokens = input;
      ev.outputTokens = out;
      const gens = output.generations.flat();
      const msg = (gens[0] as { message?: { content?: unknown; tool_calls?: { name: string; args: unknown }[] } })?.message;
      ev.output = msg ? contentText(msg.content) : gens.map((g) => g.text).join("\n");
      ev.outputMessage = {
        role: "assistant",
        content: ev.output,
        ...(msg?.tool_calls?.length ? { toolCalls: msg.tool_calls } : {}),
      };
    }
  }

  /** Trajectory and steps — in the same shape our own runtime used to produce. */
  steps(): Step[] {
    const depth = new Map<string, number>();
    return this.events
      .filter((e): e is Event & { kind: Step["kind"] } => e.kind !== "llm")
      .map((e) => {
        const d = e.parent === undefined ? 0 : (depth.get(e.parent) ?? 0) + 1;
        depth.set(e.id, d);
        let input: unknown = e.input;
        try { input = JSON.parse(e.input); } catch { /* not JSON */ }
        return { kind: e.kind, name: e.name, input, output: e.output, depth: d };
      });
  }
}
