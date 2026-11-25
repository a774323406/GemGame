const TOTAL = 18;
export const MARBLE_TARGET = 10;
export const LANE_Y = -45;
// The reference spaces marbles 114 px apart at 126 px/s on a 592 px wide frame.
const PITCH = 144;
const SPEED = 160;
export const LANE_EDGE = 386;
const HIT_RADIUS = 17;
const STROKE_SECONDS = .24;
const CONTACT_SECONDS = STROKE_SECONDS * .18;
const FLIGHT_SECONDS = .48;
const COLUMN_X = [0, -23, 23];

export interface Marble {
    x: number;
    y: number;
    state: 'lane' | 'flying' | 'stored' | 'gone';
    // A ball already past the cue when the preview ends gets one full playable pass.
    recycle: boolean;
    launchX: number;
    slot: number;
    flightAge: number;
}

export class MarbleBottleRound {
    phase: 'playing' | 'success' | 'failure' = 'playing';
    speedMultiplier = 1;
    remaining = TOTAL;
    pocketed = 0;
    private launched = 0;
    private strokeAge = STROKE_SECONDS;
    readonly balls: Marble[] = Array.from({ length: TOTAL }, (_, index) => ({
        x: LANE_EDGE + index * PITCH, y: LANE_Y, state: 'lane', recycle: false,
        launchX: 0, slot: 0, flightAge: 0,
    }));

    static previewX(index: number, elapsed: number): number {
        const x = LANE_EDGE + index * PITCH - elapsed * SPEED;
        if (x >= -LANE_EDGE) return x;
        const loop = TOTAL * PITCH;
        return x + Math.ceil((-LANE_EDGE - x) / loop) * loop;
    }

    startAtPreview(elapsed: number): void {
        this.balls.forEach((ball, index) => {
            ball.x = MarbleBottleRound.previewX(index, elapsed);
            ball.recycle = ball.x < -HIT_RADIUS;
        });
    }

    get cueExtension(): number {
        if (this.strokeAge >= STROKE_SECONDS) return 0;
        const t = this.strokeAge / STROKE_SECONDS;
        return t < .18 ? t / .18 : 1 - (t - .18) / .82;
    }

    strike(): boolean {
        if (this.phase !== 'playing' || this.strokeAge < STROKE_SECONDS || this.launched === MARBLE_TARGET) return false;
        this.strokeAge = 0;
        const hit = this.balls.find(ball => ball.state === 'lane' && Math.abs(ball.x) <= HIT_RADIUS);
        if (!hit) return false;
        hit.state = 'flying';
        hit.launchX = hit.x;
        hit.flightAge = -CONTACT_SECONDS;
        hit.slot = this.launched++;
        this.remaining--;
        return true;
    }

    slowDown(): void {
        if (this.phase === 'playing') this.speedMultiplier *= .72;
    }

    tick(dt: number): void {
        if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
        this.strokeAge = Math.min(STROKE_SECONDS, this.strokeAge + dt);
        for (const ball of this.balls) {
            if (ball.state === 'lane') {
                ball.x -= SPEED * this.speedMultiplier * dt;
                if (ball.x < -LANE_EDGE && ball.recycle) {
                    ball.x += TOTAL * PITCH;
                    ball.recycle = false;
                }
                if (ball.x < -LANE_EDGE) {
                    ball.state = 'gone';
                    this.remaining--;
                }
            } else if (ball.state === 'flying') {
                this.advanceFlight(ball, dt);
            }
        }
        if (this.pocketed === MARBLE_TARGET) this.phase = 'success';
        else if (this.remaining === 0 && this.pocketed === this.launched) this.phase = 'failure';
    }

    private advanceFlight(ball: Marble, dt: number): void {
        ball.flightAge = Math.min(FLIGHT_SECONDS, ball.flightAge + dt);
        if (ball.flightAge <= 0) return;
        const t = ball.flightAge / FLIGHT_SECONDS;
        // Stay centered through the narrow neck, then spread out beneath the closed end.
        const endX = COLUMN_X[ball.slot % 3];
        const endY = 316 - Math.floor(ball.slot / 3) * 23;
        const rise = 1 - (1 - t) * (1 - t);
        ball.y = LANE_Y + (endY - LANE_Y) * rise;
        const mouth = Math.max(0, 1 - (ball.y - LANE_Y) / (20 - LANE_Y));
        const spread = Math.max(0, Math.min(1, (ball.y - 160) / (endY - 160)));
        ball.x = ball.launchX * mouth + endX * spread;
        if (t === 1) {
            ball.state = 'stored';
            this.pocketed++;
        }
    }
}
