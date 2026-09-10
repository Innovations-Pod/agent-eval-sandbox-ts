/** A facade over the graph: takes a question, returns the same `RunResult` as
 *  before. The shape of the result never changed, so `evals/` was not rewritten. */
import { HumanMessage } from "@langchain/core/messages";

import { RunResult } from "../agents/index.js";
import { AGENT_MODEL, costUsd } from "../config.js";
import { buildAgentTree } from "./index.js";
import { RunRecorder, contentText } from "./recorder.js";
import { emitSpans } from "./spans.js";

export class MultiAgentSystem {
  private agent = buildAgentTree();

  async run(question: string): Promise<RunResult> {
    const result = new RunResult(question);
    const recorder = new RunRecorder(question);
    const started = performance.now();
    const startedAt = Date.now();

    try {
      const output = await this.agent.invoke(
        { messages: [new HumanMessage(question)] },
        { callbacks: [recorder], recursionLimit: 25 },
      );
      // Via `contentText`, not `JSON.stringify`: when the model turns on thinking,
      // the last message is an array of blocks and the answer drowned in their JSON.
      result.answer = contentText(output.messages.at(-1)?.content);
    } catch (err) {
      result.answer = "";
      result.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }

    result.steps.push(...recorder.steps());
    result.retrieved.push(...recorder.retrieved);
    result.inputTokens = recorder.inputTokens;
    result.outputTokens = recorder.outputTokens;
    result.costUsd = costUsd(AGENT_MODEL, recorder.inputTokens, recorder.outputTokens);
    result.latencyS = (performance.now() - started) / 1000;

    emitSpans(recorder.events, {
      question, answer: result.answer, trajectory: result.trajectory,
      costUsd: result.costUsd, error: result.error,
    }, startedAt);

    return result;
  }
}
