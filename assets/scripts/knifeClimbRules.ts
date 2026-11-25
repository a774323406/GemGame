export const KNIFE_STAGES = [
    { name: '烤苕皮', width: 84, height: 188, knifeCount: 12 },
    { name: '苹果', width: 136, height: 142, knifeCount: 22 },
    { name: '西瓜', width: 154, height: 148, knifeCount: 35 },
] as const;
export const KNIFE_COUNT = KNIFE_STAGES[0].knifeCount;
const FOOD_X = -155;
const WAITING_X = -8;
const WALL_EDGE_X = -263;
const EXTENDED_X = WALL_EDGE_X - 32;
const SLIDE_TIME = .18;
const BLADE_SPEED = (WAITING_X - EXTENDED_X) / SLIDE_TIME;
const GRAVITY = 545;
const BOUNCE_SPEED = 692;
const ACTION_SECONDS = 8;
export const bladeY = (index: number): number => -435 + 124 * index;
export const GOAL_Y = bladeY(KNIFE_COUNT - 1) + 96;
const FLAG_LANDING_X = -319;
const FINISH_SPEED = 475;

export interface ClimbBlade {
    x: number;
    state: 'hidden' | 'waiting' | 'sliding' | 'locked';
}

export class KnifeClimbRound {
    phase: 'ready' | 'playing' | 'finishing' | 'failure' | 'success' = 'ready';
    failureReason: 'side' | 'fall' | 'timeout' | null = null;
    foodX = FOOD_X;
    foodY = bladeY(0);
    velocityY = BOUNCE_SPEED;
    cameraHeight = 0;
    landed = 1;
    timeLeft = ACTION_SECONDS;
    speedMultiplier = 1;
    private finishAge = 0;
    private fired = 1;
    readonly stage: typeof KNIFE_STAGES[number];
    readonly goalY: number;
    readonly flagLandingX: number;
    readonly blades: ClimbBlade[];
    lockedCount = 1;
    hitBladeIndex = -1;

    constructor(readonly stageNumber = 1) {
        const stage = KNIFE_STAGES[stageNumber - 1];
        if (!stage) throw new RangeError(`Invalid knife climb stage: ${stageNumber}`);
        this.stage = stage;
        this.goalY = bladeY(stage.knifeCount - 1) + 96;
        this.flagLandingX = Math.max(FLAG_LANDING_X, -375 + stage.width / 2 + 8);
        this.blades = Array.from({ length: stage.knifeCount }, (_, index) => ({
            x: WAITING_X, state: index === 1 ? 'waiting' : 'hidden',
        }));
        this.blades[0] = { x: EXTENDED_X, state: 'locked' };
    }

    start(): void {
        if (this.phase === 'ready') this.phase = 'playing';
    }

    tap(): boolean {
        if (this.phase !== 'playing' || this.fired === this.blades.length) return false;
        this.blades[this.fired++].state = 'sliding';
        if (this.fired < this.blades.length) this.blades[this.fired].state = 'waiting';
        return true;
    }

    slowDown(): void {
        if (this.phase === 'ready' || this.phase === 'playing') this.speedMultiplier *= .72;
    }

    revive(): boolean {
        if (this.phase !== 'failure') return false;
        this.phase = 'playing';
        this.failureReason = null;
        this.hitBladeIndex = -1;
        this.timeLeft = ACTION_SECONDS;
        this.foodX = FOOD_X;
        this.foodY = bladeY(this.landed - 1);
        this.velocityY = BOUNCE_SPEED;
        this.fired = this.landed;
        this.lockedCount = this.landed;
        this.blades.forEach((blade, index) => {
            blade.state = index < this.landed ? 'locked' : index === this.landed ? 'waiting' : 'hidden';
            blade.x = index < this.landed ? EXTENDED_X : WAITING_X;
        });
        this.cameraHeight = this.cameraTarget;
        return true;
    }

    private get cameraTarget(): number {
        // The first two knives stay in view. Higher catches bring the next knife back to the play area.
        return Math.max(0, Math.min(bladeY(this.landed - 1) + 295, this.goalY + 170));
    }

