/** Побудова спанів із зібраних подій — одним синхронним проходом.
 *
 * Чому не в колбеках: див. коментар у recorder.ts. Тут ми володіємо і порядком,
 * і батьківством, і часовими мітками, тож дерево виходить рівно таким, як треба.
 */
import {
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";
import { context as otelContext, trace, type Context, type Span } from "@opentelemetry/api";

import { tracer } from "../tracing.js";
import type { ChatMessage, Event } from "./recorder.js";

const KIND: Record<Event["kind"], OpenInferenceSpanKind> = {
  agent: OpenInferenceSpanKind.AGENT,
  tool: OpenInferenceSpanKind.TOOL,
  retriever: OpenInferenceSpanKind.RETRIEVER,
  llm: OpenInferenceSpanKind.LLM,
};

const PREFIX: Record<Event["kind"], string> = {
  agent: "agent", tool: "tool", retriever: "retriever", llm: "",
};

function setMessages(span: Span, prefix: string, messages: ChatMessage[]): void {
  messages.forEach((m, i) => {
    const at = `${prefix}.${i}.`;
    span.setAttribute(at + SemanticConventions.MESSAGE_ROLE, m.role);
    span.setAttribute(at + SemanticConventions.MESSAGE_CONTENT, m.content);
    m.toolCalls?.forEach((call, j) => {
      const c = `${at}${SemanticConventions.MESSAGE_TOOL_CALLS}.${j}.`;
      span.setAttribute(c + SemanticConventions.TOOL_CALL_FUNCTION_NAME, call.name);
      span.setAttribute(
        c + SemanticConventions.TOOL_CALL_FUNCTION_ARGUMENTS_JSON,
        JSON.stringify(call.args ?? {}),
      );
    });
  });
}

export interface RunSummary {
  question: string;
  answer: string;
  trajectory: string[];
  costUsd: number;
  error?: string;
}

export function emitSpans(events: Event[], summary: RunSummary, startedAt: number): void {
  const rootSpan = tracer().startSpan("mas.run", { startTime: startedAt });
  rootSpan.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, OpenInferenceSpanKind.CHAIN);
  rootSpan.setAttribute(SemanticConventions.INPUT_VALUE, summary.question);
  rootSpan.setAttribute(SemanticConventions.OUTPUT_VALUE, summary.answer);
  rootSpan.setAttribute("mas.trajectory", summary.trajectory.join(","));
  rootSpan.setAttribute("mas.cost_usd", summary.costUsd);

  const ctxOf = new Map<string | undefined, Context>();
  ctxOf.set(undefined, trace.setSpan(otelContext.active(), rootSpan));

  // Події вже в порядку відкриття, тож батько завжди створений раніше за дитину.
  for (const ev of events) {
    const parentCtx = ctxOf.get(ev.parent) ?? ctxOf.get(undefined)!;
    const name = ev.kind === "llm" ? "llm.chat" : `${PREFIX[ev.kind]}.${ev.name}`;
    const span: Span = tracer().startSpan(name, { startTime: ev.start }, parentCtx);
    span.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, KIND[ev.kind]);
    span.setAttribute(SemanticConventions.INPUT_VALUE, ev.input);
    span.setAttribute(SemanticConventions.OUTPUT_VALUE, ev.output);
    if (ev.kind === "agent") span.setAttribute(SemanticConventions.AGENT_NAME, ev.name);
    if (ev.kind === "llm") {
      span.setAttribute(SemanticConventions.LLM_TOKEN_COUNT_PROMPT, ev.inputTokens);
      span.setAttribute(SemanticConventions.LLM_TOKEN_COUNT_COMPLETION, ev.outputTokens);
      span.setAttribute(
        SemanticConventions.LLM_TOKEN_COUNT_TOTAL, ev.inputTokens + ev.outputTokens,
      );
      // Без назви моделі Phoenix не знає, за яким прайсом рахувати — і показує
      // Total Cost = 0 навіть тоді, коли токени пораховані правильно.
      if (ev.model) span.setAttribute(SemanticConventions.LLM_MODEL_NAME, ev.model);
      span.setAttribute(SemanticConventions.LLM_PROVIDER, "anthropic");
      span.setAttribute(SemanticConventions.LLM_SYSTEM, "anthropic");
      // Структуровані повідомлення — Phoenix малює їх як діалог, а не як
      // один довгий рядок. Ключі пласкі, з індексом: llm.input_messages.0.…
      setMessages(span, SemanticConventions.LLM_INPUT_MESSAGES, ev.inputMessages ?? []);
      setMessages(span, SemanticConventions.LLM_OUTPUT_MESSAGES,
                  ev.outputMessage ? [ev.outputMessage] : []);
    }
    ev.docs.forEach((doc, i) => {
      const at = `${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.`;
      span.setAttribute(at + SemanticConventions.DOCUMENT_ID, doc.id);
      span.setAttribute(at + SemanticConventions.DOCUMENT_CONTENT, doc.content);
      span.setAttribute(at + SemanticConventions.DOCUMENT_SCORE, doc.score);
    });
    ctxOf.set(ev.id, trace.setSpan(parentCtx, span));
    span.end(ev.end);
  }

  rootSpan.end();
}
