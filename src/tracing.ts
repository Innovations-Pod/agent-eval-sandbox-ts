/** Wiring OpenTelemetry tracing up to Phoenix (OpenInference conventions).
 *
 * Two things the Python version does not need and this one does:
 *
 * 1. `manuallyInstrument()` — under ESM, auto-instrumentation does not get to patch
 *    the module in time: `import Anthropic` runs BEFORE we register the provider,
 *    so we patch the module explicitly.
 * 2. `flushTracing()` — BatchSpanProcessor buffers spans. If the process exits before
 *    the send timer fires, the last spans (which are precisely the root ones, since
 *    they close last) never arrive and the trace is left without its beginning.
 *    In Python an atexit hook does this; in Node it has to be called by hand.
 */
import { register } from "@arizeai/phoenix-otel";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { context as otelContext, trace, type Tracer } from "@opentelemetry/api";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { PHOENIX_ENDPOINT, PROJECT_NAME } from "./config.js";

let provider: NodeTracerProvider | null = null;

export function initTracing(projectName: string = PROJECT_NAME): void {
  if (provider) return;

  // Without a context manager `context.active()` is always empty and every span
  // becomes a root — there is no tree. register() does not install one.
  otelContext.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

  // Auto-instrumentation is off on purpose, for both LangChain and Anthropic.
  // Spans are written by RunRecorder from callbacks: exactly the ones that describe
  // our system, with the right AGENT / RETRIEVER / TOOL / LLM kinds. See runtime/recorder.ts.
  provider = register({
    projectName,
    url: `${PHOENIX_ENDPOINT}/v1/traces`,
    batch: true,
    instrumentations: [],
  });
}

/** Wait for every span to be sent. Call before the process exits. */
export async function flushTracing(): Promise<void> {
  if (!provider) return;
  await provider.forceFlush();
  await provider.shutdown();
  provider = null;
}

export const tracer = (): Tracer => trace.getTracer("mas-sandbox-ts");
