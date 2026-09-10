/** Складання реєстру: індексація за іменем і перевірки цілісності.
 *
 * Усе тут чисте й параметризоване — навмисно. Реєстр у `index.ts` лише
 * оголошує, з чого складається система; правила, яким вона мусить
 * відповідати, живуть окремо і перевіряються без справжніх агентів.
 */
import type { AgentSpec, LeafTool } from "./types.js";

/** Розкладає список за іменем. Падає на дублікаті: `Object.fromEntries`
 *  мовчки лишив би останній, а перший зник би без жодного сліду. */
export function byName<T extends { name: string }>(kind: string, items: T[]): Record<string, T> {
  const seen = new Set<string>();
  for (const { name } of items) {
    if (seen.has(name)) throw new Error(`${kind} оголошено двічі: ${name}`);
    seen.add(name);
  }
  return Object.fromEntries(items.map((i) => [i.name, i]));
}

/** Дві умови, без яких система зламається не на старті, а посеред прогону. */
export function validateRegistry(
  agents: Record<string, AgentSpec>,
  tools: Record<string, LeafTool>,
): void {
  // Простір імен спільний і пошук іде спершу серед агентів, тож інструмент
  // з іменем агента мовчки перестав би викликатись.
  const shadowed = Object.keys(tools).filter((name) => name in agents);
  if (shadowed.length > 0) {
    throw new Error(`ім'я інструмента вже зайняте агентом: ${shadowed.join(", ")}`);
  }

  // Друкарська помилка в canCall інакше спливе аж тоді, коли модель
  // попросить неіснуючий інструмент — тобто вже за гроші.
  for (const spec of Object.values(agents)) {
    for (const name of spec.canCall) {
      if (!(name in agents) && !(name in tools)) {
        throw new Error(`агент ${spec.name} посилається на неіснуюче ім'я: ${name}`);
      }
    }
  }
}
