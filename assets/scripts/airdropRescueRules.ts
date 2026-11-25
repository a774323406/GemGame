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
  cruiseVx: number;
  burstStartX: number | null;
  burstMultiplier: number;
  burstProgress: number;
}

export interface AirdropDepartingHelicopter {
  id: number;
  x: number;
  y: number;
  vx: number;
  age: number;
}

export interface AirdropCollectedFood {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  direction: -1 | 1;
}

export interface AirdropEvent {
  kind: 'caught' | 'miss' | 'spawn' | 'recycle';
  targetId: number;
  x: number;
  y: number;
}

export interface AirdropSnapshot {
  phase: AirdropRescuePhase;
  elapsedSeconds: number;
  slowRemaining: number;
  food: number;
  chances: number;
  targets: AirdropTarget[];
  departingHelicopters: AirdropDepartingHelicopter[];
  collectedFood: AirdropCollectedFood[];
}

export interface AirdropRescueOptions {
  random?: () => number;
}

/** Scene geometry in the same downward-y coordinates as the targets. */
export interface AirdropRescueArena {
  halfWidth: number;
  floorY: number;
  mouthX: number;
  mouthY: number;
  mouthHalfWidth: number;
  flightMinY: number;
  flightMaxY: number;
  bodyCenterX: number;
  bodyCenterY: number;
  bodyHalfWidth: number;
  bodyHalfHeight: number;
}

const STEP = 1 / 120;
const MAX_FRAME_SECONDS = 0.5;
const GRAVITY = 1500;
const MAX_TARGETS = 8;
const EPSILON = 1e-8;
const SLOW_SPEED_SCALE = 0.5;
const BURST_RAMP_SECONDS = 0.16;
const DIFFICULTY_RAMP_SECONDS = 120;
// The authored rope is centered 50 units above the vegetable and is 62 units long.
const ROPE_TOP_OFFSET = 81;
const ROPE_BOTTOM_OFFSET = 19;
const CUT_PADDING = 7;
const COLLECTED_FOOD_RADIUS = 28;

