export type FoodKind = 'lime' | 'icecream' | 'cake' | 'burger' | 'cola';

export const FOOD_KINDS: readonly FoodKind[] = ['lime', 'icecream', 'cake', 'burger', 'cola'];

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DeliveryTarget extends Rect {
    food: FoodKind;
}

export interface DeliveryWorld {
    targets: DeliveryTarget[];
    guard: Rect;
    wall: Rect;
    bounds: Rect;
    groundY: number;
}

export interface DeliveryTuning {
    speed: number;
    gravity: number;
    radius: number;
    maxFlightSeconds: number;
}

export interface Projectile extends Point {
    vx: number;
    vy: number;
    age: number;
    food: FoodKind;
    deflected: boolean;
}

export type DeliveryEvent =
    | { type: 'delivered'; food: FoodKind; score: number }
    | { type: 'deflected' }
    | { type: 'failed'; reason: 'guard' | 'ground' | 'outside' | 'timeout' }
    | { type: 'won' };

export type DeliveryPhase = 'aiming' | 'flying' | 'delivered' | 'failed' | 'won';

const FIXED_STEP_SECONDS = 1 / 240;
const MAX_TICK_SECONDS = 0.25;
const EPSILON = 1e-9;

function finite(value: number, field: string): number {
    if (!Number.isFinite(value)) throw new Error(`${field} must be finite`);
    return value;
}

function positive(value: number, field: string): number {
    finite(value, field);
    if (value <= 0) throw new Error(`${field} must be positive`);
    return value;
}

function nonNegative(value: number, field: string): number {
    finite(value, field);
    if (value < 0) throw new Error(`${field} must be non-negative`);
    return value;
}

function validatePoint(point: Point, field: string): void {
    finite(point.x, `${field}.x`);
    finite(point.y, `${field}.y`);
}

function validateRect(rect: Rect, field: string): void {
    finite(rect.x, `${field}.x`);
    finite(rect.y, `${field}.y`);
    positive(rect.width, `${field}.width`);
    positive(rect.height, `${field}.height`);
}

function isFoodKind(value: unknown): value is FoodKind {
    return typeof value === 'string' && (FOOD_KINDS as readonly string[]).indexOf(value) >= 0;
}

function validatedOrder(order: readonly FoodKind[]): FoodKind[] {
    if (!Array.isArray(order) || order.length !== FOOD_KINDS.length) {
        throw new Error(`order must contain exactly ${FOOD_KINDS.length} foods`);
    }
    const seen = new Set<FoodKind>();
    for (let index = 0; index < order.length; index += 1) {
        const food = order[index];
        if (!isFoodKind(food)) throw new Error(`order[${index}] is not a valid food`);
        if (seen.has(food)) throw new Error('order must not contain duplicate foods');
        seen.add(food);
    }
    return [...order];
}

