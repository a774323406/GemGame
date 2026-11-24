/** Deterministic rules for the air-drop rescue feed game. Coordinates use y down. */

export type AirdropRescuePhase = 'ready' | 'playing' | 'success' | 'failure';
export type AirdropTargetState = 'suspended' | 'falling';

export interface AirdropTarget {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: AirdropTargetState;
  side: -1 | 1;
}

export interface AirdropEvent {
  kind: 'caught' | 'miss' | 'spawn' | 'recycle';
  targetId: number;
  x: number;
  y: number;
}

export interface AirdropSnapshot {
  phase: AirdropRescuePhase;
  timeRemaining: number;
  food: number;
  chances: number;
  targets: AirdropTarget[];
}

export interface AirdropRescueOptions {
  random?: () => number;
}

const STEP = 1 / 120;
const MAX_FRAME_SECONDS = 0.5;
const GRAVITY = 1500;
const SCREEN_HALF_WIDTH = 375;
const SCREEN_BOTTOM = 720;
const BOTTLE_MOUTH_Y = 620;
const BOTTLE_MOUTH_HALF_WIDTH = 96;
const MAX_TARGETS = 12;
const EPSILON = 1e-8;

export class AirdropRescueRound {
  phase: AirdropRescuePhase = 'ready';
  timeRemaining = 300;
  food = 0;
  chances = 25;
  readonly targets: AirdropTarget[] = [];

  private readonly random: () => number;
  private accumulator = 0;
  private previewAccumulator = 0;
  private nextTargetId = 1;
  private spawnCooldown = 0;
  private events: AirdropEvent[] = [];

  constructor(options: AirdropRescueOptions = {}) {
    this.random = options.random ?? Math.random;
  }

  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'playing';
    this.spawnCooldown = 0;
    this.trySpawnTargets();
  }

  step(deltaSeconds: number): void {
    if (this.phase !== 'playing' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.accumulator += Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    while (this.accumulator + EPSILON >= STEP && this.phase === 'playing') {
      this.accumulator = Math.max(0, this.accumulator - STEP);
      this.fixedStep(STEP);
    }
  }

  previewStep(deltaSeconds: number): void {
    if (this.phase !== 'playing' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.previewAccumulator += Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    while (this.previewAccumulator + EPSILON >= STEP) {
      this.previewAccumulator = Math.max(0, this.previewAccumulator - STEP);
      for (const target of [...this.targets]) {
        if (target.state !== 'suspended') continue;
        target.x += target.vx * STEP;
        if (target.x < -SCREEN_HALF_WIDTH - 90 || target.x > SCREEN_HALF_WIDTH + 90) this.recycle(target, 'recycle');
      }
      this.spawnCooldown = Math.max(0, this.spawnCooldown - STEP);
      this.trySpawnTargets();
    }
  }

  spawnTarget(overrides: Partial<AirdropTarget> = {}): number {
    const side = overrides.side ?? ((overrides.vx ?? 1) >= 0 ? 1 : -1);
    const target: AirdropTarget = {
      id: this.nextTargetId++,
      x: overrides.x ?? side * (SCREEN_HALF_WIDTH + 70),
      y: overrides.y ?? 150 + this.random() * 260,
      vx: overrides.vx ?? side * (110 + this.random() * 90),
      vy: overrides.vy ?? 0,
      state: overrides.state ?? 'suspended',
      side,
    };
    this.targets.push(target);
    this.events.push({ kind: 'spawn', targetId: target.id, x: target.x, y: target.y });
    return target.id;
  }

  releaseTarget(id: number): boolean {
    if (this.phase !== 'playing') return false;
    const target = this.targets.find(item => item.id === id);
    if (!target || target.state !== 'suspended') return false;
    target.state = 'falling';
    target.vy = Math.max(20, target.vy);
    return true;
  }

  addTime(seconds: number): boolean {
    if (this.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return false;
    this.timeRemaining += seconds;
    return true;
  }

  completeLevel(): void {
    if (this.phase === 'playing') this.phase = 'success';
  }

  revive(): boolean {
    if (this.phase !== 'failure') return false;
    this.chances = 5;
    this.phase = 'playing';
    this.accumulator = 0;
    this.spawnCooldown = 0.2;
    this.trySpawnTargets();
    return true;
  }

  drainEvents(): AirdropEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  getSnapshot(): AirdropSnapshot {
    return {
      phase: this.phase,
      timeRemaining: this.timeRemaining,
      food: this.food,
      chances: this.chances,
      targets: this.targets.map(target => ({ ...target })),
    };
  }

  private fixedStep(dt: number): void {
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    this.spawnCooldown = Math.max(0, this.spawnCooldown - dt);

    for (const target of [...this.targets]) {
      if (target.state === 'suspended') {
        target.x += target.vx * dt;
        if (target.x < -SCREEN_HALF_WIDTH - 90 || target.x > SCREEN_HALF_WIDTH + 90) {
          this.recycle(target, 'recycle');
        }
        continue;
      }

      const previousY = target.y;
      target.vy += GRAVITY * dt;
      target.x += target.vx * dt;
      target.y += target.vy * dt;

      if (previousY < BOTTLE_MOUTH_Y && target.y >= BOTTLE_MOUTH_Y) {
        if (Math.abs(target.x) <= BOTTLE_MOUTH_HALF_WIDTH) {
          this.food += 1;
          this.events.push({ kind: 'caught', targetId: target.id, x: target.x, y: BOTTLE_MOUTH_Y });
          this.recycle(target, 'caught');
          if (this.food >= 5) this.phase = 'success';
        } else {
          this.miss(target);
        }
      } else if (target.y > SCREEN_BOTTOM) {
        this.miss(target);
      }
    }

    this.trySpawnTargets();
    if (this.phase === 'playing' && (this.chances <= 0 || this.timeRemaining <= EPSILON)) {
      this.phase = 'failure';
    }
  }

  private miss(target: AirdropTarget): void {
    this.chances = Math.max(0, this.chances - 1);
    this.events.push({ kind: 'miss', targetId: target.id, x: target.x, y: target.y });
    this.recycle(target, 'miss');
  }

  private recycle(target: AirdropTarget, kind: AirdropEvent['kind']): void {
    const index = this.targets.indexOf(target);
    if (index >= 0) this.targets.splice(index, 1);
    if (kind !== 'caught' && kind !== 'miss' && kind !== 'recycle') return;
  }

  private trySpawnTargets(): void {
    if (this.phase !== 'playing' || this.spawnCooldown > EPSILON || this.targets.length >= MAX_TARGETS) return;
    const difficulty = Math.min(1, Math.max(0, (300 - this.timeRemaining) / 300));
    const count = this.targets.length === 0 ? 1 : (this.random() < 0.25 + difficulty * 0.35 ? 2 : 1);
    for (let index = 0; index < count && this.targets.length < MAX_TARGETS; index += 1) {
      const side: -1 | 1 = this.random() < 0.5 ? -1 : 1;
      this.spawnTarget({
        side,
        x: side * (SCREEN_HALF_WIDTH + 80),
        y: 130 + this.random() * 190,
        vx: side * (120 + difficulty * 100 + this.random() * 80),
      });
    }
    this.spawnCooldown = Math.max(0.55, 1.3 - difficulty * 0.55);
  }
}
