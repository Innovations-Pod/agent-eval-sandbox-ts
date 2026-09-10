/** Калькулятор. У JS немає безпечного вбудованого парсера виразів, а eval()
 *  виконав би довільний код із відповіді моделі — тому власний рекурсивний спуск. */
import { z } from "zod";

import type { PlainTool } from "../../types.js";

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (/[\d.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src[j]!)) j++;
      const value = Number(src.slice(i, j));
      if (Number.isNaN(value)) throw new Error(`не число: ${src.slice(i, j)}`);
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      if (ch === "*" && src[i + 1] === "*") { tokens.push({ kind: "op", value: "**" }); i += 2; continue; }
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    throw new Error(`недозволений символ: ${ch}`);
  }
  return tokens;
}

/** Граматика: expr → term (('+'|'-') term)* ; term → unary (('*'|'/') unary)* ; ... */
function parse(tokens: Token[]): number {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const eat = (value: string): boolean => {
    const t = peek();
    if (t?.kind === "op" && t.value === value) { pos++; return true; }
    return false;
  };

  function expr(): number {
    let left = term();
    for (;;) {
      if (eat("+")) left += term();
      else if (eat("-")) left -= term();
      else return left;
    }
  }
  function term(): number {
    let left = unary();
    for (;;) {
      if (eat("*")) left *= unary();
      else if (eat("/")) left /= unary();
      else return left;
    }
  }
  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return power();
  }
  function power(): number {
    const base = atom();
    if (eat("**")) return base ** unary();
    return base;
  }
  function atom(): number {
    const t = peek();
    if (t?.kind === "num") { pos++; return t.value; }
    if (eat("(")) {
      const value = expr();
      if (!eat(")")) throw new Error("немає закритої дужки");
      return value;
    }
    throw new Error("очікувалось число або дужка");
  }

  const value = expr();
  if (pos !== tokens.length) throw new Error("зайві символи у виразі");
  return value;
}

/** Безпечний калькулятор для арифметики — власний парсер, ніякого eval. */
export function calc(expression: string): string {
  try {
    const value = parse(tokenize(expression.replace(/,/g, ".")));
    if (!Number.isFinite(value)) throw new Error("результат не є скінченним числом");
    return `${expression} = ${Math.round(value * 100) / 100}`;
  } catch (err) {
    return `ПОМИЛКА: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const Input = z.object({
  expression: z.string().describe("Арифметичний вираз, напр. '95 + 3*12'"),
});

export const calcTool: PlainTool = {
  kind: "tool",
  name: "calc",
  description: "Порахувати арифметичний вираз, напр. '95 + 3*12'.",
  input: Input,
  run: (a) => calc(Input.parse(a).expression),
};