function cloneRect(rect: Rect): Rect {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function validateWorld(world: DeliveryWorld): DeliveryWorld {
    if (!world || !Array.isArray(world.targets)) throw new Error('world.targets must be an array');
    if (world.targets.length !== FOOD_KINDS.length) {
        throw new Error(`world.targets must contain exactly ${FOOD_KINDS.length} targets`);
    }
    const targetFoods = new Set<FoodKind>();
    const targets = world.targets.map((target, index) => {
        validateRect(target, `world.targets[${index}]`);
        if (!isFoodKind(target.food)) throw new Error(`world.targets[${index}].food is invalid`);
        if (targetFoods.has(target.food)) throw new Error('world.targets must not contain duplicate foods');
        targetFoods.add(target.food);
        return { ...cloneRect(target), food: target.food };
    });
    validateRect(world.guard, 'world.guard');
    validateRect(world.wall, 'world.wall');
    validateRect(world.bounds, 'world.bounds');
    finite(world.groundY, 'world.groundY');
    return {
        targets,
        guard: cloneRect(world.guard),
        wall: cloneRect(world.wall),
        bounds: cloneRect(world.bounds),
        groundY: world.groundY,
    };
}

function validateTuning(tuning: DeliveryTuning): DeliveryTuning {
    return {
        speed: positive(tuning.speed, 'tuning.speed'),
        gravity: positive(tuning.gravity, 'tuning.gravity'),
        radius: nonNegative(tuning.radius, 'tuning.radius'),
        maxFlightSeconds: positive(tuning.maxFlightSeconds, 'tuning.maxFlightSeconds'),
    };
}

export function segmentRectHit(from: Point, to: Point, rect: Rect, radius = 0): number | null {
    validatePoint(from, 'from');
    validatePoint(to, 'to');
    validateRect(rect, 'rect');
    nonNegative(radius, 'radius');

    let enter = 0;
    let exit = 1;
    for (const axis of ['x', 'y'] as const) {
        const delta = to[axis] - from[axis];
        const min = rect[axis] - radius;
        const size = axis === 'x' ? rect.width : rect.height;
        const max = rect[axis] + size + radius;
        if (Math.abs(delta) < EPSILON) {
            if (from[axis] < min || from[axis] > max) return null;
            continue;
        }
        const a = (min - from[axis]) / delta;
        const b = (max - from[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (enter > exit) return null;
    }
    return enter;
}

export function shuffledFoods(random: () => number = Math.random): FoodKind[] {
    const foods = [...FOOD_KINDS];
    for (let index = foods.length - 1; index > 0; index -= 1) {
        const sample = random();
        finite(sample, 'random()');
        if (sample < 0 || sample >= 1) throw new Error('random() must be in [0, 1)');
        const swapIndex = Math.floor(sample * (index + 1));
        [foods[index], foods[swapIndex]] = [foods[swapIndex], foods[index]];
    }
    return foods;
}

type Collision =
    | { kind: 'correct-target'; time: number }
    | { kind: 'obstacle'; time: number }
    | { kind: 'guard'; time: number }
    | { kind: 'ground'; time: number }
    | { kind: 'outside'; time: number };

function lineCrossingTime(start: number, end: number, boundary: number): number {
    if (Math.abs(end - start) < EPSILON) return 0;
    return Math.max(0, Math.min(1, (boundary - start) / (end - start)));
}

export class FoodDeliveryRound {
    private readonly worldValue: DeliveryWorld;
    private readonly tuningValue: DeliveryTuning;
    private orderValue: FoodKind[];
    private phaseValue: DeliveryPhase = 'aiming';
    private scoreValue = 0;
    private currentIndex = 0;
    private readonly completedValue = new Set<FoodKind>();
    private projectileValue: Projectile | null = null;
    private accumulatedSeconds = 0;

    public constructor(world: DeliveryWorld, tuning: DeliveryTuning, order?: readonly FoodKind[]) {
        this.worldValue = validateWorld(world);
        this.tuningValue = validateTuning(tuning);
        this.orderValue = validatedOrder(order ?? shuffledFoods());
    }

    public get phase(): DeliveryPhase {
        return this.phaseValue;
    }

    public get score(): number {
        return this.scoreValue;
    }

    public get currentFood(): FoodKind | null {
        return this.orderValue[this.currentIndex] ?? null;
    }

    public get order(): readonly FoodKind[] {
        return [...this.orderValue];
    }

    public get completed(): ReadonlySet<FoodKind> {
        return new Set(this.completedValue);
    }

    public get projectile(): Projectile | null {
        return this.projectileValue ? { ...this.projectileValue } : null;
    }

    public shoot(angleDegrees: number, origin: Point): boolean {
        finite(angleDegrees, 'angleDegrees');
        validatePoint(origin, 'origin');
        if (this.phaseValue !== 'aiming') return false;
        const food = this.currentFood;
        if (!food) return false;
        const radians = angleDegrees * Math.PI / 180;
        this.projectileValue = {
            x: origin.x,
            y: origin.y,
            vx: this.tuningValue.speed * Math.cos(radians),
            vy: this.tuningValue.speed * Math.sin(radians),
            age: 0,
            food,
            deflected: false,
        };
        this.accumulatedSeconds = 0;
        this.phaseValue = 'flying';
        return true;
    }

    public tick(deltaSeconds: number): DeliveryEvent[] {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || this.phaseValue !== 'flying') return [];
        this.accumulatedSeconds += Math.min(deltaSeconds, MAX_TICK_SECONDS);
        const events: DeliveryEvent[] = [];
        while (this.accumulatedSeconds + EPSILON >= FIXED_STEP_SECONDS && this.phaseValue === 'flying') {
            this.accumulatedSeconds -= FIXED_STEP_SECONDS;
            events.push(...this.step(FIXED_STEP_SECONDS));
        }
        return events;
    }

    public advanceOrder(): void {
        if (this.phaseValue !== 'delivered') return;
        this.currentIndex += 1;
        this.projectileValue = null;
        this.accumulatedSeconds = 0;
        this.phaseValue = 'aiming';
    }

    public reset(reuseOrder = true, random: () => number = Math.random): void {
        if (!reuseOrder) this.orderValue = validatedOrder(shuffledFoods(random));
        this.phaseValue = 'aiming';
        this.scoreValue = 0;
        this.currentIndex = 0;
        this.completedValue.clear();
        this.projectileValue = null;
        this.accumulatedSeconds = 0;
    }

    private step(stepSeconds: number): DeliveryEvent[] {
        const projectile = this.projectileValue;
        if (!projectile) return [];

        const from = { x: projectile.x, y: projectile.y };
        const to = {
            x: projectile.x + projectile.vx * stepSeconds,
            y: projectile.y + projectile.vy * stepSeconds - 0.5 * this.tuningValue.gravity * stepSeconds * stepSeconds,
        };
        const nextVy = projectile.vy - this.tuningValue.gravity * stepSeconds;
        const collisions = this.collectCollisions(from, to, projectile);
        const collision = collisions.sort((left, right) => {
            const timeDifference = left.time - right.time;
            if (Math.abs(timeDifference) > EPSILON) return timeDifference;
            if (left.kind === 'correct-target') return -1;
            if (right.kind === 'correct-target') return 1;
            return 0;
        })[0];

        projectile.age += stepSeconds;
        if (collision) {
            projectile.x = from.x + (to.x - from.x) * collision.time;
            projectile.y = from.y + (to.y - from.y) * collision.time;
            if (collision.kind === 'correct-target') return this.deliver(projectile.food);
            if (collision.kind === 'obstacle') {
                projectile.deflected = true;
                projectile.vx = -Math.abs(projectile.vx) * 0.2;
                projectile.vy = Math.min(0, nextVy);
                return [{ type: 'deflected' }];
            }
            if (collision.kind === 'guard') return this.fail('guard');
            if (collision.kind === 'ground') return this.fail('ground');
            return this.fail('outside');
        }

        projectile.x = to.x;
        projectile.y = to.y;
        projectile.vy = nextVy;
        if (projectile.age + EPSILON >= this.tuningValue.maxFlightSeconds) return this.fail('timeout');
        return [];
    }

    private collectCollisions(from: Point, to: Point, projectile: Projectile): Collision[] {
        const collisions: Collision[] = [];
        const radius = this.tuningValue.radius;
        const guardHit = segmentRectHit(from, to, this.worldValue.guard, radius);
        if (guardHit !== null) collisions.push({ kind: 'guard', time: guardHit });

        if (!projectile.deflected) {
            for (const target of this.worldValue.targets) {
                const hit = segmentRectHit(from, to, target, radius);
                if (hit === null) continue;
                const correct = target.food === projectile.food && !this.completedValue.has(target.food);
                collisions.push({ kind: correct ? 'correct-target' : 'obstacle', time: hit });
            }
            const wallHit = segmentRectHit(from, to, this.worldValue.wall, radius);
            if (wallHit !== null) collisions.push({ kind: 'obstacle', time: wallHit });
        }

        const bottom = this.worldValue.groundY + radius;
        if (from.y <= bottom) {
            collisions.push({ kind: 'ground', time: 0 });
        } else if (to.y <= bottom) {
            collisions.push({ kind: 'ground', time: lineCrossingTime(from.y, to.y, bottom) });
        }

        const bounds = this.worldValue.bounds;
        const left = bounds.x + radius;
        const right = bounds.x + bounds.width - radius;
        const lower = bounds.y + radius;
        const upper = bounds.y + bounds.height - radius;
        if (from.x < left || from.x > right || from.y < lower || from.y > upper) {
            collisions.push({ kind: 'outside', time: 0 });
        } else {
            if (to.x < left) collisions.push({ kind: 'outside', time: lineCrossingTime(from.x, to.x, left) });
            if (to.x > right) collisions.push({ kind: 'outside', time: lineCrossingTime(from.x, to.x, right) });
            if (to.y < lower) collisions.push({ kind: 'outside', time: lineCrossingTime(from.y, to.y, lower) });
            if (to.y > upper) collisions.push({ kind: 'outside', time: lineCrossingTime(from.y, to.y, upper) });
        }
        return collisions;
    }

    private deliver(food: FoodKind): DeliveryEvent[] {
        if (this.phaseValue !== 'flying' || this.completedValue.has(food)) return [];
        this.completedValue.add(food);
        this.scoreValue = this.completedValue.size;
        const events: DeliveryEvent[] = [{ type: 'delivered', food, score: this.scoreValue }];
        if (this.scoreValue === FOOD_KINDS.length) {
            this.phaseValue = 'won';
            events.push({ type: 'won' });
        } else {
            this.phaseValue = 'delivered';
        }
        return events;
    }

    private fail(reason: 'guard' | 'ground' | 'outside' | 'timeout'): DeliveryEvent[] {
        if (this.phaseValue !== 'flying') return [];
        this.phaseValue = 'failed';
        return [{ type: 'failed', reason }];
    }
}
