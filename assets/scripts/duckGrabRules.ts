/** Scene-independent timing; the hit is sampled when the hand reaches the neck. */
export class DuckGrabRound {
  phase: 'playing' | 'success' | 'failure' = 'playing';
  remaining = 60;
  attempts = 0;
  speedMultiplier = 1;
  swing = 0;
  reachAge = -1;
  tauntRemaining = 0;
  private checked = false;
  private adUnlocked = false;
  private dodgeOffset = 0;
  get catchUnlocked(): boolean { return this.adUnlocked || this.remaining <= 30 + 1e-8; }
  unlockCatching(): void { this.adUnlocked = true; }
  private get dodgeAngle(): number {
    if (!this.reaching) return 0;
    const t = this.reachAge <= .18 ? this.reachAge / .18 : Math.max(0, 1 - (this.reachAge - .18) / .24);
    return this.dodgeOffset * t * t * (3 - 2 * t);
  }
  get angle(): number { return Math.sin(this.swing) * 43 + this.dodgeAngle; }
  get neckX(): number { return -Math.sin(this.angle * Math.PI / 180) * 190; }
  get neckY(): number { return -220 + Math.cos(this.angle * Math.PI / 180) * 190; }
  get reaching(): boolean { return this.reachAge >= 0; }
  get handProgress(): number {
    if (!this.reaching) return 0;
    if (this.phase === 'success') return 1;
    return this.reachAge < .18 ? Math.min(1, this.reachAge / .18) : Math.max(0, 1 - (this.reachAge - .18) / .24);
  }
  attempt(): boolean {
    if (this.phase !== 'playing' || this.reaching) return false;
    // Plan a smooth visible dodge before contact, never reject a rendered hit.
    const predicted = Math.sin(this.swing + .18 * 3.3 * 3 * this.speedMultiplier) * 43;
    this.dodgeOffset = !this.catchUnlocked && Math.abs(predicted) < 20
      ? (predicted >= 0 ? 28 : -28) - predicted : 0;
    this.attempts++; this.tauntRemaining = 0; this.reachAge = 0; this.checked = false; return true;
  }
  slowDown(): void { if (this.phase === 'playing') this.speedMultiplier *= .72; }
  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase !== 'playing') return;
    let left = Math.min(dt, this.remaining);
    while (left > 1e-9 && this.phase === 'playing') {
      const step = Math.min(left, 1 / 120); left -= step;
      this.remaining = Math.max(0, this.remaining - step);
      // Brief reactive dodge during the reaching action; reward slowdown still applies.
      const burst = this.reaching && this.reachAge < .26 ? 3 : 1;
      this.swing += step * 3.3 * this.speedMultiplier * burst;
      this.tauntRemaining = Math.max(0, this.tauntRemaining - step);
      if (this.remaining < 1e-8) { this.remaining = 0; this.phase = 'failure'; break; }
      if (!this.reaching) continue;
      this.reachAge += step;
      if (!this.checked && this.reachAge >= .18 - 1e-8) {
        this.checked = true;
        if (Math.abs(this.neckX) <= 32) this.phase = 'success';
        else this.tauntRemaining = .65;
      }
      if (this.phase === 'playing' && this.reachAge >= .42) this.reachAge = -1;
    }
  }
}
