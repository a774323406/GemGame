export type JellyCrushPhase = 'ready' | 'countdown' | 'playing' | 'pressing' | 'success' | 'failure';
export type JellyCrushEvent = 'hit' | 'miss' | 'escape' | 'heart' | 'slow' | null;

export interface JellyTarget {
  id: number;
  x: number;
  y: number;
  direction: number;
  active: boolean;
  seed: number;
  speedBurstMultiplier: number;
  speedBurstRemaining: number;
}

export interface JellyHitSnapshot {
  id: number;
  x: number;
  y: number;
}

export interface JellyItem {
  type: 'heart' | 'slow';
  x: number;
  y: number;
  direction: number;
  active: boolean;
}

export const JELLY_MAX_LIVES = 5;
export const JELLY_COUNTDOWN_SECONDS = 3;
export const JELLY_START_SECONDS = Number.POSITIVE_INFINITY;
export const JELLY_TARGET_SCORE = Number.POSITIVE_INFINITY;
export const JELLY_MAX_TARGETS = 6;

const FIELD_LEFT = -300;
const FIELD_RIGHT = 300;
const ESCAPE_LEFT = -390;
const ESCAPE_RIGHT = 390;
// The press plate and the visible jelly overlap well before their centres meet.
// Use the physical overlap width so a visible touch counts as a hit.
const HIT_RADIUS = 180;
const MAX_DT = 0.1;
// The warning strip starts at y=-384. The extracted jelly artwork has
// transparent padding below its visible body, so this center position puts
// the visible base directly on the strip instead of leaving a gap.
const JELLY_FLOOR_Y = -331;
const ITEM_FLOOR_Y = -357;
// Difficulty continues to ramp in endless mode without tying it to an
// infinite score target.  Scores above this reference simply clamp at the
// maximum difficulty together with elapsed time.
const DIFFICULTY_SCORE_REFERENCE = 30;
const JELLY_INITIAL_SPEED_MULTIPLIER = 1.3;
const SPEED_SURGE_MIN_MULTIPLIER = 1.28;
const SPEED_SURGE_MAX_MULTIPLIER = 1.58;
const SPEED_SURGE_MIN_SECONDS = 1.1;
const SPEED_SURGE_MAX_SECONDS = 2.1;
const TARGET_BURST_MIN_MULTIPLIER = 1.55;
const TARGET_BURST_MAX_MULTIPLIER = 1.95;
const TARGET_BURST_MIN_SECONDS = 0.45;
const TARGET_BURST_MAX_SECONDS = 0.95;
const TARGET_BURST_MIN_INTERVAL_SECONDS = 1.7;
const TARGET_BURST_MAX_INTERVAL_SECONDS = 3.4;
const TARGET_BURST_MAX_TARGETS = 3;
const WAVE_MIN_SECONDS = 3.8;
const WAVE_MAX_SECONDS = 5.8;
const SLOW_DURATION_SECONDS = 8;
const SLOW_SPEED_MULTIPLIER = 0.55;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Pure rules for the hydraulic press game. Renderers only read this state and
 * never decide whether a jelly, heart, or clock was collected. A life is lost
 * only when a jelly reaches an escape edge. Pressing empty does not cost life.
 */
export class JellyCrushRound {
  phase: JellyCrushPhase = 'ready';
  elapsed = 0;
  remaining = JELLY_START_SECONDS;
  lives = JELLY_MAX_LIVES;
  countdownRemaining = 0;
  speedMultiplier = 1;
  slowRemaining = 0;
  score = 0;
  attempts = 0;
  combo = 0;
  bestCombo = 0;
  pressAge = 0;
  pressDuration = 0.52;
  contactTime = 0.18;
  impactAge = 99;
  lastEvent: JellyCrushEvent = null;
  lastEventTargetId: number | null = null;
  lastEventTargetX = 0;
  lastEventTargetY = 0;
  lastEventTargetIds: number[] = [];
  lastEventTargetPositions: JellyHitSnapshot[] = [];
  lastCollectedItems: Array<'heart' | 'slow'> = [];
  escaped = 0;
  eventSerial = 0;
  targets: JellyTarget[] = [];
  readonly heart: JellyItem = { type: 'heart', x: -390, y: ITEM_FLOOR_Y, direction: 1, active: false };
  readonly clock: JellyItem = { type: 'slow', x: 390, y: ITEM_FLOOR_Y, direction: -1, active: false };

