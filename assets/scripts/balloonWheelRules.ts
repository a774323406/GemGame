/** Pure round rules: no Cocos scene, timers, ads or storage dependencies. */
export type BalloonRoundStatus = "playing" | "success" | "failed";
export type BalloonFailure = "character" | "ammo" | "time" | null;
export type BalloonShotTarget = number | "character" | "miss";
export interface BalloonShotResult { kind: "balloon" | "character" | "miss"; index: number; }
export interface SpriteHitMask { width: number; height: number; rows: number[][]; }

/** Rows contain [start, endExclusive] alpha spans, measured from the top left. */
export function containsMaskPoint(mask: SpriteHitMask, u: number, v: number): boolean {
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || v < 0 || u >= 1 || v >= 1) return false;
  const x = Math.floor(u * mask.width);
  const spans = mask.rows[Math.floor(v * mask.height)] || [];
  for (let i = 0; i + 1 < spans.length; i += 2) {
    if (x >= spans[i] && x < spans[i + 1]) return true;
  }
  return false;
}

export class BalloonWheelRound {
  public status: BalloonRoundStatus = "playing";
  public failure: BalloonFailure = null;
  public remainingAmmo = 0;
  public remainingTime = 0;
  public shots = 0;
  public hits = 0;
  public cooldown = 0;
  public balloons: boolean[] = [];

  public reset(count = 6, ammo = 8, seconds = 60): void {
    this.balloons = Array(Math.max(1, Math.floor(count))).fill(true);
    this.remainingAmmo = Math.max(1, Math.floor(ammo));
    this.remainingTime = Math.max(1, seconds);
    this.shots = this.hits = this.cooldown = 0;
    this.status = "playing";
    this.failure = null;
  }

  public get score(): number { return this.hits * 350; }
  public get accuracy(): number { return this.shots > 0 ? Math.round(this.hits / this.shots * 100) : 0; }

  public tick(seconds: number): void {
    if (this.status !== "playing" || !Number.isFinite(seconds) || seconds <= 0) return;
    this.cooldown = Math.max(0, this.cooldown - seconds);
    this.remainingTime = Math.max(0, this.remainingTime - seconds);
    if (this.remainingTime <= 0) this.fail("time");
  }

  public fire(target: BalloonShotTarget, cooldown = 0.18): BalloonShotResult | null {
    if (this.status !== "playing" || this.remainingAmmo <= 0 || this.cooldown > 0) return null;
    this.remainingAmmo--;
    this.shots++;
    this.cooldown = Math.max(0, cooldown);
    const result: BalloonShotResult = { kind: "miss", index: -1 };
    if (target === "character") {
      result.kind = "character";
      this.fail("character");
      return result;
    }
    if (typeof target === "number" && Number.isInteger(target) && this.balloons[target]) {
      result.kind = "balloon";
      result.index = target;
      this.balloons[target] = false;
      this.hits++;
    }
    // Last bullet popping the last balloon wins; exhaustion is checked afterwards.
    if (this.balloons.every(alive => !alive)) this.status = "success";
    else if (this.remainingAmmo <= 0) this.fail("ammo");
    return result;
  }

  public addAmmo(amount: number): void {
    if (this.status === "playing" && Number.isFinite(amount)) this.remainingAmmo += Math.max(0, Math.floor(amount));
  }

  public addTime(seconds: number): void {
    if (this.status === "playing" && Number.isFinite(seconds)) this.remainingTime += Math.max(0, seconds);
  }

  /** Match the bottle challenge: repair exhausted resources without resetting hits/score. */
  public revive(): boolean {
    if (this.status !== "failed") return false;
    if (this.remainingAmmo <= 0) this.remainingAmmo += 5;
    if (this.remainingTime <= 0) this.remainingTime += 20;
    this.status = "playing";
    this.failure = null;
    this.cooldown = 0.18;
    return true;
  }

  private fail(reason: BalloonFailure): void {
    this.status = "failed";
    this.failure = reason;
  }
}