    tick(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0) return;
        let remaining = dt;
        while (remaining > 1e-9 && (this.phase === 'ready' || this.phase === 'playing' || this.phase === 'finishing')) {
            const frame = Math.min(remaining, 1 / 120);
            remaining -= frame;
            const motion = frame * this.speedMultiplier;
            if (this.phase === 'ready') {
                this.move(motion);
            } else if (this.phase === 'finishing') {
                this.advanceBlades(motion);
                this.finishHop(motion);
            } else {
                this.timeLeft = Math.max(0, this.timeLeft - motion);
                if (this.timeLeft < 1e-8) {
                    this.timeLeft = 0;
                    this.fail('timeout');
                } else {
                    this.move(motion);
                }
            }
            this.cameraHeight += (this.cameraTarget - this.cameraHeight) * (1 - Math.exp(-7 * motion));
        }
    }

    advanceHitBlade(dt: number): void {
        if (this.hitBladeIndex < 0) return;
        const blade = this.blades[this.hitBladeIndex];
        blade.x = Math.max(EXTENDED_X, blade.x - BLADE_SPEED * dt);
    }

    private advanceBlades(dt: number): void {
        for (let i = 0; i < this.fired; i++) {
            const blade = this.blades[i];
            if (blade.state !== 'sliding') continue;
            blade.x = Math.max(EXTENDED_X, blade.x - BLADE_SPEED * dt);
            if (blade.x <= EXTENDED_X + 1e-8) {
                blade.x = EXTENDED_X;
                blade.state = 'locked';
                this.lockedCount++;
            }
        }
    }

    private move(dt: number): void {
        const oldY = this.foodY;
        this.foodY += this.velocityY * dt - .5 * GRAVITY * dt * dt;
        this.velocityY -= GRAVITY * dt;
        this.advanceBlades(dt);
        // Check the highest extended blade first. A volley can skip several steps.
        for (let i = this.fired - 1; i >= Math.max(0, this.landed - 1); i--) {
            if (this.blades[i].x > FOOD_X + this.stage.width / 2) continue;
            const top = bladeY(i);
            if (this.velocityY <= 0 && oldY >= top && this.foodY <= top) {
                this.bounceOnBlade(i);
                return;
            }
            if (i >= this.landed && this.foodY < top && this.foodY + this.stage.height > top - 5) {
                this.hitBladeIndex = i;
                // Pin through the body even when contact grazes the stem or bottom edge.
                const bladeCenter = top - 20;
                this.foodY = Math.max(bladeCenter - this.stage.height * .75,
                    Math.min(this.foodY, bladeCenter - this.stage.height * .25));
                this.velocityY = 0;
                this.fail('side');
                return;
            }
        }
        if (this.foodY < -650) this.fail('fall');
    }

    private bounceOnBlade(index: number): void {
        this.foodY = bladeY(index);
        this.velocityY = BOUNCE_SPEED;
        if (index >= this.landed) {
            this.landed = index + 1;
            this.timeLeft = ACTION_SECONDS;
        }
        if (index === this.blades.length - 1 && this.lockedCount === this.blades.length) {
            this.phase = 'finishing';
            this.velocityY = FINISH_SPEED;
            this.finishAge = 0;
        }
    }

    private finishHop(dt: number): void {
        this.finishAge += dt;
        const t = this.finishAge;
        this.foodY = bladeY(this.blades.length - 1) + FINISH_SPEED * t - .5 * GRAVITY * t * t;
        this.velocityY = FINISH_SPEED - GRAVITY * t;
        // Clear the higher ledge before crossing its right-hand edge.
        const across = Math.max(0, Math.min(1, (t - .28) / .75));
        this.foodX = FOOD_X + (this.flagLandingX - FOOD_X) * across * across * (3 - 2 * across);
        if (this.velocityY < 0 && this.foodY <= this.goalY && this.foodX <= WALL_EDGE_X) {
            this.foodX = this.flagLandingX;
            this.foodY = this.goalY;
            this.velocityY = 0;
            this.phase = 'success';
        }
    }

    private fail(reason: 'side' | 'fall' | 'timeout'): void {
        this.phase = 'failure';
        this.failureReason = reason;
    }
}