  private contactResolved = false;
  private seed: number;
  private heartCooldown = 2.5;
  private clockCooldown = 5.5;
  private waveTargetCount = 2;
  private nextWaveAt = 4.2;
  private speedSurgeMultiplier = 1;
  private speedSurgeRemaining = 0;
  private nextSpeedSurgeAt = 6.5;
  private nextTargetBurstAt = 5.4;

  public constructor(seed = 7919) {
    this.seed = seed;
    const starts = [-390, 390, -390, 390, -390, 390];
    const lanes = [JELLY_FLOOR_Y, JELLY_FLOOR_Y, JELLY_FLOOR_Y, JELLY_FLOOR_Y, JELLY_FLOOR_Y, JELLY_FLOOR_Y];
    for (let id = 0; id < JELLY_MAX_TARGETS; id += 1) {
      this.targets.push({
        id,
        x: starts[id],
        y: lanes[id],
        direction: id % 2 === 0 ? 1 : -1,
        active: id < 2,
        seed: id * 0.83 + 0.2,
        speedBurstMultiplier: 1,
        speedBurstRemaining: 0,
      });
    }
  }

  public get difficulty(): number {
    return clamp(this.elapsed / 45 + this.score / DIFFICULTY_SCORE_REFERENCE * 0.45, 0, 1);
  }

  public get activeTargetCount(): number {
    const scoreProgress = Math.min(2, Math.floor(this.score / 8));
    return Math.min(JELLY_MAX_TARGETS, Math.max(this.waveTargetCount, 2 + scoreProgress));
  }

  public get targetSpeed(): number {
    return (88 * JELLY_INITIAL_SPEED_MULTIPLIER + this.difficulty * 178) * this.speedMultiplier * this.speedSurgeMultiplier;
  }

  public get pressProgress(): number {
    if (this.phase !== 'pressing') return 0;
    const down = this.contactTime;
    if (this.pressAge <= down) return clamp(this.pressAge / down, 0, 1);
    return clamp(1 - (this.pressAge - down) / Math.max(0.1, this.pressDuration - down), 0, 1);
  }

  public get activeItem(): JellyItem | null {
    if (this.heart.active) return this.heart;
    if (this.clock.active) return this.clock;
    return null;
  }

  public start(): boolean {
    if (this.phase !== 'ready') return false;
    this.phase = 'countdown';
    this.countdownRemaining = JELLY_COUNTDOWN_SECONDS;
    return true;
  }

  public press(): boolean {
    if (this.phase === 'ready') this.start();
    if (this.phase !== 'playing') return false;
    this.attempts += 1;
    this.pressAge = 0;
    this.impactAge = 99;
    this.lastEvent = null;
    this.lastEventTargetId = null;
    this.lastEventTargetIds = [];
    this.lastEventTargetPositions = [];
    this.lastCollectedItems = [];
    this.contactResolved = false;
    this.pressDuration = Math.max(0.3, 0.52 - this.difficulty * 0.16);
    this.contactTime = Math.min(0.2, this.pressDuration * 0.38);
    this.phase = 'pressing';
    return true;
  }

