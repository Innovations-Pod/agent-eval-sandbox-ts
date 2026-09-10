/** Запуск офлайн-експерименту в Phoenix.
 *
 * Схема: датасет → task (прогін системи на кожному кейсі) → evaluators.
 * Кожен запуск = окремий іменований експеримент, тому їх можна порівнювати.
 */
import { createClient } from "@arizeai/phoenix-client";
import { createDataset, getDatasetInfo } from "@arizeai/phoenix-client/datasets";
import { runExperiment } from "@arizeai/phoenix-client/experiments";

import { MultiAgentSystem } from "../src/system.js";
import { AGENT_MODEL, PHOENIX_ENDPOINT, hasApiKey } from "../src/config.js";
import { flushTracing, initTracing } from "../src/tracing.js";
import { asExamples } from "./dataset.js";
import { ALL, DETERMINISTIC } from "./evaluators.js";

const DATASET_NAME = "orbita-support-agent-ts";

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

// Детермінованої заглушки більше немає: цикл крутить LangGraph, і підмінити
// в ньому модель нашим FakeLLM неможливо без власного BaseChatModel.
// Кожен прогін тепер платний — тому падаємо, а не тихо витрачаємо гроші.
if (flag("fake")) {
  console.error("--fake більше не підтримується: рантайм на LangGraph, безкоштовних прогонів немає.");
  process.exit(1);
}
if (!hasApiKey()) {
  console.error("ANTHROPIC_API_KEY не знайдено — прогін неможливий.");
  process.exit(1);
}

initTracing();
const client = createClient({ options: { baseUrl: PHOENIX_ENDPOINT } });

/**
 * За замовчуванням датасет заливається з коду (`evals/dataset.ts`) — він і є
 * джерелом правди. Але з `--dataset <імʼя|id>` можна прогнати наявний у Phoenix:
 * наприклад той, який ти зібрав із трейсів кнопкою «add to dataset».
 *
 * УВАГА: `createDataset` з тим самим імʼям ПЕРЕЗАПИСУЄ приклади під передані.
 * Тому датасет, зібраний в UI, треба запускати саме через `--dataset`, інакше
 * наступний звичайний прогін його зітре.
 */
const wanted = value("dataset");
let datasetId: string;

if (wanted) {
  // Датасет можна назвати іменем або передати id — Phoenix приймає обидва.
  const selector = wanted.startsWith("RGF0YXNl")
    ? { datasetId: wanted }
    : { datasetName: wanted };
  datasetId = (await getDatasetInfo({ client, dataset: selector })).id;
  console.log(`→ беру наявний датасет «${wanted}» (${datasetId})`);
} else {
  ({ datasetId } = await createDataset({
    client,
    name: DATASET_NAME,
    description: "Кейси підтримки «Орбіта Логістик»: happy / edge / adversarial",
    examples: asExamples(),
  }));
}

const mas = new MultiAgentSystem();
const evaluators = flag("no-judges") ? DETERMINISTIC : ALL;
const stamp = new Date().toISOString().slice(5, 16).replace("T", "_");
const name = value("name") ?? `${AGENT_MODEL}_langgraph_${stamp}`;

console.log(`→ експеримент «${name}»: ${evaluators.length} евалуаторів`);

await runExperiment({
  client,
  dataset: { datasetId },
  experimentName: name,
  experimentMetadata: { agent_model: AGENT_MODEL, runtime: "langgraph" },
  task: async (example) => {
    // Наш датасет кладе питання в `question`; датасет, зібраний зі спанів
    // у Phoenix, — у `input`. Беремо перше, що є, інакше — перший рядок.
    const raw = example.input as Record<string, unknown>;
    const question = String(
      raw.question ?? raw.input ??
      Object.values(raw).find((v) => typeof v === "string") ?? "",
    );
    const result = await mas.run(question);
    return result.toJSON();
  },
  evaluators,
  repetitions: Number(value("repetitions") ?? 1),
  concurrency: Number(value("concurrency") ?? 3),
});

await flushTracing();
console.log(`\nРезультати: ${PHOENIX_ENDPOINT} → Datasets → ${DATASET_NAME} → ${name}`);