function segmentCrossesRect(x0: number, y0: number, x1: number, y1: number,
  left: number, right: number, top: number, bottom: number): boolean {
  let enter = 0;
  let leave = 1;
  for (const [origin, delta, min, max] of [[x0, x1 - x0, left, right], [y0, y1 - y0, top, bottom]]) {
    if (Math.abs(delta) < EPSILON) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const a = (min - origin) / delta;
    const b = (max - origin) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

export class AirdropRescueRound {
  phase: AirdropRescuePhase = 'ready';
  elapsedSeconds = 0;
  slowRemaining = 0;
  food = 0;
  chances = 25;
  maxChances = 25;
  readonly targets: AirdropTarget[] = [];
  readonly departingHelicopters: AirdropDepartingHelicopter[] = [];
  readonly collectedFood: AirdropCollectedFood[] = [];

  private readonly random: () => number;
  private accumulator = 0;
  private previewAccumulator = 0;
  private contentsAccumulator = 0;
  private nextTargetId = 1;
  private spawnCooldown = 0;
  private events: AirdropEvent[] = [];
  private arena: AirdropRescueArena = {
    halfWidth: 375,
    floorY: 720,
    mouthX: 0,
    mouthY: 620,
    mouthHalfWidth: 96,
    flightMinY: 130,
    flightMaxY: 320,
    bodyCenterX: 0,
    bodyCenterY: 665,
    bodyHalfWidth: 124,
    bodyHalfHeight: 52,
  };

  constructor(options: AirdropRescueOptions = {}) {
    this.random = options.random ?? Math.random;
  }

  setArena(arena: AirdropRescueArena): void {
    for (const food of this.collectedFood) {
      food.x += arena.bodyCenterX - this.arena.bodyCenterX;
      food.y += arena.bodyCenterY - this.arena.bodyCenterY;
    }
    this.arena = { ...arena };
  }

  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'playing';
    this.spawnCooldown = 0;
    this.trySpawnTargets();
  }

  step(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.advanceDepartures(Math.min(deltaSeconds, MAX_FRAME_SECONDS));
    this.advanceContents(Math.min(deltaSeconds, MAX_FRAME_SECONDS));
    if (this.phase !== 'playing') return;
    this.accumulator += Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    while (this.accumulator + EPSILON >= STEP && this.phase === 'playing') {
      this.accumulator = Math.max(0, this.accumulator - STEP);
      this.fixedStep(STEP);
    }
  }

  previewStep(deltaSeconds: number): void {
    if (this.phase !== 'playing' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.advanceDepartures(Math.min(deltaSeconds, MAX_FRAME_SECONDS));
    this.advanceContents(Math.min(deltaSeconds, MAX_FRAME_SECONDS));
    this.previewAccumulator += Math.min(deltaSeconds, MAX_FRAME_SECONDS);
    while (this.previewAccumulator + EPSILON >= STEP) {
      this.previewAccumulator = Math.max(0, this.previewAccumulator - STEP);
      for (const target of [...this.targets]) {
        if (target.state !== 'suspended') continue;
        this.advanceFlight(target, STEP);
        if (Math.abs(target.x) > this.arena.halfWidth + 130) this.recycle(target, 'recycle');
      }
      this.spawnCooldown = Math.max(0, this.spawnCooldown - STEP);
      this.trySpawnTargets();
    }
  }

  spawnTarget(overrides: Partial<AirdropTarget> = {}): number {
    const side = overrides.side ?? ((overrides.vx ?? 1) >= 0 ? 1 : -1);
    const cruiseVx = overrides.cruiseVx ?? overrides.vx ?? -side * (110 + this.random() * 90);
    const target: AirdropTarget = {
      id: this.nextTargetId++,
      x: overrides.x ?? side * (this.arena.halfWidth + 130),
      y: overrides.y ?? this.arena.flightMinY + this.random() * (this.arena.flightMaxY - this.arena.flightMinY),
      vx: overrides.vx ?? cruiseVx,
      vy: overrides.vy ?? 0,
      state: overrides.state ?? 'suspended',
      side,
      cruiseVx,
      burstStartX: overrides.burstStartX ?? null,
      burstMultiplier: overrides.burstMultiplier ?? 1,
      burstProgress: overrides.burstProgress ?? 0,
    };
    if (target.state === 'suspended') this.updateFlightVelocity(target);
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
    // Vegetables keep their actual release velocity. The separate aircraft uses
    // an unscaled velocity so later slowdown changes do not affect the vegetable.
    this.departingHelicopters.push({
      id: target.id, x: target.x, y: target.y,
      vx: target.vx / this.helicopterSpeedScale, age: 0,
    });
    return true;
  }

  cutRopes(x0: number, y0: number, x1: number, y1: number): number {
    if (this.phase !== 'playing' || ![x0, y0, x1, y1].every(Number.isFinite)) return 0;
    if ((x1 - x0) ** 2 + (y1 - y0) ** 2 < 4) return 0;
    let cuts = 0;
    for (const target of this.targets) {
      if (target.state !== 'suspended') continue;
      if (segmentCrossesRect(x0, y0, x1, y1,
        target.x - CUT_PADDING, target.x + CUT_PADDING,
        target.y - ROPE_TOP_OFFSET - CUT_PADDING, target.y - ROPE_BOTTOM_OFFSET + CUT_PADDING)
        && this.releaseTarget(target.id)) cuts += 1;
    }
    return cuts;
  }

  slowDown(seconds = 20): boolean {
    if (this.phase !== 'playing' || this.slowRemaining > EPSILON || !Number.isFinite(seconds) || seconds <= 0) return false;
    this.slowRemaining = seconds;
    for (const target of this.targets) {
      if (target.state === 'suspended') this.updateFlightVelocity(target);
    }
    return true;
  }

  completeLevel(): void {
    if (this.phase === 'playing') this.phase = 'success';
  }

  revive(): boolean {
    if (this.phase !== 'failure') return false;
    this.chances = 5;
    this.maxChances = 5;
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
      elapsedSeconds: this.elapsedSeconds,
      slowRemaining: this.slowRemaining,
      food: this.food,
      chances: this.chances,
      targets: this.targets.map(target => ({ ...target })),
      departingHelicopters: this.departingHelicopters.map(helicopter => ({ ...helicopter })),
      collectedFood: this.collectedFood.map(food => ({ ...food })),
    };
  }

  private get helicopterSpeedScale(): number {
    return this.slowRemaining > EPSILON ? SLOW_SPEED_SCALE : 1;
  }

  private updateFlightVelocity(target: AirdropTarget): void {
    const burst = 1 - (1 - target.burstProgress) ** 3;
    target.vx = target.cruiseVx * (1 + (target.burstMultiplier - 1) * burst) * this.helicopterSpeedScale;
  }

  private advanceFlight(target: AirdropTarget, dt: number): void {
    // Trigger at a visible position, so slowing an aircraft cannot make it
    // complete its burst while it is still outside the screen.
    if (target.burstStartX !== null && (target.x - target.burstStartX) * Math.sign(target.cruiseVx) >= 0) {
      target.burstProgress = Math.min(1, target.burstProgress + dt / BURST_RAMP_SECONDS);
    }
    this.updateFlightVelocity(target);
    target.x += target.vx * dt;
  }

  private advanceDepartures(dt: number): void {
    const flightDt = dt * this.helicopterSpeedScale;
    for (let index = this.departingHelicopters.length - 1; index >= 0; index -= 1) {
      const helicopter = this.departingHelicopters[index];
      helicopter.age += flightDt;
      helicopter.x += helicopter.vx * (1 + .55 * (1 - Math.exp(-helicopter.age * 3))) * flightDt;
      helicopter.y -= Math.min(90, helicopter.age * 240) * flightDt;
      if (Math.abs(helicopter.x) > this.arena.halfWidth + 130 || helicopter.age > 8) {
        this.departingHelicopters.splice(index, 1);
      }
    }
  }

  private advanceContents(deltaSeconds: number): void {
    // Continue the visible entry/settling motion behind the result overlay too.
    this.contentsAccumulator += deltaSeconds;
    while (this.contentsAccumulator + EPSILON >= STEP) {
      this.contentsAccumulator = Math.max(0, this.contentsAccumulator - STEP);
      for (const food of this.collectedFood) {
        food.vy = Math.min(420, food.vy + 850 * STEP);
        food.vx *= Math.exp(-1.8 * STEP);
        food.x += food.vx * STEP;
        food.y += food.vy * STEP;
        food.angle += food.spin * STEP;
        food.spin *= Math.exp(-2.5 * STEP);
        this.constrainInsideBottle(food);
      }
      // A small disc solver lets collected vegetables pile up instead of occupying
      // the same point or falling through the curved bottle floor.
      for (let pass = 0; pass < 3; pass += 1) {
        for (let i = 0; i < this.collectedFood.length; i += 1) {
          const a = this.collectedFood[i];
          for (let j = i + 1; j < this.collectedFood.length; j += 1) {
            const b = this.collectedFood[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distance = Math.hypot(dx, dy);
            const diameter = COLLECTED_FOOD_RADIUS * 2;
            if (distance >= diameter) continue;
            const nx = distance > EPSILON ? dx / distance : 0;
            const ny = distance > EPSILON ? dy / distance : 1;
            const correction = (diameter - distance) / 2;
            a.x -= nx * correction; a.y -= ny * correction;
            b.x += nx * correction; b.y += ny * correction;
            const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (speed < 0) {
              const impulse = -.55 * speed;
              a.vx -= impulse * nx; a.vy -= impulse * ny;
              b.vx += impulse * nx; b.vy += impulse * ny;
            }
          }
        }
        for (const food of this.collectedFood) this.constrainInsideBottle(food);
      }
    }
  }

  private constrainInsideBottle(food: AirdropCollectedFood): void {
    const radius = COLLECTED_FOOD_RADIUS;
    const neckHalfWidth = Math.max(2, this.arena.mouthHalfWidth - radius);
    const neckBottomY = this.arena.bodyCenterY - this.arena.bodyHalfHeight + radius + 4;
    if (food.y < neckBottomY) {
      const left = this.arena.mouthX - neckHalfWidth;
      const right = this.arena.mouthX + neckHalfWidth;
      if (food.x < left) { food.x = left; food.vx = Math.abs(food.vx) * .25; }
      if (food.x > right) { food.x = right; food.vx = -Math.abs(food.vx) * .25; }
      // Food already collected cannot be pushed back out through the opening.
      if (food.y < this.arena.mouthY) { food.y = this.arena.mouthY; food.vy = Math.max(0, food.vy); }
      return;
    }
    const rx = Math.max(1, this.arena.bodyHalfWidth - radius);
    const ry = Math.max(1, this.arena.bodyHalfHeight - radius);
    const dx = food.x - this.arena.bodyCenterX;
    const dy = food.y - this.arena.bodyCenterY;
    const distance = Math.hypot(dx / rx, dy / ry);
    if (distance <= 1) return;
    food.x = this.arena.bodyCenterX + dx / distance;
    food.y = this.arena.bodyCenterY + dy / distance;
    const normalLength = Math.hypot(dx / (rx * rx), dy / (ry * ry));
    const nx = dx / (rx * rx) / normalLength;
    const ny = dy / (ry * ry) / normalLength;
    const speed = food.vx * nx + food.vy * ny;
    if (speed > 0) {
      const restitution = speed < 45 ? 0 : .18;
      food.vx -= (1 + restitution) * speed * nx;
      food.vy -= (1 + restitution) * speed * ny;
      food.vx *= .88;
      food.spin *= .5;
    }
  }

  private fixedStep(dt: number): void {
    this.elapsedSeconds += dt;
    this.slowRemaining = Math.max(0, this.slowRemaining - dt);
    this.spawnCooldown = Math.max(0, this.spawnCooldown - dt);

    for (const target of [...this.targets]) {
      if (target.state === 'suspended') {
        this.advanceFlight(target, dt);
        if (Math.abs(target.x) > this.arena.halfWidth + 130) {
          this.recycle(target, 'recycle');
        }
        continue;
      }

      const previousX = target.x;
      const previousY = target.y;
      target.vy += GRAVITY * dt;
      target.x += target.vx * dt;
      target.y += target.vy * dt;

      if (previousY < this.arena.mouthY && target.y >= this.arena.mouthY) {
        const crossing = (this.arena.mouthY - previousY) / (target.y - previousY);
        const crossingX = previousX + (target.x - previousX) * crossing;
        if (Math.abs(crossingX - this.arena.mouthX) <= this.arena.mouthHalfWidth) {
          this.food += 1;
          this.collectedFood.push({
            id: target.id, x: crossingX, y: this.arena.mouthY,
            vx: target.vx * .4, vy: Math.min(300, target.vy),
            angle: 0, spin: target.vx * .45, direction: target.vx < 0 ? -1 : 1,
          });
          this.events.push({ kind: 'caught', targetId: target.id, x: crossingX, y: this.arena.mouthY });
          this.recycle(target, 'caught');
          if (this.food >= 5) this.phase = 'success';
          continue;
        }
      }
      if (target.y > this.arena.floorY) {
        this.miss(target);
      }
    }

    this.trySpawnTargets();
    if (this.phase === 'playing' && this.chances <= 0) {
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
    const difficulty = Math.min(1, this.elapsedSeconds / DIFFICULTY_RAMP_SECONDS);
    const count = this.targets.length === 0
      ? 1
      : difficulty < 0.2
        ? 1
        : (this.random() < 0.2 + difficulty * 0.3 ? 2 : 1);
    for (let index = 0; index < count && this.targets.length < MAX_TARGETS; index += 1) {
      const side: -1 | 1 = this.random() < 0.5 ? -1 : 1;
      const burst = this.random() < 0.25 + difficulty * 0.3;
      this.spawnTarget({
        side,
        x: side * (this.arena.halfWidth + 130),
        y: this.arena.flightMinY + this.random() * (this.arena.flightMaxY - this.arena.flightMinY),
        vx: -side * (120 + difficulty * 100 + this.random() * 80),
        burstStartX: burst ? side * this.arena.halfWidth * (0.65 - this.random() * 0.95) : null,
        burstMultiplier: burst ? 1.7 + this.random() * 0.5 + difficulty * 0.3 : 1,
      });
    }
    this.spawnCooldown = Math.max(0.75, 1.65 - difficulty * 0.65);
  }
}