  public tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'ready' || this.phase === 'success' || this.phase === 'failure') return;
    if (this.phase === 'countdown') {
      this.countdownRemaining = Math.max(0, this.countdownRemaining - Math.min(MAX_DT, dt));
      if (this.countdownRemaining <= 1e-8) {
        this.phase = 'playing';
        this.ensureTargets();
      }
      return;
    }
    let remainingDt = Math.min(MAX_DT, dt);
    while (remainingDt > 1e-7 && this.phase !== 'success' && this.phase !== 'failure') {
      const step = Math.min(remainingDt, 1 / 120);
      remainingDt -= step;
      this.elapsed += step;
      if (Number.isFinite(this.remaining)) this.remaining = Math.max(0, this.remaining - step);
      this.impactAge += step;
      this.updateDifficultyEvents(step);
      if (this.slowRemaining > 0) {
        this.slowRemaining = Math.max(0, this.slowRemaining - step);
        if (this.slowRemaining <= 1e-8) this.speedMultiplier = 1;
      }
      this.heartCooldown = Math.max(0, this.heartCooldown - step);
      this.clockCooldown = Math.max(0, this.clockCooldown - step);
      this.moveTargets(step);
      this.moveItems(step);
      this.trySpawnItems();

      if (this.phase === 'pressing') {
        this.pressAge += step;
        if (!this.contactResolved && this.pressAge >= this.contactTime - 1e-8) {
          this.contactResolved = true;
          this.resolveContact();
        }
        if (this.pressAge >= this.pressDuration - 1e-8) {
          this.phase = this.lives > 0 ? 'playing' : 'failure';
        }
      }

      this.ensureTargets();
      if (this.phase === 'playing' && Number.isFinite(JELLY_TARGET_SCORE) && this.score >= JELLY_TARGET_SCORE) {
        this.phase = 'success';
      }
      if (this.phase === 'playing' && (this.lives <= 0 || (Number.isFinite(this.remaining) && this.remaining <= 1e-8))) {
        this.phase = 'failure';
      }
    }
  }

  public addLife(): boolean {
    if (this.phase !== 'playing' && this.phase !== 'pressing') return false;
    if (this.lives >= JELLY_MAX_LIVES) return false;
    this.lives += 1;
    return true;
  }

  public revive(): boolean {
    if (this.phase !== 'failure') return false;
    this.lives = Math.max(2, Math.min(JELLY_MAX_LIVES, this.lives + 2));
    if (Number.isFinite(this.remaining)) this.remaining = Math.max(12, this.remaining + 15);
    this.phase = 'playing';
    this.pressAge = 0;
    this.contactResolved = false;
    this.lastEvent = null;
    this.lastEventTargetId = null;
    this.lastEventTargetIds = [];
    this.lastEventTargetPositions = [];
    this.lastCollectedItems = [];
    this.ensureTargets();
    return true;
  }

  public reset(): void {
    this.phase = 'ready';
    this.elapsed = 0;
    this.remaining = JELLY_START_SECONDS;
    this.lives = JELLY_MAX_LIVES;
    this.countdownRemaining = 0;
    this.speedMultiplier = 1;
    this.slowRemaining = 0;
    this.score = 0;
    this.attempts = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.pressAge = 0;
    this.pressDuration = 0.52;
    this.contactTime = 0.18;
    this.impactAge = 99;
    this.lastEvent = null;
    this.lastEventTargetId = null;
    this.lastEventTargetX = 0;
    this.lastEventTargetY = 0;
    this.lastEventTargetIds = [];
    this.lastEventTargetPositions = [];
    this.lastCollectedItems = [];
    this.escaped = 0;
    this.eventSerial = 0;
    this.contactResolved = false;
    this.heartCooldown = 2.5;
    this.clockCooldown = 5.5;
    this.waveTargetCount = 2;
    this.nextWaveAt = 4.2;
    this.speedSurgeMultiplier = 1;
    this.speedSurgeRemaining = 0;
    this.nextSpeedSurgeAt = 6.5;
    this.nextTargetBurstAt = 5.4;
    this.heart.active = false;
    this.clock.active = false;
    this.heart.direction = 1;
    this.clock.direction = -1;
    const starts = [-390, 390, -390, 390, -390, 390];
    this.targets.forEach((target, index) => {
      target.x = starts[index];
      target.direction = index % 2 === 0 ? 1 : -1;
      target.active = index < 2;
      target.speedBurstMultiplier = 1;
      target.speedBurstRemaining = 0;
    });
  }

  private moveTargets(dt: number): void {
    for (const target of this.targets) {
      if (!target.active) continue;
      if (target.speedBurstRemaining > 0) {
        target.speedBurstRemaining = Math.max(0, target.speedBurstRemaining - dt);
        if (target.speedBurstRemaining <= 1e-8) target.speedBurstMultiplier = 1;
      }
      target.x += target.direction * this.targetSpeed * target.speedBurstMultiplier * dt;
      const escapedRight = target.direction > 0 && target.x > ESCAPE_RIGHT;
      const escapedLeft = target.direction < 0 && target.x < ESCAPE_LEFT;
      if (escapedRight || escapedLeft) {
        this.recordEscape(target);
        continue;
      }
    }
  }

  private updateDifficultyEvents(dt: number): void {
    if (this.speedSurgeRemaining > 0) {
      this.speedSurgeRemaining = Math.max(0, this.speedSurgeRemaining - dt);
      if (this.speedSurgeRemaining <= 1e-8) this.speedSurgeMultiplier = 1;
    }

    while (this.elapsed >= this.nextWaveAt) {
      const progress = Math.min(2, Math.floor((this.elapsed + this.score * 0.35) / 12));
      const roll = this.nextRandom();
      // Every later wave introduces at least one extra jelly. The second
      // branch makes the larger 4–6 jelly bursts deterministic per seed while
      // still varying the pattern from wave to wave.
      const extra = roll > 0.58 ? 2 : 1;
      this.waveTargetCount = Math.min(JELLY_MAX_TARGETS, 2 + progress + extra);
      this.nextWaveAt += WAVE_MIN_SECONDS + this.nextRandom() * (WAVE_MAX_SECONDS - WAVE_MIN_SECONDS);
    }

    while (this.elapsed >= this.nextSpeedSurgeAt) {
      // Each beat happens on schedule. Its intensity and duration stay random
      // so the player cannot predict how hard the next acceleration will be.
      this.speedSurgeMultiplier = SPEED_SURGE_MIN_MULTIPLIER
        + this.nextRandom() * (SPEED_SURGE_MAX_MULTIPLIER - SPEED_SURGE_MIN_MULTIPLIER);
      this.speedSurgeRemaining = SPEED_SURGE_MIN_SECONDS
        + this.nextRandom() * (SPEED_SURGE_MAX_SECONDS - SPEED_SURGE_MIN_SECONDS);
      this.nextSpeedSurgeAt += 5.5 + this.nextRandom() * 4.5;
    }

    while (this.elapsed >= this.nextTargetBurstAt) {
      const active = this.targets.filter(target => target.active);
      if (active.length > 0 && this.nextRandom() > 0.18) {
        const burstCount = Math.min(
          active.length,
          1 + Math.floor(this.nextRandom() * TARGET_BURST_MAX_TARGETS),
        );
        const candidates = [...active];
        for (let index = 0; index < burstCount; index += 1) {
          const candidateIndex = Math.floor(this.nextRandom() * candidates.length);
          const target = candidates.splice(candidateIndex, 1)[0];
          target.speedBurstMultiplier = TARGET_BURST_MIN_MULTIPLIER
            + this.nextRandom() * (TARGET_BURST_MAX_MULTIPLIER - TARGET_BURST_MIN_MULTIPLIER);
          target.speedBurstRemaining = TARGET_BURST_MIN_SECONDS
            + this.nextRandom() * (TARGET_BURST_MAX_SECONDS - TARGET_BURST_MIN_SECONDS);
        }
      }
      this.nextTargetBurstAt += TARGET_BURST_MIN_INTERVAL_SECONDS
        + this.nextRandom() * (TARGET_BURST_MAX_INTERVAL_SECONDS - TARGET_BURST_MIN_INTERVAL_SECONDS);
    }
  }

  private moveItems(dt: number): void {
    const speed = this.targetSpeed * 0.72;
    for (const item of [this.heart, this.clock]) {
      if (!item.active) continue;
      item.x += item.direction * speed * dt;
      if (item.x > ESCAPE_RIGHT || item.x < ESCAPE_LEFT) item.active = false;
    }
  }

  private trySpawnItems(): void {
    if (this.phase !== 'playing') return;
    if (!this.heart.active && this.score >= 3 && this.elapsed >= 7 && this.heartCooldown <= 0) {
      this.heart.active = true;
      this.heart.direction = this.nextRandom() > 0.5 ? 1 : -1;
      this.heart.x = this.heart.direction > 0 ? ESCAPE_LEFT : ESCAPE_RIGHT;
      this.heart.y = ITEM_FLOOR_Y;
      this.heartCooldown = 10 + this.nextRandom() * 5;
    }
    if (!this.clock.active && this.score >= 7 && this.elapsed >= 14 && this.clockCooldown <= 0) {
      this.clock.active = true;
      this.clock.direction = this.nextRandom() > 0.5 ? 1 : -1;
      this.clock.x = this.clock.direction > 0 ? ESCAPE_LEFT : ESCAPE_RIGHT;
      this.clock.y = ITEM_FLOOR_Y;
      this.clockCooldown = 14 + this.nextRandom() * 7;
    }
  }

  private resolveContact(): void {
    const hitTargets = this.targets.filter(target => target.active && Math.abs(target.x) <= HIT_RADIUS);
    const hitItems = [this.heart, this.clock].filter(item => item.active && Math.abs(item.x) <= HIT_RADIUS);
    this.lastCollectedItems = hitItems.map(item => item.type);
    hitItems.forEach(item => {
      item.active = false;
      if (item.type === 'heart') {
        this.lives = Math.min(JELLY_MAX_LIVES, this.lives + 1);
      } else {
        this.slowRemaining = SLOW_DURATION_SECONDS;
        this.speedMultiplier = SLOW_SPEED_MULTIPLIER;
      }
    });

    if (hitTargets.length > 0) {
      hitTargets.forEach(target => { target.active = false; });
      this.lastEventTargetIds = hitTargets.map(target => target.id);
      this.lastEventTargetPositions = hitTargets.map(target => ({ id: target.id, x: target.x, y: target.y }));
      this.lastEventTargetId = hitTargets[0].id;
      this.lastEventTargetX = hitTargets[0].x;
      this.lastEventTargetY = hitTargets[0].y;
      this.score += hitTargets.length;
      this.combo += hitTargets.length;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.lastEvent = 'hit';
    } else if (hitItems.length > 0) {
      this.combo = 0;
      this.lastEvent = hitItems[0].type;
    } else {
      this.combo = 0;
      this.lastEvent = 'miss';
    }
    this.eventSerial += 1;
    this.impactAge = 0;
  }

  private recordEscape(target: JellyTarget): void {
    target.active = false;
    this.lastEvent = 'escape';
    this.lastEventTargetId = target.id;
    this.lastEventTargetX = target.x;
    this.lastEventTargetY = target.y;
    this.escaped += 1;
    this.lives = Math.max(0, this.lives - 1);
    this.combo = 0;
    this.eventSerial += 1;
    this.impactAge = 0;
  }

  private ensureTargets(): void {
    const wanted = this.activeTargetCount;
    const active = this.targets.filter(target => target.active).length;
    if (active >= wanted) return;
    const inactive = this.targets.filter(target => !target.active);
    const incoming = Math.min(inactive.length, wanted - active);
    const sideMode = this.nextRandom();
    for (let index = 0; index < incoming; index += 1) {
      const target = inactive.shift();
      if (!target) break;
      let fromLeft = this.nextRandom() > 0.5;
      if (sideMode < 0.3) fromLeft = true;
      else if (sideMode > 0.7) fromLeft = false;
      this.spawnTarget(target, fromLeft);
    }
  }

  private spawnTarget(target: JellyTarget, fromLeft: boolean): void {
    target.active = true;
    const spawnOffset = 60 + this.nextRandom() * 120;
    target.x = fromLeft ? ESCAPE_LEFT - spawnOffset : ESCAPE_RIGHT + spawnOffset;
    target.y = JELLY_FLOOR_Y;
    target.direction = fromLeft ? 1 : -1;
    target.speedBurstMultiplier = 1;
    target.speedBurstRemaining = 0;
  }

  private spawnX(offset: number): number {
    return FIELD_LEFT + this.nextRandom() * (FIELD_RIGHT - FIELD_LEFT) + Math.sin(this.elapsed + offset) * 18;
  }

  private nextRandom(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
