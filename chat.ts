/** Manual mode: ask the agent a question and look at the trace in Phoenix. */
import { MultiAgentSystem } from "./src/system.js";
import { PHOENIX_ENDPOINT, hasApiKey } from "./src/config.js";
import { flushTracing, initTracing } from "./src/tracing.js";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('usage: npm run chat -- "your question"');
  process.exit(1);
}

initTracing();
if (!hasApiKey()) { console.error("ANTHROPIC_API_KEY not found."); process.exit(1); }

const r = await new MultiAgentSystem().run(question);
console.log(`\nanswer: ${r.answer}`);
console.log(`trajectory: ${r.trajectory.join(" → ")}`);
console.log(
  `tokens: ${r.inputTokens}/${r.outputTokens}  cost: $${r.costUsd.toFixed(5)}  ` +
  `time: ${r.latencyS.toFixed(2)}s`,
);
console.log(`trace: ${PHOENIX_ENDPOINT} → Projects → mas-sandbox-ts`);

// Without this the root spans never make it to Phoenix.
await flushTracing();
