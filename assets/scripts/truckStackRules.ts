/** Pure, deterministic world-space rules. Coordinates use y up and degrees. */
export const BOX_WIDTH = 276;
export const BOX_HEIGHT = 124;
export const MAX_VISIBLE_BOXES = 18;

export type TruckStackPhase = 'swinging' | 'dropping' | 'settling' | 'falling' | 'failure';
export interface TruckStackBox {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
}
export interface TruckStackActiveBox extends TruckStackBox {
    vx: number;
    vy: number;
}
export interface TruckStackEvent {
    kind: 'land' | 'perfect' | 'failure';
    x: number;
    y: number;
}

const STEP = 1 / 120;
const MAX_FRAME_SECONDS = 0.5;
const GRAVITY = 9000;
const THROW_TRANSFER = 0.35;
const MAX_THROW_SPEED = 400;
const AIR_DRAG = 1.5;
const CORD_LENGTH = 275;
const SWING_REACH = 220;
const DEFAULT_RIG_LIFT = 800;
// A flat 276-wide box retains two units of margin inside the 750-wide playfield.
const MAX_STACK_CENTER = 235;
const SUPPORT_INSET = 6;
const PERFECT_DISTANCE = 12;
const SETTLE_SECONDS = 0.25;
const TIP_SECONDS = 0.2;
const MAX_PENDING_EVENTS = 64;
const EPSILON = 1e-9;
const TAU = Math.PI * 2;

interface TipContact {
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    side: number;
    elapsed: number;
}

/** Treat boxes, activeBox and pivot as read-only view data outside the rules. */
export class TruckStackRound {
    readonly rigLift: number;
    readonly boxes: TruckStackBox[] = [{
        id: 0, x: 0, y: BOX_HEIGHT / 2,
        width: BOX_WIDTH, height: BOX_HEIGHT, angle: 0,
    }];
    activeBox: TruckStackActiveBox | null = null;
    readonly pivot = { x: 0, y: BOX_HEIGHT + DEFAULT_RIG_LIFT };
    phase: TruckStackPhase = 'swinging';
    height = 1;
    slowRemaining = 0;

    private accumulator = 0;
    private previewAccumulator = 0;
    private nextBoxId = 1;
    private swingPhase = 0;
    private swayPhase = 0;
    private swayFactor = 0;
    private readonly restX = new Map<number, number>([[0, 0]]);
    private releaseAngle = 0;
    private swingSpin = 0;
    private releaseSpin = 0;
    private flightDuration = 1;
    private dropElapsed = 0;
    private settleRemaining = 0;
    private fallSide = 1;
    private tip: TipContact | null = null;
    private events: TruckStackEvent[] = [];

    constructor(rigLift = DEFAULT_RIG_LIFT) {
        this.rigLift = Number.isFinite(rigLift)
            ? Math.max(650, Math.min(1100, rigLift)) : DEFAULT_RIG_LIFT;
        this.spawnBox();
    }

