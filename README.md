# Пісочниця для тестування мульти-агентних систем — TypeScript

Порт `~/agent-eval-sandbox` (Python) один-в-один. Та сама архітектура, той самий
датасет, ті самі метрики — щоб можна було порівняти дві мови на тій самій задачі.

## Швидкий старт

```bash
npm install --legacy-peer-deps   # див. «Відомі шорсткості»
npm run baseline                 # прогін без ключа й без витрат
npm run report -- <experimentId>
npm run chat -- "Скільки коштує міжміська доставка 8 кг?"
npm run run                      # справжній Claude + LLM-судді
```

Phoenix має бути піднятий — він спільний з Python-версією:
`cd ~/agent-eval-sandbox && make up`.

## Структура — та сама, що в Python

```
src/
  agents/     prompts.ts · registry.ts (ТОПОЛОГІЯ) · runtime.ts · result.ts
  tools/      knowledge.ts · arithmetic.ts · operations.ts · schemas.ts (Zod)
  llm/        types.ts · anthropic.ts · fake.ts · index.ts
  kb/         база знань (копія)
evals/        dataset.ts · evaluators.ts · runExperiment.ts · report.ts
chat.ts
```

## Перевірка вірності порту

Детермінована заглушка `FakeLLM` дає той самий результат в обох мовах:

```
траєкторії ідентичні: 12/12
скори евалів:         збіглися повністю (keyword_check 0.500, tool_selection 0.958,
                      no_loops 1.000, steps_count 3.000)
```

Тексти відповідей відрізняються в 9 із 12 кейсів — це **не** різниця в поведінці:
`json.dumps` у Python ставить пробіли після двокрапки, `JSON.stringify` — ні,
плюс тут `chunkId` замість `chunk_id` за конвенцією TS. На жодну метрику не впливає.

## Де TypeScript вийшов кращим

**Zod як одне джерело правди.** У Python схема інструмента, валідація аргументів
і тип — три різні місця (а валідації взагалі немає). Тут один об'єкт дає все:

```ts
export const SearchDocsInput = z.object({
  query: z.string().describe("Пошуковий запит"),
});
// → JSON-схема для моделі  (toJsonSchema)
// → рантайм-валідація      (SearchDocsInput.parse)
// → статичний тип          (z.infer)
```

**Типи справді перевіряються.** `npm run typecheck` ловить те, що в Python
проходить мовчки: `noUncheckedIndexedAccess` змусив явно обробити кожен доступ
за індексом, і це знайшло два місця, де Python-версія просто впала б у рантаймі.

## Де довелося докласти зусиль

**Калькулятор.** У Python `ast.parse` дає безпечний розбір виразу з коробки.
У JS такого немає, а `eval()` пустив би довільний код із відповіді моделі —
тому в `src/tools/arithmetic.ts` написано власний рекурсивний спуск (~70 рядків
проти 15 у Python).

**Читання результатів евалів.** Python-клієнт віддає їх у `get_experiment()`.
JS-клієнт — ні, тому `report.ts` ходить у REST `/v1/experiments/{id}/json`.

**Асинхронність наскрізь.** Кожен метод у ланцюжку став `async`, включно з
рекурсивним `runAgent`. У Python код лишається синхронним і читається простіше.

**`for … else`.** Конструкції-аналога немає, довелося вести окремий прапорець
`exhausted` — див. коментар у `runtime.ts`.

## Відомі шорсткості

`@arizeai/phoenix-client@7.8.0` тримає застарілий optional peer на
`@anthropic-ai/sdk@^0.35.0`. Ми цей peer не використовуємо (Anthropic викликаємо
напряму), тому ставимо з `--legacy-peer-deps`.

## Що лишилось незробленим навмисно

`trajectoryScore` в `evals/evaluators.ts` повертає 0.0 — це відкрите завдання
з Python-версії (`evals/evaluators.py`, `TODO(human)`). Спершу реалізуй там,
потім перенеси сюди свою ж політику.
