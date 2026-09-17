/** Pure gameplay rules; scene animation, input, audio and ads stay outside this file. */
export type PenguinRoundStatus = "playing" | "stage-break" | "success" | "failed";

export interface PenguinCatchResult {
  caught: number;
  stageChanged: boolean;
  completed: boolean;
}

/** Swept AABB contact for a vertically falling sprite; edge contact intentionally counts. */
export function sweptPenguinContact(
  fallingX: number,
  currentY: number,
  previousY: number,
  fallingHalfWidth: number,
  fallingHalfHeight: number,
  targetX: number,
  targetY: number,
  targetHalfWidth: number,
  targetHalfHeight: number,
): boolean {
  return Math.abs(fallingX - targetX) <= fallingHalfWidth + targetHalfWidth &&
    currentY - fallingHalfHeight <= targetY + targetHalfHeight &&
    previousY + fallingHalfHeight >= targetY - targetHalfHeight;
}

/**
 * The base first sinks non-linearly until the whale is hidden. Every later catch moves the
 * virtual base down by exactly one layer, keeping the newest visible layers on screen forever.
 */
export function penguinStackSink(
  caught: number,
  whaleHiddenSink: number,
  whaleHiddenAt = 14,
  layerSpacing = 70,
): number {
  const safeCaught = Math.max(0, caught);
  const hideAt = Math.max(1, Math.floor(whaleHiddenAt));
  const earlyProgress = Math.min(1, safeCaught / hideAt);
  const earlySink = Math.max(0, whaleHiddenSink) * Math.pow(earlyProgress, 1.25);
  const endlessSink = Math.max(0, safeCaught - hideAt) * Math.max(0, layerSpacing);
  return earlySink + endlessSink;
}

export class PenguinStackRound {
  public status: PenguinRoundStatus = "playing";
  public stage: 1 | 2 = 1;
  public caught = 0;
  public lives = 3;
  public missed = 0;
  public skipped = false;

  private stageOneTarget = 10;
  private finalTarget = 200;
  private maxLives = 3;

  public reset(stageOneTarget = 10, finalTarget = 200, lives = 3): void {
    this.stageOneTarget = Math.max(1, Math.floor(stageOneTarget));
    this.finalTarget = Math.max(this.stageOneTarget + 1, Math.floor(finalTarget));
    this.maxLives = Math.max(1, Math.floor(lives));
    this.status = "playing";
    this.stage = 1;
    this.caught = 0;
    this.lives = this.maxLives;
    this.missed = 0;
    this.skipped = false;
  }

  public get target(): number {
    return this.stage === 1 ? this.stageOneTarget : this.finalTarget;
  }

  public get progress(): number {
    return Math.min(1, this.caught / this.target);
  }

  public catchPenguin(): PenguinCatchResult | null {
    if (this.status !== "playing") return null;
    this.caught += 1;
    let stageChanged = false;
    let completed = false;

    if (this.stage === 1 && this.caught >= this.stageOneTarget) {
      this.stage = 2;
      this.status = "stage-break";
      stageChanged = true;
    } else if (this.stage === 2 && this.caught >= this.finalTarget) {
      this.status = "success";
      completed = true;
    }

    return { caught: this.caught, stageChanged, completed };
  }

  public continueAfterStageBreak(): void {
    if (this.status !== "stage-break") return;
    this.caught = 0;
    this.status = "playing";
  }

  public missPenguin(): boolean {
    if (this.status !== "playing") return false;
    this.missed += 1;
    this.lives = Math.max(0, this.lives - 1);
    if (this.lives === 0) this.status = "failed";
    return true;
  }

  public addLife(amount = 1): boolean {
    if (this.status !== "playing" || !Number.isFinite(amount)) return false;
    const next = Math.min(this.maxLives, this.lives + Math.max(0, Math.floor(amount)));
    if (next === this.lives) return false;
    this.lives = next;
    return true;
  }

  public revive(): boolean {
    if (this.status !== "failed") return false;
    this.lives = 1;
    this.status = "playing";
    return true;
  }

  public skip(): void {
    if (this.status !== "playing" && this.status !== "stage-break") return;
    this.skipped = true;
    this.caught = this.finalTarget;
    this.stage = 2;
    this.status = "success";
  }
}
