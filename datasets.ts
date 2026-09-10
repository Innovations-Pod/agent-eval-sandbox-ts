/** Список датасетів у Phoenix — щоб не шукати id по API руками. */
import { PHOENIX_ENDPOINT } from "./src/config.js";

interface Dataset { id: string; name: string; description?: string }

const res = await fetch(`${PHOENIX_ENDPOINT}/v1/datasets`);
const { data } = (await res.json()) as { data: Dataset[] };

console.log(`\n${"id".padEnd(26)}${"назва".padEnd(30)}прикладів`);
console.log("-".repeat(72));
for (const d of data) {
  const ex = await fetch(`${PHOENIX_ENDPOINT}/v1/datasets/${d.id}/examples`);
  const body = (await ex.json()) as { data?: { examples?: unknown[] } };
  const n = body.data?.examples?.length ?? "?";
  // Імена з UI інколи містять невидимі пробіли — показуємо як є, у лапках.
  console.log(`${d.id.padEnd(26)}${JSON.stringify(d.name).padEnd(30)}${n}`);
}
console.log(`\nзапуск:  npm run run -- --dataset <id>\n`);