    tick(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'failure') return;
        // Discard pathological resume delays instead of accumulating a backlog.
        this.accumulator += Math.min(dt, MAX_FRAME_SECONDS);
        while (this.accumulator + EPSILON >= STEP) {
            this.accumulator = Math.max(0, this.accumulator - STEP);
            this.step(STEP);
        }
    }

    /** Feed preview sways the visible stack and held box; exited live drops stay frozen. */
    tickPreview(dt: number): void {
        if (this.phase !== 'swinging' || !Number.isFinite(dt) || dt <= 0) return;
        this.previewAccumulator += Math.min(dt, MAX_FRAME_SECONDS);
        while (this.previewAccumulator + EPSILON >= STEP) {
            this.previewAccumulator = Math.max(0, this.previewAccumulator - STEP);
            this.swayStack(STEP);
            this.swing(STEP);
        }
    }

    drop(): boolean {
        if (this.phase !== 'swinging' || !this.activeBox) return false;
        this.phase = 'dropping';
        this.previewAccumulator = 0;
        // Keep the displayed pose and carry a controlled portion of its motion.
        this.activeBox.vx = Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, this.activeBox.vx * THROW_TRANSFER));
        this.activeBox.vy = Math.max(-160, Math.min(160, this.activeBox.vy * 0.2));
        this.releaseAngle = this.activeBox.angle;
        this.releaseSpin = this.swingSpin * 0.35;
        this.dropElapsed = 0;
        const gap = Math.max(0, this.activeBox.y - this.top.y - (this.top.height + this.activeBox.height) / 2);
        const vy = this.activeBox.vy;
        this.flightDuration = Math.max(STEP, (vy + Math.sqrt(vy * vy + 2 * GRAVITY * gap)) / GRAVITY);
        return true;
    }

    slowDown(seconds = 20): boolean {
        if (this.phase === 'failure' || !Number.isFinite(seconds) || seconds <= 0) return false;
        // Rewards refresh the effect; repeated callbacks cannot stack minutes of it.
        this.slowRemaining = Math.max(this.slowRemaining, Math.min(seconds, 20));
        if (this.phase === 'swinging') this.swing(0);
        return true;
    }

    revive(): boolean {
        if (this.phase !== 'failure') return false;
        this.events.length = 0;
        this.tip = null;
        this.accumulator = 0;
        this.previewAccumulator = 0;
        this.spawnBox();
        return true;
    }

    drainEvents(): TruckStackEvent[] {
        const events = this.events;
        this.events = [];
        return events;
    }

    private get top(): TruckStackBox {
        return this.boxes[this.boxes.length - 1];
    }

    private get difficulty(): number {
        return Math.max(0, Math.min(1, (this.height - 4) / 16));
    }

    private swayAmplitude(box: TruckStackBox): number {
        // Absolute level survives recycling; changing the score never changes an old box's amplitude.
        const level = Math.round((box.y + box.height / 2) / BOX_HEIGHT);
        if (level <= 4) return 0;
        if (level <= 20) return (level - 4) * 1.75;
        return Math.min(36, 28 + (level - 20) * 0.4);
    }

    private swayStack(dt: number): void {
        const speed = 1.45 + this.difficulty * 0.6;
        this.swayPhase = (this.swayPhase + dt * speed) % TAU;
        let minimumFactor = -1, maximumFactor = 1;
        for (const box of this.boxes) {
            const amplitude = this.swayAmplitude(box);
            if (amplitude === 0) continue;
            const rest = this.restX.get(box.id)!;
            minimumFactor = Math.max(minimumFactor, (-MAX_STACK_CENTER - rest) / amplitude);
            maximumFactor = Math.min(maximumFactor, (MAX_STACK_CENTER - rest) / amplitude);
        }
        // Apply a common wall limit instead of clipping neighbours by different amounts.
        // Recycled constraints can relax; a speed limit makes that release continuous.
        const target = Math.max(minimumFactor, Math.min(maximumFactor, Math.sin(this.swayPhase)));
        const maximumChange = speed * dt;
        this.swayFactor += Math.max(-maximumChange, Math.min(maximumChange, target - this.swayFactor));
        for (const box of this.boxes) {
            const x = this.restX.get(box.id)! + this.swayAmplitude(box) * this.swayFactor;
            box.x = Math.max(-MAX_STACK_CENTER, Math.min(MAX_STACK_CENTER, x));
        }
    }

    private spawnBox(): void {
        const id = this.nextBoxId++;
        this.pivot.y = this.top.y + this.top.height / 2 + this.rigLift;
        this.activeBox = {
            id, x: 0, y: 0, width: BOX_WIDTH, height: BOX_HEIGHT,
            angle: 0, vx: 0, vy: 0,
        };
        this.phase = 'swinging';
        this.swingPhase = id % 2 ? -0.6 : Math.PI - 0.6;
        this.swing(0);
    }

    private step(dt: number): void {
        if (this.phase === 'failure') return;
        const previousTopX = this.top.x;
        this.swayStack(dt);
        switch (this.phase) {
            case 'swinging':
                this.swing(dt);
                break;
            case 'dropping':
                this.fallToTop(dt, previousTopX);
                break;
            case 'settling':
                this.settleRemaining -= dt;
                if (this.settleRemaining <= EPSILON) this.spawnBox();
                break;
            case 'falling':
                this.fallAway(dt);
                break;
        }
        this.slowRemaining = Math.max(0, this.slowRemaining - dt);
        if (this.slowRemaining < EPSILON) this.slowRemaining = 0;
    }

    private swing(dt: number): void {
        if (!this.activeBox) return;
        const lateProgress = Math.max(0, Math.min(1, (this.height - 20) / 20));
        const period = 3.2 - this.difficulty * 1.8 - lateProgress * 0.1;
        const speed = TAU / period * (this.slowRemaining > 0 ? 0.5 : 1);
        this.swingPhase = (this.swingPhase + dt * speed) % TAU;
        const phase = Math.sin(this.swingPhase);
        // Leave room at the sides for the real post-release arc.
        const swingAmplitude = 0.75 + this.difficulty * 0.29;
        const tiltAmplitude = 12 + this.difficulty * 6;
        const angle = phase * swingAmplitude;
        const tilt = phase * tiltAmplitude;
        const tiltRadians = tilt * Math.PI / 180;
        // Lengthen the cord without widening the established horizontal swing.
        const ropeX = Math.sin(angle) * SWING_REACH;
        const ropeY = Math.sqrt(CORD_LENGTH * CORD_LENGTH - ropeX * ropeX);
        // Subtract the rotated top-centre vector from the rope's endpoint.
        // Even at 18 degrees, the outermost corner remains inside x=+/-375.
        this.activeBox.x = this.pivot.x + ropeX + Math.sin(tiltRadians) * BOX_HEIGHT / 2;
        this.activeBox.y = this.pivot.y - ropeY - Math.cos(tiltRadians) * BOX_HEIGHT / 2;
        this.activeBox.angle = tilt;
        const phaseVelocity = Math.cos(this.swingPhase) * speed;
        const tiltAmplitudeRadians = tiltAmplitude * Math.PI / 180;
        const ropeXDerivative = Math.cos(angle) * SWING_REACH * swingAmplitude;
        this.activeBox.vx = phaseVelocity * (ropeXDerivative
            + Math.cos(tiltRadians) * BOX_HEIGHT / 2 * tiltAmplitudeRadians);
        this.activeBox.vy = phaseVelocity * (ropeX / ropeY * ropeXDerivative
            + Math.sin(tiltRadians) * BOX_HEIGHT / 2 * tiltAmplitudeRadians);
        this.swingSpin = phaseVelocity * tiltAmplitude;
    }

    private moveHorizontal(dt: number): void {
        const box = this.activeBox!;
        const decay = Math.exp(-AIR_DRAG * dt);
        box.x += box.vx * (1 - decay) / AIR_DRAG;
        box.vx *= decay;
    }

    private fallToTop(dt: number, previousTopX: number): void {
        const box = this.activeBox;
        if (!box) return;
        this.dropElapsed += dt;
        const progress = Math.min(1, this.dropElapsed / this.flightDuration);
        const eased = progress * progress * (3 - 2 * progress);
        // Carry a little spin, then meet the support level; never snap upright at release.
        box.angle = this.releaseAngle * (1 - eased)
            + this.releaseSpin * this.flightDuration * progress * (1 - progress) * (1 - progress);
        const top = this.top;
        const surface = top.y + top.height / 2;
        const contactY = surface + box.height / 2;
        const nextY = box.y + box.vy * dt - GRAVITY * dt * dt / 2;

        if (box.y >= contactY && nextY <= contactY) {
            // Sweep against the top plane, even if the next position is far below it.
            const distance = box.y - contactY;
            const hitTime = distance === 0 ? 0
                : 2 * distance / (Math.sqrt(box.vy * box.vy + 2 * GRAVITY * distance) - box.vy);
            this.moveHorizontal(hitTime);
            box.y = contactY;
            box.vy -= GRAVITY * hitTime;
            // Interpolate the actual moving support to the swept contact time.
            const supportX = previousTopX + (top.x - previousTopX) * (hitTime / dt);
            const offset = box.x - supportX;
            const overlap = Math.max(0, (box.width + top.width) / 2 - Math.abs(offset));
            if (Math.abs(offset) <= top.width / 2 - SUPPORT_INSET) {
                this.land(surface, Math.abs(offset) <= PERFECT_DISTANCE);
            } else {
                this.beginFall(surface, overlap > 0, supportX);
            }
            return;
        }

        this.moveHorizontal(dt);
        box.y = nextY;
        box.vy -= GRAVITY * dt;
        // A box already below the top cannot later be promoted onto the stack.
        if (box.y < contactY) this.beginFall(surface, false);
    }

    private land(surface: number, perfect: boolean): void {
        const box = this.activeBox!;
        const stable: TruckStackBox = {
            id: box.id, x: box.x, y: box.y,
            width: box.width, height: box.height, angle: 0,
        };
        this.restX.set(box.id, box.x - this.swayAmplitude(stable) * this.swayFactor);
        this.boxes.push(stable);
        if (this.boxes.length > MAX_VISIBLE_BOXES) {
            const removed = this.boxes.splice(0, this.boxes.length - MAX_VISIBLE_BOXES);
            for (const oldBox of removed) this.restX.delete(oldBox.id);
        }
        this.height++;
        this.emit({ kind: 'land', x: box.x, y: surface });
        if (perfect) this.emit({ kind: 'perfect', x: box.x, y: surface });
        this.activeBox = null;
        this.phase = 'settling';
        this.settleRemaining = SETTLE_SECONDS;
        this.pivot.y = this.top.y + this.top.height / 2 + this.rigLift;
    }

    private beginFall(surface: number, hasContact: boolean, supportX = this.top.x): void {
        const box = this.activeBox!;
        this.phase = 'falling';
        this.fallSide = box.x >= supportX ? 1 : -1;
        if (hasContact) {
            const edgeX = supportX + this.fallSide * this.top.width / 2;
            this.tip = {
                x: edgeX, y: surface,
                offsetX: box.x - edgeX, offsetY: box.height / 2,
                side: this.fallSide, elapsed: 0,
            };
            box.vy = 0;
        } else {
            this.tip = null;
        }
    }

    private fallAway(dt: number): void {
        const box = this.activeBox!;
        if (this.tip) {
            const tip = this.tip;
            tip.elapsed = Math.min(TIP_SECONDS, tip.elapsed + dt);
            const progress = tip.elapsed / TIP_SECONDS;
            const angle = -tip.side * progress * progress;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            box.x = tip.x + tip.offsetX * cos - tip.offsetY * sin;
            box.y = tip.y + tip.offsetX * sin + tip.offsetY * cos;
            box.angle = angle * 180 / Math.PI;
            if (tip.elapsed + EPSILON >= TIP_SECONDS) {
                this.tip = null;
                box.vx = this.fallSide * 110;
                box.vy = -110;
            }
        } else {
            this.moveHorizontal(dt);
            box.y += box.vy * dt - GRAVITY * dt * dt / 2;
            box.vy -= GRAVITY * dt;
            box.angle = (box.angle - this.fallSide * 180 * dt) % 360;
        }
        if (box.y < this.top.y + this.top.height / 2 - 720) {
            this.phase = 'failure';
            this.emit({ kind: 'failure', x: box.x, y: box.y });
        }
    }

    private emit(event: TruckStackEvent): void {
        // A neglected renderer must not turn an endless round into an unbounded log.
        if (this.events.length >= MAX_PENDING_EVENTS) this.events.shift();
        this.events.push(event);
    }
}
