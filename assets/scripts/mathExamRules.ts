export type MathQuestion = { a: number; b: number; operator: '+' | '−' | '×'; answer: number };
export const EXAM_SECONDS = 60;
export const EXAM_AD_SECONDS = 30;
export const EXAM_TARGET = 100;
const OPENING_QUESTIONS: ReadonlyArray<MathQuestion> = [
  { a: 9, b: 3, operator: '−', answer: 6 },
  { a: 3, b: 1, operator: '+', answer: 4 },
  { a: 8, b: 2, operator: '+', answer: 10 },
  { a: 4, b: 7, operator: '×', answer: 28 },
];

export function makeQuestion(index: number, random = Math.random): MathQuestion {
  const integer = (max: number) => Math.floor(Math.max(0, Math.min(0.999999, random())) * max);
  const operator = (['+', '−', '×'] as const)[integer(index < 3 ? 2 : 3)];
  let a = integer(10);
  let b = integer(10);
  if (operator === '−' && a < b) [a, b] = [b, a];
  return { a, b, operator, answer: operator === '+' ? a + b : operator === '−' ? a - b : a * b };
}

export class MathExamRound {
  public score = 0;
  public correct = 0;
  public remaining = EXAM_SECONDS;
  public questions: MathQuestion[] = [];
  private generated = 0;

  constructor(private random = Math.random) { this.reset(); }

  public reset(): void {
    this.score = 0;
    this.correct = 0;
    this.remaining = EXAM_SECONDS;
    this.generated = OPENING_QUESTIONS.length;
    this.questions = OPENING_QUESTIONS.map(question => ({ ...question }));
  }

  public tick(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) this.remaining = Math.max(0, this.remaining - seconds);
  }

  public grantTime(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) this.remaining += seconds;
  }

  public submit(answer: string): boolean {
    if (this.remaining <= 0 || !/^\d{1,2}$/.test(answer) || Number(answer) !== this.questions[0].answer) return false;
    this.correct += 1;
    this.score += 5;
    this.questions.shift();
    this.appendQuestion();
    return true;
  }

  private appendQuestion(): void {
    let question = makeQuestion(this.generated++, this.random);
    const previous = this.questions[this.questions.length - 1];
    // Bound retries even with deterministic/random sources that repeat forever.
    for (let i = 0; i < 8 && previous && question.a === previous.a && question.b === previous.b && question.operator === previous.operator; i++) {
      question = makeQuestion(this.generated, this.random);
    }
    this.questions.push(question);
  }
}
