export const GOOSE_SLOT_COUNT = 10;
export const TARGET_GOOSE_COUNT = 7;
export const INITIAL_RING_COUNT = 10;
export const AD_RING_COUNT = 5;

export type WhiteGooseRoundStatus = "playing" | "won" | "lost";
export type CatchablePose = "s1" | "s2" | "s3" | "s4";

export interface WhiteGooseSnapshot {
  readonly activeSlots: readonly number[];
  readonly caughtCount: number;
  readonly ringsRemaining: number;
  readonly ringLimit: number;
  readonly status: WhiteGooseRoundStatus;
  readonly throwInFlight: boolean;
}

function requireUnitRandom(randomValue: number): number {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new Error("randomValue must be finite and in [0, 1)");
  }
  return randomValue;
}

export function isCatchSuccessful(
  pose: CatchablePose,
  walking: boolean,
  randomValue: number,
): boolean {
  const roll = requireUnitRandom(randomValue);
  return !walking && pose !== "s1" && roll < 0.7;
}

export class WhiteGooseRound {
  private activeSlots: number[] = [];
  private caughtCount = 0;
  private ringsRemaining = INITIAL_RING_COUNT;
  private ringLimit = INITIAL_RING_COUNT;
  private status: WhiteGooseRoundStatus = "playing";
  private throwInFlight = false;

  public constructor(private readonly random: () => number = Math.random) {
    this.reset();
  }

  public get snapshot(): WhiteGooseSnapshot {
    return {
      activeSlots: this.activeSlots.slice(),
      caughtCount: this.caughtCount,
      ringsRemaining: this.ringsRemaining,
      ringLimit: this.ringLimit,
      status: this.status,
      throwInFlight: this.throwInFlight,
    };
  }

  public reset(): WhiteGooseSnapshot {
    const slots = Array.from({ length: GOOSE_SLOT_COUNT }, (_, index) => index);
    for (let index = slots.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(requireUnitRandom(this.random()) * (index + 1));
      [slots[index], slots[swapIndex]] = [slots[swapIndex], slots[index]];
    }
    this.activeSlots = slots.slice(0, TARGET_GOOSE_COUNT);
    this.caughtCount = 0;
    this.ringsRemaining = INITIAL_RING_COUNT;
    this.ringLimit = INITIAL_RING_COUNT;
    this.status = "playing";
    this.throwInFlight = false;
    return this.snapshot;
  }

  public beginThrow(): boolean {
    if (this.status !== "playing" || this.throwInFlight || this.ringsRemaining <= 0) {
      return false;
    }
    this.ringsRemaining -= 1;
    this.throwInFlight = true;
    return true;
  }

  public resolveThrow(caught: boolean): WhiteGooseSnapshot {
    if (!this.throwInFlight) {
      throw new Error("cannot resolve a throw that is not in flight");
    }
    this.throwInFlight = false;
    if (caught) this.caughtCount = Math.min(TARGET_GOOSE_COUNT, this.caughtCount + 1);
    if (this.caughtCount >= TARGET_GOOSE_COUNT) this.status = "won";
    else if (this.ringsRemaining <= 0) this.status = "lost";
    else this.status = "playing";
    return this.snapshot;
  }

  public grantRings(count: number = AD_RING_COUNT): boolean {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("count must be a positive integer");
    }
    if (this.status === "won") return false;
    this.ringsRemaining += count;
    this.ringLimit += count;
    this.status = "playing";
    this.throwInFlight = false;
    return true;
  }
}
