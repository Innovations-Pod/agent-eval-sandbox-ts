/** Типи, якими описуються агенти й інструменти. Жодної конкретики. */
import type { z } from "zod";

/** Один знайдений документ у термінах OpenInference. */
export interface RetrievedDoc {
  id: string;
  content: string;
  score: number;
}

/** Спільна частина будь-якого листка дерева виконання. */
interface LeafToolBase {
  name: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  /** Може бути синхронним або асинхронним — векторний пошук чекає на модель,
   *  калькулятор не чекає ні на що. Рантайм чекає в обох випадках. */
  run: (args: Record<string, unknown>) => string | Promise<string>;
}

/** Звичайна детермінована функція. */
export interface PlainTool extends LeafToolBase {
  kind: "tool";
}

/** Пошук по документах. Окремий вид, бо Phoenix розмічає його інакше
 *  і вміє рахувати по ньому метрики ретріву. */
export interface RetrieverTool extends LeafToolBase {
  kind: "retriever";
  /** Що показати входом спана — сам запит, а не JSON аргументів. */
  query: (args: Record<string, unknown>) => string;
  /** Як розібрати результат у документи. */
  documents: (out: string) => RetrievedDoc[];
}

/**
 * Розмічений union, а не булеан із опціональними полями: `query` і `documents`
 * існують рівно тоді, коли kind === "retriever", і компілятор це знає. Тому в
 * рантаймі немає ні прапорців, ні `!`.
 */
export type LeafTool = PlainTool | RetrieverTool;

/** Той самий рядок, що й у Step.kind — вони навмисно збігаються. */
export type LeafKind = LeafTool["kind"];

/** Вузол дерева виконання: промпт + права виклику. */
export interface AgentSpec {
  readonly name: string;
  readonly prompt: string;
  /**
   * ТОПОЛОГІЯ: кого цей агент має право викликати. У списку можуть стояти і
   * інструменти, і інші агенти — для того, хто викликає, вони не відрізняються
   * (патерн Composite), тому список один і простір імен спільний.
   */
  readonly canCall: readonly string[];
  /** Як агент виглядає для того, хто його викликає. */
  readonly description: string;
  /** Назва єдиного аргументу в його схемі. */
  readonly arg: string;
}
