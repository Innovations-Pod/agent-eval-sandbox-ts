/** Running an offline experiment in Phoenix.
 *
 * The shape: dataset → task (running the system on each case) → evaluators.
 * Each run is a separate named experiment, so they can be compared.
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

// The deterministic stub is gone: LangGraph turns the loop, and swapping our FakeLLM in
// there is impossible without a BaseChatModel of our own.
// Every run now costs money — so we fail loudly rather than spend it quietly.
if (flag("fake")) {
  console.error("--fake is no longer supported: the runtime is LangGraph, there are no free runs.");
  process.exit(1);
}
if (!hasApiKey()) {
  console.error("ANTHROPIC_API_KEY not found — the run cannot start.");
  process.exit(1);
}

initTracing();
const client = createClient({ options: { baseUrl: PHOENIX_ENDPOINT } });

/**
 * By default the dataset is uploaded from code (`evals/dataset.ts`) — that is the source
 * of truth. But with `--dataset <name|id>` you can run one that already exists in Phoenix:
 * for example the one you assembled from traces with the “add to dataset” button.
 *
 * WARNING: `createDataset` with the same name OVERWRITES the examples with the ones passed
 * in. So a dataset assembled in the UI must be run through `--dataset`, otherwise the next
 * ordinary run wipes it.
 */
const wanted = value("dataset");
let datasetId: string;

if (wanted) {
  // A dataset can be named or given by id — Phoenix accepts both.
  const selector = wanted.startsWith("RGF0YXNl")
    ? { datasetId: wanted }
    : { datasetName: wanted };
  datasetId = (await getDatasetInfo({ client, dataset: selector })).id;
  console.log(`→ using the existing dataset “${wanted}” (${datasetId})`);
} else {
  ({ datasetId } = await createDataset({
    client,
    name: DATASET_NAME,
    description: "Orbita Logistics support cases: happy / edge / adversarial",
    examples: asExamples(),
  }));
}

const mas = new MultiAgentSystem();
const evaluators = flag("no-judges") ? DETERMINISTIC : ALL;
const stamp = new Date().toISOString().slice(5, 16).replace("T", "_");
const name = value("name") ?? `${AGENT_MODEL}_langgraph_${stamp}`;

console.log(`→ experiment “${name}”: ${evaluators.length} evaluators`);

await runExperiment({
  client,
  dataset: { datasetId },
  experimentName: name,
  experimentMetadata: { agent_model: AGENT_MODEL, runtime: "langgraph" },
  task: async (example) => {
    // Our dataset puts the question in `question`; a dataset assembled from spans in
    // Phoenix puts it in `input`. We take whichever exists, else the first string.
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
console.log(`\nResults: ${PHOENIX_ENDPOINT} → Datasets → ${DATASET_NAME} → ${name}`);
