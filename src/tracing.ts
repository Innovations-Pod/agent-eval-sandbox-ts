/** Підключення OpenTelemetry-трейсингу до Phoenix (OpenInference-конвенції).
 *
 * Дві речі, яких у Python-версії робити не треба, а тут обов'язково:
 *
 * 1. `manuallyInstrument()` — під ESM автоінструментація не встигає пропатчити
 *    модуль: `import Anthropic` виконується ДО того, як ми реєструємо провайдер.
 *    Тому патчимо модуль явно.
 * 2. `flushTracing()` — BatchSpanProcessor копить спани в буфері. Якщо процес
 *    завершиться раніше за таймер відправки, останні спани (а це якраз кореневі,
 *    бо вони закриваються останніми) не доїдуть, і трейс лишиться без початку.
 *    У Python це робить atexit-хук; у Node доводиться кликати руками.
 */
import { register } from "@arizeai/phoenix-otel";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { context as otelContext, trace, type Tracer } from "@opentelemetry/api";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { PHOENIX_ENDPOINT, PROJECT_NAME } from "./config.js";

let provider: NodeTracerProvider | null = null;

export function initTracing(projectName: string = PROJECT_NAME): void {
  if (provider) return;

  // Без менеджера контексту `context.active()` завжди порожній, і всі спани
  // стають коренями — дерева не буде. register() його не ставить.
  otelContext.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

  // Автоінструментація вимкнена свідомо — і LangChain, і Anthropic.
  // Спани пише RunRecorder із колбеків: рівно ті, що описують нашу систему,
  // з правильними видами AGENT / RETRIEVER / TOOL / LLM. Див. runtime/recorder.ts.
  provider = register({
    projectName,
    url: `${PHOENIX_ENDPOINT}/v1/traces`,
    batch: true,
    instrumentations: [],
  });
}

/** Дочекатися відправки всіх спанів. Кликати перед виходом із процесу. */
export async function flushTracing(): Promise<void> {
  if (!provider) return;
  await provider.forceFlush();
  await provider.shutdown();
  provider = null;
}

export const tracer = (): Tracer => trace.getTracer("mas-sandbox-ts");
