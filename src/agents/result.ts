/** Результат прогону: те, що читають і трейсинг, і евалуатори. */

export interface Step {
  kind: "agent" | "tool" | "retriever";
  name: string;
  input: unknown;
  output: string;
  depth: number;
}

export interface RunOutput {
  answer: string;
  trajectory: string[];
  steps: Step[];
  retrieved: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyS: number;
  error: string;
}

export class RunResult {
  question: string;
  answer = "";
  steps: Step[] = [];
  inputTokens = 0;
  outputTokens = 0;
  costUsd = 0;
  latencyS = 0;
  retrieved: string[] = [];
  error = "";

  constructor(question: string) {
    this.question = question;
  }

  /** Плаский слід виконання: імена агентів і інструментів у порядку викликів. */
  get trajectory(): string[] {
    return this.steps.map((s) => s.name);
  }

  toJSON(): RunOutput {
    return {
      answer: this.answer,
      trajectory: this.trajectory,
      steps: this.steps,
      retrieved: this.retrieved,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      costUsd: Math.round(this.costUsd * 1e6) / 1e6,
      latencyS: Math.round(this.latencyS * 1000) / 1000,
      error: this.error,
    };
  }
}
