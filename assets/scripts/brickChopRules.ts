import { CHOP_CONTACT_TIME, chopEndTime } from './brickChopFeedback';
const TOTAL_BRICKS = 12;
/** One shared brick sprite is repeated; rules never depend on rendered nodes. */
export function bricksForPower(power: number, remaining = TOTAL_BRICKS): number {
  if (!Number.isFinite(power) || power <= 0 || remaining <= 0) return 0;
  if (power >= .98) return remaining;
  // Original layers keep their thresholds even after the upper bricks are gone.
  // The first 11 require strictly exceeding layer / 12; the last uses >= 98%.
  let reachable = 0;
  for (let layer = 1; layer < TOTAL_BRICKS; layer++) {
    // Ignore arithmetic noise from sampling the triangular power meter.
    if (power - layer / TOTAL_BRICKS > 1e-12) reachable = layer;
  }
  const alreadyBroken = TOTAL_BRICKS - remaining;
  return Math.max(0, reachable - alreadyBroken);
}

export class BrickChopRound {
  phase: 'aiming' | 'striking' | 'success' | 'failure' = 'aiming';
  remaining = TOTAL_BRICKS;
  chances = 3;
  attempts = 0;
  speedMultiplier = 1;
  chargeTime = 0;
  strikeAge = 0;
  strikePower = 0;
  lastHit = 0;
  beforeStrike = TOTAL_BRICKS;
  impacted = false;
  get power(): number { return 1 - Math.abs(1 - (this.chargeTime / .9) % 2); }
  strike(): boolean {
    if (this.phase !== 'aiming' || this.chances <= 0) return false;
    this.strikePower = this.power;
    this.lastHit = bricksForPower(this.strikePower, this.remaining);
    this.beforeStrike = this.remaining;
    this.chances--; this.attempts++; this.strikeAge = 0; this.impacted = false;
    this.phase = 'striking';
    return true;
  }
  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.phase === 'aiming') { this.chargeTime = (this.chargeTime + dt * this.speedMultiplier) % 1.8; return; }
    if (this.phase !== 'striking') return;
    this.strikeAge += dt;
    if (!this.impacted && this.strikeAge >= CHOP_CONTACT_TIME - 1e-8) {
      this.impacted = true;
      this.remaining -= this.lastHit;
    }
    if (this.strikeAge >= chopEndTime(this.lastHit) - 1e-8) {
      this.phase = this.remaining === 0 ? 'success' : this.chances === 0 ? 'failure' : 'aiming';
      this.chargeTime = 0;
    }
  }
  slowDown(): boolean {
    if (this.phase !== 'aiming') return false;
    this.speedMultiplier = Math.max(.3, this.speedMultiplier * .72); return true;
  }
  addChances(): boolean {
    if (this.phase !== 'aiming') return false;
    this.chances += 3; return true;
  }
}
