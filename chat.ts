/** Ручний режим: постав агенту питання і подивись трейс у Phoenix. */
import { MultiAgentSystem } from "./src/system.js";
import { PHOENIX_ENDPOINT, hasApiKey } from "./src/config.js";
import { flushTracing, initTracing } from "./src/tracing.js";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('вжиток: npm run chat -- "твоє питання"');
  process.exit(1);
}

initTracing();
if (!hasApiKey()) { console.error("ANTHROPIC_API_KEY не знайдено."); process.exit(1); }

const r = await new MultiAgentSystem().run(question);
console.log(`\nвідповідь: ${r.answer}`);
console.log(`траєкторія: ${r.trajectory.join(" → ")}`);
console.log(
  `токени: ${r.inputTokens}/${r.outputTokens}  вартість: $${r.costUsd.toFixed(5)}  ` +
  `час: ${r.latencyS.toFixed(2)}c`,
);
console.log(`трейс: ${PHOENIX_ENDPOINT} → Projects → mas-sandbox-ts`);

// Без цього кореневі спани не встигнуть доїхати до Phoenix.
await flushTracing();
