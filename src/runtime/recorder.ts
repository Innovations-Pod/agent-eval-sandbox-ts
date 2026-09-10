/** Збір подій прогону. Жодного OpenTelemetry тут немає — лише дані.
 *
 * Спани будуються потім, одним синхронним проходом (`emitSpans`). Спроба
 * створювати їх просто в колбеках провалилась: колбеки LangChain приходять
 * з різних асинхронних контекстів, і батьківський контекст до них не доїжджає —
 * спани виходили або сиротами, або з посиланням на неіснуючого батька.
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
  /** Заповнюється лише для викликів моделі — без неї Phoenix не порахує вартість. */
  model?: string;
  /** Діалог, який пішов у модель, і те, що вона відповіла. */
  inputMessages?: ChatMessage[];
  outputMessage?: ChatMessage;
}

/**
 * Вміст повідомлення буває масивом блоків (текст, tool_use, tool_result), і
 * `String(content)` на ньому дає «[object Object],[object Object]» — саме це
 * і показував Phoenix. Розгортаємо блоки в читабельний текст.
 */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);
  return content
    .map((block) => {
      const b = block as Record<string, unknown>;
      // Роздуми моделі — не частина відповіді: у трейсі вони шум, а в `answer`
      // просто неправда, бо витісняють справжній текст.
      if (b.type === "thinking" || b.type === "redacted_thinking") return "";
      if (typeof b.text === "string") return b.text;
      if (b.type === "tool_use") {
        return `→ виклик ${String(b.name)}(${JSON.stringify(b.input ?? {})})`;
      }
      if (b.type === "tool_result") return `← ${contentText(b.content)}`;
      return JSON.stringify(b);
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Колбеки віддають не рядок, а `ToolMessage`. `JSON.stringify` на ньому дає
 * серіалізований конверт LangChain (`{"lc":1,"type":"constructor",...}`), а не
 * результат інструмента — і тоді розбір документів тихо падає, а в спан
 * потрапляє службове сміття замість відповіді.
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
  /** runId вузла фреймворку → runId найближчого змістовного предка. */
  private passthrough = new Map<string, string | undefined>();

  /** Найближчий предок, який ми залишаємо у дереві. */
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
   * Ланцюги. Суб-агенти приходять сюди двічі — як інструмент батька і як
   * власний ланцюг, тож їх беремо в `handleToolStart`, щоб не роздвоювати.
   * Виняток один: КОРЕНЕВИЙ агент (супервізор). Його ніхто не викликає як
   * інструмент — він і є граф, тому єдина нагода створити для нього спан тут.
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

  // ---- інструменти й суб-агенти
  override async handleToolStart(
    _t: Serialized, input: string, runId: string, parentRunId?: string,
    _tags?: string[], _meta?: Record<string, unknown>, runName?: string,
  ): Promise<void> {
    const name = runName ?? "unknown";
    const leaf = LEAF_TOOLS[name];
    const kind: Event["kind"] = name in AGENTS ? "agent" : (leaf?.kind ?? "tool");
    let shown = input;
    if (leaf?.kind === "retriever") {
      try { shown = leaf.query(JSON.parse(input) as Record<string, unknown>); } catch { /* лишаємо як є */ }
    }
    this.open(runId, parentRunId, name, kind, shown);
  }

  override async handleToolEnd(output: unknown, runId: string): Promise<void> {
    const ev = this.byId.get(runId);
    if (!ev) return;
    ev.end = Date.now();
    ev.output = textOf(output);

    const leaf = LEAF_TOOLS[ev.name];
    if (leaf?.kind === "retriever" && !ev.output.startsWith("ПОМИЛКА")) {
      try {
        ev.docs = leaf.documents(ev.output);
        this.retrieved.push(...ev.docs.map((d) => d.content));
      } catch { /* формат не той — телеметрія не має падати */ }
    }
  }

  override async handleToolError(err: unknown, runId: string): Promise<void> {
    const ev = this.byId.get(runId);
    if (ev) { ev.end = Date.now(); ev.output = `ПОМИЛКА: ${String(err)}`; }
  }

  // ---- виклики моделі
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
    // Назву моделі беремо з параметрів самого виклику, а не з конфігу: у графі
    // різні агенти можуть колись їхати на різних моделях.
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

  /** Траєкторія й кроки — у тому ж вигляді, що давав власний рантайм. */
  steps(): Step[] {
    const depth = new Map<string, number>();
    return this.events
      .filter((e): e is Event & { kind: Step["kind"] } => e.kind !== "llm")
      .map((e) => {
        const d = e.parent === undefined ? 0 : (depth.get(e.parent) ?? 0) + 1;
        depth.set(e.id, d);
        let input: unknown = e.input;
        try { input = JSON.parse(e.input); } catch { /* не JSON */ }
        return { kind: e.kind, name: e.name, input, output: e.output, depth: d };
      });
  }
}
